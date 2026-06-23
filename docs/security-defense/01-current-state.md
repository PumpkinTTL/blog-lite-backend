# 现状代码审计

> 本文档记录当前（2026-06-24）防御相关代码的实际状态，作为后续改造的基线。
> 所有结论带文件路径和行号，可直接定位。

---

## 1. 限流模块（rate-limit）

### 1.1 配置服务 — `rate-limit-config.service.ts`

- 配置真相源：`settings` 表（`group = 'rate_limit'`），启动时 `load()` 读进内存
- Guard 每请求读内存（`getRule()`，零开销），GUI 可热更新（`saveConfig()` 写库 + reload）
- **全局默认**（fallback）：`{ limit: 100, ttl: 60000 }`（line 19）— 100 次/分钟
- **敏感接口默认**（`SENSITIVE_DEFAULTS`, lines 22-36）：

| routeKey | label | limit | ttl |
|---|---|---|---|
| `UserController.login` | 登录 | 5 | 60s |
| `UserController.register` | 注册 | 5 | 60s |
| `UserController.clientLogin` | 客户端登录 | 5 | 60s |
| `UserController.sendLoginCode` | 发送登录验证码 | 3 | 60s |
| `UserController.loginByCode` | 验证码登录 | 5 | 60s |
| `UserController.sendResetCode` | 发送重置密码验证码 | 3 | 3600s |
| `UserController.resetPasswordByCode` | 验证码重置密码 | 5 | 3600s |
| `UserController.sendChangeEmailCode` | 发送换绑邮箱验证码 | 3 | 60s |
| `UserController.changeEmail` | 邮箱换绑 | 5 | 3600s |
| `CommentController.create` | 发表评论 | 10 | 60s |
| `MembershipController.redeem` | 会员码兑换 | 10 | 60s |
| `ResourceController.redeem` | 资源码兑换 | 10 | 60s |

**现状评价**：配置机制完善（DB 持久化 + 内存缓存 + GUI 热更新），阈值合理。问题不在配置，在 Guard 执行。

### 1.2 限流 Guard — `rate-limit.guard.ts`

```ts
// line 41-44：tracker 维度判定
const userId = request.user?.sub;
const tracker = userId
  ? `user:${userId}`
  : `ip:${request.ip || request.headers?.['x-forwarded-for']?.toString() || 'unknown'}`;
```

**🔴 缺陷 1：userId 维度永远不生效**
- `request.user` 由 AuthGuard 挂载，但 RateLimitGuard 在 AuthGuard **之前**执行（见 §3）
- 所以 `request.user?.sub` 永远是 `undefined`，tracker 永远走 `ip:` 分支
- 后果：**已登录用户也按 IP 限流**，代理池刷接口完全绕过 userId 维度

**🔴 缺陷 2：IP 取法错误**
- `request.ip` 在未配 trust proxy 时 = TCP 直连对端 = nginx 的 IP = `127.0.0.1`（永远固定）
- `127.0.0.1` 是真值，`||` 后面的 XFF 兜底**永远走不到**
- 后果：**所有请求的限流 key 都是 `rl:xxx:ip:127.0.0.1:window`**，全站共享一个限流桶，一个用户刷爆全站被 429

**🔴 缺陷 3：Redis 故障 fail-open**
```ts
// line 68-72
catch (err) {
  if (err instanceof HttpException) throw err;
  this.logger.warn(`Redis 限流计数失败，放行: ${(err as Error).message}`);
  // 注意：没有 return false，默认放行
}
```
- Redis 报错（非限流触发的 HttpException）时**静默放行**
- 后果：攻击者打爆 Redis 连接（或 Redis 自然故障）→ 全局限流失效 → 无限刷

### 1.3 Redis 计数逻辑（line 52-67）

```ts
const count = await this.redis.incr(key);
if (count === 1) {
  await this.redis.expire(key, windowSec);  // 仅首次设过期
}
if (count > rule.limit) {
  throw new HttpException(..., 429);
}
```

