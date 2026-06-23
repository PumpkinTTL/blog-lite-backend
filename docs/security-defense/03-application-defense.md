# 应用层防御闭环设计

> 本文档定义应用层要做的全部改造，分为 P0（地基）和 P1（闭环）。
> 实现顺序：P0 必须先做，P1 依赖 P0。
> 所有改造向后兼容，不破坏现有业务和配置。

---

## P0：地基修复（限流和黑名单真正生效）

修完 P0，现有的限流配置和黑名单才真正按预期工作。这是整个闭环的前提。

### P0-1：配置 trust proxy + 统一 getClientIp 工具

**目标**：让 `req.ip` 返回真实客户端 IP，而不是 nginx 的 `127.0.0.1`。

#### 改动 1：`main.ts` 加一行

```ts
// 信任 loopback 代理（本机 nginx）。只信任 127.0.0.1/::1，
// 攻击者伪造 X-Forwarded-For 直连时会被忽略，取其真实 IP。
app.set('trust proxy', 'loopback');
```

**为什么是 `loopback` 而不是 `true` 或数字**：
- `true`：信任所有来源的 XFF → 攻击者伪造 XFF 即可绕过
- `1`（数字）：信任最近 1 跳，但不校验来源是不是真的代理
- `loopback`：只信任来自 127.0.0.1/::1 的代理链 → 攻击者直连伪造 XFF 不被信任，取其真实 IP

**部署前提**：nginx 监听 127.0.0.1 转发到 NestJS（标准部署，确认即可）。
**后续上 CDN 时**：需改用 CIDR 白名单 + 处理 CDN 专用头（如 CF 的 `CF-Connecting-IP`），但当前 loopback 足够。

#### 改动 2：新建 `common/utils/client-ip.ts`

```ts
import { Request } from 'express';

/**
 * 统一获取客户端真实 IP。
 * 前提：main.ts 已配置 app.set('trust proxy', 'loopback')，
 *       此时 req.ip 已是经 Express 解析的真实客户端 IP（nginx 追加的 XFF 最右值）。
 *
 * 不再手动读 x-forwarded-for（会被伪造），只信任 req.ip。
 * 'unknown' 仅在极端情况（如 Unix socket 无对端）出现。
 */
export function getClientIp(req: Request): string {
  return req.ip || 'unknown';
}
```

#### 改动 3：替换全项目 6 处旧 IP 取法

| 文件 | 行号 | 旧写法 | 新写法 |
|---|---|---|---|
| `rate-limit.guard.ts` | 44 | `request.ip \|\| request.headers?.[...] \|\| 'unknown'` | `getClientIp(request)` |
| `common/guards/blacklist.guard.ts` | 23-26 | 同上 | `getClientIp(request)` |
| `modules/user/user.controller.ts` | 52,86,106,154 | 同上（4 处）| `getClientIp(req)` |
| `modules/membership/membership.controller.ts` | 121 | 同上 | `getClientIp(req)` |
| `modules/resource/resource.controller.ts` | 134 | 同上 | `getClientIp(req)` |
| `modules/post/post.controller.ts` | 149 | 同上 | `getClientIp(req)` |

**效果**：所有 IP 取法收敛到一个函数，配了 trust proxy 后 `req.ip` 就是真实 IP，伪造 XFF 无效。

---

### P0-2：调整 Guard 顺序（userId 维度限流生效）

**目标**：让 RateLimitGuard 能拿到 `request.user.sub`，按 userId 限流。

#### 冲突分析

当前注释的设计意图是"限流挡在鉴权前，省鉴权开销"。但这与"按 userId 限流"矛盾——要拿 userId 就得先鉴权。

**决策：鉴权优先，限流在后。** 理由：
1. 鉴权（JWT 验签）开销很小（无 DB 查询，纯计算），不构成性能瓶颈
2. userId 维度限流的价值远大于"省一次验签"
3. 鉴权后才能区分"登录用户刷"和"匿名用户刷"，防御更精准

#### 改动：`app.module.ts` 调整声明顺序

