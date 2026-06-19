# Backend API 全面代码扫描报告（含 Agent 扫描结果）

> 日期：2026-06-19
> 范围：`backend/api/src`（NestJS + TypeORM + MySQL + Redis，143 ts 文件，22 模块）
> 方法：人工逐模块审查 + 3 个 Agent 并行扫描

## 已修复问题汇总（14 项）

### P0 — 严重（安全/数据正确性）✅ 全部修复

| ID | 模块 | 问题 | 修复 |
|----|------|------|------|
| P0-1 | auth | 禁用用户 Token 仍有效（不校验 status） | getUserRoles join users 表，status≠'active' 拒绝 |
| P0-2 | media | 路径穿越（app/folder 可 `../` 逃逸 uploads 目录） | storage.provider startsWith 边界检查 + dto @Matches 白名单 |
| P0-3 | post | 点赞/收藏计数非原子（toggle→count→update 无事务） | dataSource.transaction 包裹 count+update |
| P0-4 | donation | 统计 SQL 类型错误（status:1 应为 'confirmed'，CASE WHEN 拼接注入风险） | 参数绑定 + 字符串值 |
| P0-5 | ai-provider | API Key 明文返回前端（接口泄漏完整 key） | controller 层 maskApiKey 脱敏 |
| P0-6 | setting | 系统设置变更无审计日志（敏感配置无痕修改） | 注入 AuditLogService，所有写操作记录 diff |

### P1 — 重要（功能/性能）✅ 全部修复

| ID | 模块 | 问题 | 修复 |
|----|------|------|------|
| P1-1 | post | getVisibilityMap 假批量（N+1，50次查询） | EntityVisibilityService.getVisibilityBatch 真批量 |
| P1-2 | user | register 事务内调外部 HTTP（连接池耗尽风险） | issueToken 移到事务外 |
| P1-3 | user | 邀请码并发超发 | 条件更新 WHERE usedCount<maxUses |
| P1-4 | ai | SSE 客户端断开未销毁上游流（浪费 token） | trackConnectionClose + res.on('close') |
| P1-5 | media | batchRemove 串行删存储 | Promise.all 并行 |
| P1-6 | post | batchUpdateStatus 串行 update | 批量 WHERE IN |
| P1-7 | code | creatorId 取 user.id（恒 undefined，应为 user.sub） | 改用 user.sub |
| P1-8 | ai-conversation | compactedAt 更新条件恒 false（先赋值再比较） | 赋值前记旧值比较 |

### P2 — 次要 ✅ 已修复

| ID | 模块 | 问题 | 修复 |
|----|------|------|------|
| P2-1 | email-code | 验证码 attempts 计数顺序错（多给1次+显示负数） | 先判 >= MAX 再自增 |
| P2-2 | user | register issueToken 失败无友好提示 | try-catch 返回明确错误 |
| P2-3 | 多模块 | 死代码清理 | 删 summarizeHistory/invalidateConfigCache/findByUsername/getReplyCounts/updateByKey |

---

## 已知但保留的问题（评估后可接受）

| ID | 模块 | 问题 | 保留理由 |
|----|------|------|----------|
| P2-4 | post | recordView 去重竞态 | viewCount 仅展示，影响低 |
| P2-5 | post | onModuleInit 每次启动查不存在的旧表 | 迁移代码，catch 静默可接受 |
| P2-6 | media | 上传用扩展名非 magic number 校验 | controller 有白名单+大小限制，admin-only |
| P2-7 | donation | DTO status @IsIn([0,1,2]) 与 entity varchar 冲突 | 需与前端联调统一，单独处理 |
| P2-8 | interaction | userRepo 注入未使用 | 低优先级，不影响功能 |
| P2-9 | dashboard | 7天趋势时区错位（UTC vs MySQL 时区） | 需确认服务器时区配置 |
| P2-10 | membership | setInterval 未 clearInterval | onModuleDestroy 应改 clearInterval |
| P2-11 | rate-limit | INCR/EXPIRE 非原子 | 需 Lua 脚本，改动大 |
| P2-12 | email-code | 内存 Map 多实例失效 | 需迁 Redis，架构级改动 |

### 待用户决策的安全建议（非代码 BUG，需运维配合）
- **AI Key 明文存储**：种子硬编码真实 key，建议轮换 + 加密存储（AES-GCM）
- **trust proxy 未设**：nginx 反代下 request.ip 恒为内网 IP，限流/黑名单误伤，需 `app.set('trust proxy', 1)`

---

## 代码质量正面评价

以下模块代码质量高，无明显问题：
- **ai.service.ts**：错误处理完善（循环引用处理、流内错误透传、Tavily 错误提取）
- **ai.controller.ts**：SSE 头完整、错误帧透传、**现已加连接断开清理**
- **auth.service.ts**：JWKS 验签、外部鉴权中心解耦
- **entity-visibility**：canAccess/filterAccessible 真批量、多态可见性设计合理
- **comment.controller**：用户端越权防护完善（updateByUser 校验归属）
- **plan**：priceCents 整数避免浮点、slug 唯一检查