**现状评价**：固定窗口算法（key 带 `floor(now/windowSec)`），INCR + 首次 EXPIRE 原子性够用。逻辑本身没问题，问题在上述三个缺陷。

---

## 2. 黑名单模块（blacklist）

### 2.1 实体 — `blacklist.entity.ts`

- 表 `blacklists`，字段：`type`（`ip` | `user`）/ `value` / `reason` / `status`（`active` | `expired`）/ `expiresAt`（null=永久）/ `creatorId`
- `type+value` 唯一索引（line 16）

**⚠️ 注意**：`type='user'` 的记录目前**已不再被任何 Guard 查询**（见 §2.3），用户封禁已迁移到 `user.status` + `banned_until`。`type='user'` 的黑名单记录成了历史遗留数据。

### 2.2 服务 — `blacklist.service.ts`

```ts
// line 106-134：isBlocked 带 30s 内存缓存
async isBlocked(type: string, value: string): Promise<boolean> {
  // 命中条件：status=active 且（expiresAt 为 null 或未过期）
  // 带 30s Map 缓存，避免每请求查库
  // 过期记录惰性修正为 expired
}
```

**现状评价**：判定逻辑正确，缓存机制合理。但有两个问题：
- **🔴 缺陷 4：无自动写入**：`create()` 只被管理端 controller 调用（人工操作），**没有任何代码自动调用 create 拉黑**。限流超限、兑换失败、登录失败都不会自动进黑名单。
- **🟡 遗留**：`type='user'` 的 isBlocked 查询仍保留，但已无 Guard 调用，是死代码。

### 2.3 IP 黑名单 Guard — `common/guards/blacklist.guard.ts`

```ts
// line 22-32
const ip = request.ip || request.headers?.['x-forwarded-for']?.toString() || 'unknown';
if (ip && ip !== 'unknown') {
  const ipBlocked = await this.blacklistService.isBlocked('ip', ip);
  if (ipBlocked) throw new ForbiddenException('您的访问已被限制');
}
```

**🔴 缺陷 5：IP 取法错误**（同限流 Guard）
- `request.ip` = `127.0.0.1`（nginx 反代 + 无 trust proxy）
- 后果：黑名单查的是 `isBlocked('ip', '127.0.0.1')`，要么全站被封要么全站放行，IP 黑名单形同虚设

**🟡 遗留**：注释（line 9-13）说明用户维度封禁已迁移到 `user.status` + `banned_until`，由 AuthGuard 拦截。本 Guard 只查 IP。

---

## 3. Guard 链执行顺序 — `app.module.ts`（line 36-59）

```ts
providers: [
  // 1. 限流 → 先挡洪水流量
  { provide: APP_GUARD, useClass: RateLimitGuard },
  // 2. 鉴权 → 校验 token，挂 req.user
  { provide: APP_GUARD, useClass: AuthGuard },
  // 3. 黑名单 → 读 req.user.sub + IP，命中封禁抛 403
  { provide: APP_GUARD, useClass: BlacklistGuard },
  // 4. 角色 → 校验 @Roles('admin')
  { provide: APP_GUARD, useClass: RolesGuard },
],
```

**🔴 缺陷 6：Guard 顺序导致 userId 限流失效**
- NestJS 的 `APP_GUARD` 按**声明顺序**执行
- RateLimitGuard 在第一位，此时 `request.user` 还没被 AuthGuard（第二位）挂载
- 所以 RateLimitGuard 里 `request.user?.sub` 永远 undefined
- **这是 §1.2 缺陷 1 的根因**

**设计意图冲突**：注释说"先挡洪水流量"，意图是限流挡在鉴权前省开销。但这与"按 userId 限流"矛盾——要拿 userId 就得先鉴权。必须二选一。

---

## 4. IP 获取方式（全项目统一模式）

共 6 处，全部是同一个错误写法：

```ts
req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown'
```