```ts
providers: [
  // Guard 执行顺序（APP_GUARD 按声明顺序执行）：
  // 1. 鉴权 → 先挂 req.user，后续 Guard 才能拿到 userId 做精细化限流
  // 2. 限流 → 按 userId（登录）或 IP（匿名）维度，真正生效
  // 3. 黑名单 → IP 维度封禁
  // 4. 角色 → 校验 @Roles('admin')
  { provide: APP_GUARD, useClass: AuthGuard },
  { provide: APP_GUARD, useClass: RateLimitGuard },
  { provide: APP_GUARD, useClass: BlacklistGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
],
```

**效果**：
- `request.user?.sub` 在 RateLimitGuard 里能拿到值
- 登录用户按 `user:{id}` 限流，匿名用户按 `ip:{ip}` 限流
- 代理池刷同一账号 → userId 维度立刻识别

**副作用评估**：
- `@Public()` 接口（登录/注册/验证码）：AuthGuard 放行不挂 user，限流走 IP 维度，行为不变
- 已登录接口：多一次 JWT 验签（微秒级），可忽略

---

### P0-3：Redis 故障 fail-close（不放行）

**目标**：Redis 故障时，限流应该保守拒绝（或降级到本地计数），而不是放行。

#### 改动：`rate-limit.guard.ts` catch 分支

```ts
// 方案：Redis 故障时拒绝（fail-close）
// 代价：Redis 挂了期间所有请求被限流拦（返回 429 或 503）
// 收益：攻击者无法通过打爆 Redis 绕过限流
catch (err) {
  if (err instanceof HttpException) throw err;
  this.logger.error(`Redis 限流计数失败，拒绝请求: ${(err as Error).message}`);
  throw new ServiceUnavailableException('服务暂时不可用，请稍后再试');
}
```

#### 备选方案（二选一，需讨论）

**方案 A：fail-close 拒绝（推荐）**
- Redis 挂了 → 所有请求 503
- 优点：安全，攻击者打爆 Redis 也无法绕过
- 缺点：Redis 真故障时全站不可用（但 Redis 故障本身就是严重事件，宁可全站 503 也别裸奔）

**方案 B：降级到本地内存计数**
- Redis 挂了 → 用进程内 Map 做本地限流（粗粒度）
- 优点：Redis 故障时服务仍可用
- 缺点：多实例下本地计数不准（单实例无此问题）；实现复杂；Redis 故障时攻击窗口仍存在

**决策建议**：单实例部署，选方案 A（fail-close）。Redis 故障极少发生，且 fail-close 的安全收益 > 可用性损失。若未来多实例或对可用性要求高，再考虑方案 B。

---

### P0 验收标准

修完 P0 后，以下行为必须成立：
1. ✅ nginx 反代下，`getClientIp(req)` 返回真实客户端 IP（不是 127.0.0.1）
2. ✅ 攻击者直连伪造 `X-Forwarded-For: 9.9.9.9`，`getClientIp` 返回其真实 IP（XFF 被忽略）
3. ✅ 登录用户请求，限流 key 为 `rl:xxx:user:{id}:window`（不是 ip 分支）
4. ✅ 匿名用户请求，限流 key 为 `rl:xxx:ip:{realip}:window`
5. ✅ Redis 故障时，请求返回 503（不是放行）

---

## P1：闭环建设（自动识别 + 封禁 + 下沉）

P0 让限流和黑名单生效，P1 让它们形成闭环：自动识别恶意行为 → 自动拉黑 → 下沉给 nginx。

### P1-1：失败熔断（兑换码/登录连续失败自动拉黑）

**目标**：挡住"有效 token 阈值内慢刷"——限流挡不住的，靠失败次数累计识别。

#### 设计：Redis 计数 + 阈值拉黑

