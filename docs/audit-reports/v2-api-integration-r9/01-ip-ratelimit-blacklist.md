# R9 IP获取/双层限流/自动拉黑 实现详情

## 1. trust proxy（根因修复）

**文件**：`main.ts`

```ts
app.set('trust proxy', configService.get<string>('TRUST_PROXY', 'loopback'));
```

**原理**：Express 默认 `trust proxy=false`，nginx 后 `req.ip` 返回的是 TCP 对端（nginx 内网 IP），
导致限流/黑名单的 IP 维度全员串号。设置后 Express 自动解析 `X-Forwarded-For`。

- `TRUST_PROXY=loopback`（默认）：信任本机 nginx（开发/单机部署）
- `TRUST_PROXY=2`：信任 2 跳代理（CDN + nginx）
- `TRUST_PROXY=具体IP段`：只信任指定代理

## 2. 统一 getClientIp 工具

**文件**：`common/utils/get-client-ip.ts`（新建）

替代之前散落在 6 处的 `req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown'`。

关键改进：
- trust proxy 生效时直接用 `req.ip`（Express 已解析）
- 兜底手动解析 XFF **首段**（`split(',')[0].trim()`），而不是 `.toString()` 取整串
  （整串会污染限流 key 和黑名单 value）
- 内网回环兜底：本地开发场景 req.ip 可能是 127.0.0.1，仍返回（不误判）

替换位置：
- rate-limit.guard.ts（限流 IP 维度）
- blacklist.guard.ts（黑名单拦截）
- user.controller.ts ×4（login/register/clientLogin/loginByCode 的 clientIp）
- post.controller.ts（浏览量记录）
- membership.controller.ts（兑换记录）
- resource.controller.ts（兑换记录）

## 3. 双层限流架构

**问题**：原 RateLimitGuard 排在 AuthGuard 之前（挡洪水），但 `request.user?.sub` 恒 undefined，
用户维度限流（`user:<id>`）形同虚设。

**方案**：拆成两个 Guard，各司其职：

| Guard | 执行时机 | 维度 | 职责 |
|-------|---------|------|------|
| RateLimitGuard | 鉴权前（第1层） | IP | 挡匿名洪水，违规累计自动拉黑 |
| RateLimitUserGuard | 鉴权后（第3层） | user id | 挡已登录用户刷接口 |

两者共用同一套 routeKey 和阈值配置，但 Redis key 前缀不同（`rl:` vs `rlu:`）避免互相干扰。

Guard 顺序（app.module.ts）：
```
1. RateLimitGuard（IP限流）
2. AuthGuard（鉴权，挂 req.user）
3. RateLimitUserGuard（用户限流）
4. BlacklistGuard（黑名单兜底）
5. RolesGuard（角色校验）
```

## 4. 限流→自动拉黑联动

**文件**：`rate-limit.guard.ts` maybeAutoBan()

**机制**：
- 触发 429 时，用独立 Redis key `rl:violation:{ip}` 累计违规次数
- 窗口 10 分钟（VIOLATION_WINDOW_SEC=600）
- 达阈值 5 次（VIOLATION_THRESHOLD=5）→ 自动调 BlacklistService.create 写黑名单
- 拉黑时长 30 分钟（AUTO_BAN_DURATION_MIN=30）
- reason 标注「系统自动：限流违规累计 N 次...」便于管理员在后台识别（区别于手动拉黑）
- 已在黑名单的 IP 不重复写入（isBlocked 兜底 + 避免刷表）
- 拉黑后清零违规计数（重新计数从解封后开始）
- 自动拉黑失败不阻断 429（拉黑是增强防御，DB 故障不影响限流主流程）

**阈值常量**（rate-limit.guard.ts）：
```ts
const VIOLATION_THRESHOLD = 5;     // 10分钟内触发限流5次
const VIOLATION_WINDOW_SEC = 600;  // 违规计数窗口
const AUTO_BAN_DURATION_MIN = 30;  // 自动拉黑时长
```
后续可下沉到 settings 表由 GUI 配置。

**验证**：Redis 逻辑测试，违规计数 1→2→3→4→5（达阈值）→清零，闭环正确。

## 黑名单记录区分

| 来源 | creatorId | reason 前缀 |
|------|-----------|------------|
| 管理员手动 | admin userId | 管理员填写 |
| 系统自动 | null（省略） | "系统自动：限流违规累计..." |

管理员在后台黑名单页可看到两者，手动解除系统自动拉黑的记录即可解封。