| 文件 | 行号 | 用途 |
|---|---|---|
| `rate-limit.guard.ts` | 44 | 限流 tracker |
| `common/guards/blacklist.guard.ts` | 23-26 | IP 黑名单判定 |
| `modules/user/user.controller.ts` | 52,86,106,154 | 登录/注册/验证码登录（传给 service 派生 deviceId）|
| `modules/membership/membership.controller.ts` | 121 | 兑换 |
| `modules/resource/resource.controller.ts` | 134 | 兑换 |
| `modules/post/post.controller.ts` | 149 | 互动 |

**🔴 缺陷 7：trust proxy 未配置**
- `main.ts` 全文无 `app.set('trust proxy', ...)`
- 后果：`req.ip` = nginx IP = `127.0.0.1`，XFF 兜底永远走不到
- 即使走到 XFF 兜底，`x-forwarded-for` 被无条件信任，可被客户端伪造

---

## 5. 安全中间件现状 — `main.ts`

| 中间件 | 状态 | 说明 |
|---|---|---|
| `helmet` | ❌ 未启用 | 缺基础安全响应头 |
| `cors` | ✅ 启用 | origin 从 `CORS_ORIGINS` 环境变量读，`credentials: true` |
| `compression` | ❌ 未启用 | 无 gzip（nginx 层做即可）|
| `cookie-parser` | ❌ 未启用 | 暂不需要（token 走 header）|
| body size 限制 | ✅ 10MB（`BODY_LIMIT` 可调）| 偏大，敏感接口可收紧 |
| ValidationPipe | ✅ whitelist + forbidNonWhitelisted + transform | 完善 |

---

## 6. 邮箱验证码（独立二级防护）— `email-code.service.ts`

已在 R4 完成优化，作为限流之外的第二道防线：
- **发送冷却**：`SET NX PX` 原子，同一邮箱 60 秒只能发一次（`SEND_COOLDOWN`）
- **有效期**：10 分钟（`CODE_TTL`）
- **最大尝试**：5 次（`MAX_ATTEMPTS`），`HINCRBY` 原子自增，超限删 key
- **存储**：Redis hash（多实例安全）

**现状评价**：完善，无需改动。是限流之外的有效补充。

---

## 7. 兑换码接口（穷举型，最危险）— `membership.controller.ts` / `resource.controller.ts`

- 均为 `@Roles()`（需登录），受 RateLimitGuard 保护（10 次/60s）
- 兑换码消费有事务扣减 `usedCount` + 归属校验（`claimedUserId`）
- **🟡 缺陷 8：无失败熔断**：兑换失败（码无效/已用/过期）不会累计计数，攻击者只要卡在限流阈值内（每分钟 9 次），可以无限慢速爆破兑换码
- **🟡 缺陷 9：兑换码强度未知**：需确认兑换码生成长度和字符空间，若太短（如 6 位纯数字）爆破成本极低

---

## 缺陷汇总

| # | 缺陷 | 位置 | 优先级 |
|---|---|---|---|
| 1 | userId 维度限流不生效（Guard 顺序）| app.module.ts:43-46 | **P0** |
| 2 | IP 取法错误（req.ip = 127.0.0.1）| rate-limit.guard.ts:44 + 全局 6 处 | **P0** |
| 3 | Redis 故障 fail-open | rate-limit.guard.ts:68-72 | **P0** |
| 4 | 无自动拉黑机制 | blacklist 全模块 | P1 |
| 5 | IP 黑名单 Guard IP 取错 | blacklist.guard.ts:23-26 | **P0**（同缺陷 2）|
| 6 | Guard 顺序（缺陷 1 根因）| app.module.ts:43-58 | **P0** |
| 7 | trust proxy 未配 | main.ts | **P0** |
| 8 | 兑换码无失败熔断 | membership/resource 业务逻辑 | P1 |
| 9 | 兑换码强度需确认 | code 生成逻辑 | P1（调研）|

**P0 三件套（缺陷 1/2/3/5/6/7 本质是 3 件事）**：
1. trust proxy 配置 + 统一 getClientIp（修缺陷 2/5/7）
2. Guard 顺序调整（修缺陷 1/6）
3. Redis fail-close（修缺陷 3）

修完 P0，限流和黑名单才真正生效，闭环地基才成立。