```ts
// 兑换码失败熔断（伪代码）
async onRedeemFail(userId: number, ip: string, reason: string) {
  const userKey = `risk:redeem:fail:user:${userId}`;
  const ipKey = `risk:redeem:fail:ip:${ip}`;
  const windowSec = 3600; // 1 小时窗口

  const [userCount, ipCount] = await Promise.all([
    this.redis.incr(userKey),
    this.redis.incr(ipKey),
  ]);
  // 首次设过期
  if (userCount === 1) await this.redis.expire(userKey, windowSec);
  if (ipCount === 1) await this.redis.expire(ipKey, windowSec);

  // userId 维度：连续失败 20 次 → 拉黑该用户兑换接口 1 小时
  if (userCount >= 20) {
    await this.banAction('redeem', `user:${userId}`, 3600, '兑换码连续失败');
  }
  // IP 维度：连续失败 50 次 → 拉黑该 IP（下沉 nginx）
  if (ipCount >= 50) {
    await this.banAction('redeem', `ip:${ip}`, 3600, '兑换码连续失败');
    await this.sinkToNginx(ip, 3600);  // 写入 nginx 黑名单 Redis set
  }
}
```

**关键设计**：
- **双维度**（userId + IP）：userId 防代理池，IP 防单机暴力
- **阈值不同**：userId 20 次（账号级，严格），IP 50 次（IP 级，宽松，避免 NAT 误伤）
- **窗口 1 小时**：覆盖慢速爆破的时间跨度
- **成功重置**：兑换成功后清零计数（`DEL`），避免历史失败累积误伤

#### 适用接口

| 接口 | 失败熔断阈值（userId / IP）| 窗口 | 拉黑时长 |
|---|---|---|---|
| 会员码兑换 | 20 次 / 50 次 | 1h | 1h |
| 资源码兑换 | 20 次 / 50 次 | 1h | 1h |
| 登录（密码）| 5 次 / 20 次 | 15min | 15min-1h（递进）|

> 登录已有"5 次失败锁账号"的业务逻辑，这里的熔断是补充 IP 维度（同一 IP 狂试不同账号 = 撞库）。

---

### P1-2：黑名单下沉 Redis 接口（供 nginx 拉取）

**目标**：应用层判定的黑名单写入 Redis，nginx 定时拉取同步到 shared_dict。

#### Redis 数据结构设计

```
# nginx 黑名单 set（IP 维度）
# key: nginx:blacklist:ip
# 类型: SET
# 成员: 被封的 IP
# 应用层 SADD，nginx 定时 SMEMBERS + 差量同步

# 单个 IP 的封禁元信息（TTL = 封禁时长，过期自动解封）
# key: nginx:blacklist:ip:detail:{ip}
# 类型: HASH
# 字段: level(封禁等级), reason, bannedAt
# 应用层 HSET + EXPIRE，nginx 拉取时读 detail 决定是否展示
```

#### 新增服务：`nginx-sink.service.ts`

```ts
@Injectable()
export class NginxSinkService {
  private readonly SET_KEY = 'nginx:blacklist:ip';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** 应用层调用：把 IP 写入 nginx 黑名单 set */
  async sinkIp(ip: string, ttlSec: number, reason: string): Promise<void> {
    const detailKey = `nginx:blacklist:ip:detail:${ip}`;
    const multi = this.redis.multi();
    multi.sadd(this.SET_KEY, ip);
    multi.hset(detailKey, 'reason', reason, 'bannedAt', String(Date.now()));
    multi.expire(detailKey, ttlSec);  // detail 过期 = 自动解封信号
    await multi.exec();
    this.logger.log(`IP ${ip} 已下沉 nginx 黑名单（${ttlSec}s, ${reason}）`);
  }

  /** nginx 调用：拉取当前黑名单全量 + 各自剩余 TTL */
  async getBlacklistForNginx(): Promise<Array<{ ip: string; ttl: number }>> {
    const ips = await this.redis.smembers(this.SET_KEY);
    // 并发查每个 detail 的 TTL，过滤已过期的
    const result = await Promise.all(
      ips.map(async (ip) => {
        const ttl = await this.redis.ttl(`nginx:blacklist:ip:detail:${ip}`);
        return { ip, ttl };
      }),
    );
    // 清理已过期的 IP（detail 没了但还在 set 里）
    const expired = result.filter((r) => ttl < 0).map((r) => r.ip);
    if (expired.length > 0) {
      await this.redis.srem(this.SET_KEY, ...expired);
    }
    return result.filter((r) => r.ttl > 0);
  }
}
```

