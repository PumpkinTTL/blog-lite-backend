# 第十二轮代码审计与优化（R12）

> 日期：2026-06-28
> 范围：逻辑漏洞修复 + 性能优化 + 上线配置加固（数据一致性 / 时区 / 安全头 / 健康检查）
> 重点：上线前最后的逻辑正确性与配置兜底

---

## 审计结论

经配置审计 + 逻辑审计两轮深度扫描，发现 **5 个数据一致性 bug**（已在代码层修复）+ 多项配置加固项。修复后代码逻辑健壮性达标，可上线。

## 本轮修复项

### 严重（数据不一致）— 已全部修复

| # | 问题 | 修复 | 文件 |
|---|------|------|------|
| C1 | 批量删用户未清理关联数据（裸 delete），导致 interactions/code_usage_logs 孤儿 + 计数虚高 | 抽 `cleanupUserBeforeDelete` 公共方法，remove 和 batchRemove 共用，事务内清理 interactions/memberships/code_usage_logs + 回算计数 | `user.service.ts` |
| C2 | 删用户漏同步 commentCount（comments 因 CASCADE 被删但冗余计数未回算） | cleanupUserBeforeDelete 内收集用户评论涉及的 post，删后重算 commentCount | `user.service.ts` |
| H1 | 点赞/收藏计数可能变负数（并发/历史漂移） | `${field} + ${delta}` → `GREATEST(0, ${field} + ${delta})` 防下溢 | `post.controller.ts` |
| H3 | 可对软删除文章评论/点赞（comment.create 未校验 deletedAt） | 评论创建 + 点赞校验加 `deletedAt: IsNull()`；新增 `findByIdRaw` 轻量校验 | `comment.service.ts` + `post.service.ts` + `post.controller.ts` |

### 中危（性能/正确性）— 已修复

| # | 问题 | 修复 | 文件 |
|---|------|------|------|
| M6 | 时区未统一（Node UTC vs MySQL +08:00），会员到期时间偏移、dashboard 趋势图错位 | TypeORM 加 `timezone: '+08:00'` | `app.module.ts` |
| 连接池 | 默认 connectionLimit:10，突发并发可能排队超时 | 显式配 `extra: { connectionLimit:20, waitForConnections:true, connectTimeout:10000 }` | `app.module.ts` |

### 配置加固 — 已修复

| # | 问题 | 修复 | 文件 |
|---|------|------|------|
| 安全头 | 无 X-Content-Type-Options/X-Frame-Options 等基础安全头 | 加安全头中间件（等价 helmet 核心功能，无需额外依赖）：nosniff/SAMEORIGIN/XSS-Protection/Referrer-Policy/HSTS(HTTPS时) | `main.ts` |
| 健康检查 | 无 /health 端点，LB/K8s 探针无法判断进程就绪 | 注册 Express 原生 `/health` 路由（不走守卫链），返回 `{status:"ok",timestamp}` | `main.ts` |
| 环境变量文档 | .env.example 只有 SMTP 4 行，运维不知要配哪些变量 | 补全全部必需变量（DB/Redis/Auth/CORS/TTL/R2/AI 等），含生产值建议 | `.env.example` |

## 验证结果

| 检查项 | 结果 |
|--------|------|
| 后端 `tsc --noEmit` | ✅ |
| 后端 `nest build` | ✅ |
| `/health` 端点 | ✅ 200 + `{status:"ok",timestamp:...}` |
| 安全头 | ✅ X-Content-Type-Options/X-Frame-Options/X-XSS-Protection/Referrer-Policy 全部设置 |
| HSTS | ✅ HTTPS 时自动启用（HTTP 不设，符合预期） |

## 未修项（已知限制 / 部署运维项）

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| - | 兑换码 useCode 与 grant 跨事务（TOCTOU） | 中 | grant 内已有事务二次校验兜底，降级场景已 preCheck 拦截。修复需重构事务边界，风险 > 收益，上线后优化 |
| - | 备份全量读入内存（dumpDatabase buffer） | 中 | 大库备份时 OOM 风险。建议改流式管道，或备份放独立容器 |
| - | sweepExpired 全表加载到内存 | 中 | 用户量增长后内存压力。建议下推 SQL `WHERE expiresAt < NOW()`，上线后用户量大时优化 |
| - | settings 无缓存 | 低 | 每次读打 DB。建议加 Redis 缓存，上线后按需优化 |

## ⚠️ 上线前运维 checklist（代码侧无法完成）

> 这些是**部署时必须做**的运维动作，不是代码问题：

1. **生产 .env 重建**（当前是 dev 配置）：
   - `NODE_ENV=production`
   - `DB_SYNCHRONIZE=false`（双保险：NODE_ENV=production 时代码已强制压成 false）
   - `DB_USERNAME/PASSWORD` 用最小权限账号 + 强密码（非 root/root）
   - `REDIS_PASSWORD` 设置
   - `CORS_ORIGINS` 改真实域名
   - `LOG_LEVEL=info` 或 `warn`
2. **admin 前端 .env**：`VITE_API_BASE_URL` 改生产域名（当前 localhost:5200，生产必瘫痪）
3. **改默认管理员密码**（admin123 → 强密码）
4. **轮换 9router API key**（历史明文已泄漏）
5. **限流/黑名单下沉 openresty**：应用层的 RateLimitGuard 保留兜底，主力交给网关层动态黑名单
6. **确认 SMTP/R2/支付密钥用环境变量**（不写 settings 表）

## 与 R10/R11 的关系

- **R10**：邮箱登录修复 + 表单校验 + PII 泄漏 + 死代码清理（已完成）
- **R11**：敏感接口安全审计（无高危阻断项，已确认）
- **R12（本轮）**：逻辑漏洞修复 + 性能优化 + 配置加固（已完成）

三轮（R10-R12）构成完整的上线前深度优化闭环。