#### nginx 拉取接口（HTTP，仅本机 nginx 调用）

```
GET /api/internal/nginx-blacklist
Authorization: Bearer <NGINX_SINK_TOKEN>   # 环境变量配置的内部 token
Host: 127.0.0.1

响应：[{ "ip": "1.2.3.4", "ttl": 3500 }, ...]
```

- 路由不走 Guard 链（`@Public()` + 内部 token 校验），避免 Guard 开销
- nginx 用 lua 每 5-10 秒拉一次，写入 shared_dict
- 详见 `04-nginx-sink.md`

---

### P1-3：自动封禁递进惩罚

**目标**：累犯加重惩罚，但不永久封（IP 会流转，永久封会误伤后续正常用户）。

#### 递进规则

| 级别 | 触发条件 | 封禁时长 |
|---|---|---|
| 1 | 首次自动拉黑 | 10 分钟 |
| 2 | 解封后 24h 内再犯 | 1 小时 |
| 3 | 解禁后 7 天内再犯 | 24 小时 |
| 4 | 屡教不改 | 7 天（仍带过期，永不"永久"）|

#### 实现思路

```ts
// 用 Redis 记录"历史封禁等级"，递增
const levelKey = `nginx:blacklist:level:${ip}`;
const level = await this.redis.incr(levelKey);
await this.redis.expire(levelKey, 7 * 24 * 3600); // 7 天滚动窗口

const ttlByLevel = [0, 600, 3600, 86400, 604800]; // 索引即等级
const ttl = ttlByLevel[Math.min(level, 4)];
await this.sinkIp(ip, ttl, `自动封禁 L${level}`);
```

- `level` key 带 7 天 TTL，7 天不犯则重置到 0（宽大处理）
- 每次拉黑时 `INCR level`，按等级查封禁时长表

---

### P1-4：清理 blacklist 模块遗留

- `blacklist.entity.ts` 的 `type='user'` 已不被任何 Guard 查询
- `blacklist.service.ts` 的 `isBlocked('user', ...)` 是死代码
- **处理**：保留实体（向后兼容历史数据），但在 `isBlocked` 加 deprecation 注释，新代码不再用 `type='user'`。用户封禁统一走 `user.status` + `banned_until`。

---

## P1 验收标准

1. ✅ 兑换码连续失败达阈值 → 自动写入 Redis 黑名单 + 下沉 nginx set
2. ✅ nginx 调用 `GET /api/internal/nginx-blacklist` 能拿到当前黑名单 + TTL
3. ✅ 累犯封禁时长递进（10min → 1h → 24h → 7d）
4. ✅ 封禁到期后 IP 自动从 set 移除（Redis TTL 过期）
5. ✅ 兑换成功后失败计数清零

---

## 改动文件清单（预估）

| 文件 | 改动类型 | 优先级 |
|---|---|---|
| `main.ts` | 加 trust proxy + helmet | P0 |
| `common/utils/client-ip.ts` | 新建 | P0 |
| `rate-limit.guard.ts` | 改 IP 取法 + fail-close | P0 |
| `common/guards/blacklist.guard.ts` | 改 IP 取法 | P0 |
| `app.module.ts` | 调 Guard 顺序 | P0 |
| `user.controller.ts` | 改 IP 取法（4 处）| P0 |
| `membership.controller.ts` | 改 IP 取法 + 失败熔断调用 | P0 + P1 |
| `resource.controller.ts` | 改 IP 取法 + 失败熔断调用 | P0 + P1 |
| `post.controller.ts` | 改 IP 取法 | P0 |
| `modules/security/` | 新建模块（熔断 + 下沉服务）| P1 |
| `nginx-sink.controller.ts` | 新建（内部接口）| P1 |

**P0 改动**：约 8 个文件，改动量小（主要是 IP 取法统一 + Guard 顺序 + fail-close）。
**P1 改动**：新增 1 个模块 + 2-3 个文件，改动量中等。
