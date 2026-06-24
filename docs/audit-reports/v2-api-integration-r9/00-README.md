# 第九轮代码审计与优化（R9）

> 日期：2026-06-25
> 范围：IP 获取 + 限流→黑名单联动 + Guard 架构
> 重点：trust proxy、统一 getClientIp、双层限流、自动拉黑

---

## 文档结构

| 文件 | 内容 |
|------|------|
| `00-README.md` | 本文件，总览 + 架构说明 |
| `01-ip-ratelimit-blacklist.md` | IP获取/双层限流/自动拉黑 实现详情 |

## 背景：发现的三个严重缺陷

| # | 问题 | 后果 |
|---|---|---|
| A | `main.ts` 没设 `trust proxy` | nginx 后 req.ip 恒为内网 IP，限流/黑名单全员串号 |
| B | 限流→黑名单联动**完全不存在** | 触发限流只返回 429，IP 不会被自动拉黑 |
| C | 限流 Guard 排在鉴权前 | request.user 未挂载，用户维度限流失效 |

## 修复方案（用户确认）

- **拉黑策略**：累计计数拉黑（10分钟内触发限流5次 → 自动临时拉黑30分钟）
- **Guard 架构**：拆两层限流（IP维度鉴权前 + 用户维度鉴权后）
- **nginx 同步**：第一步先做应用层闭环，黑名单表作为"判定结果库"；nginx 同步（Docker nginx deny 文件/reload）作为下一步

## 本轮修复汇总

| # | 文件 | 修复 |
|---|------|------|
| 1 | main.ts | 设 `app.set('trust proxy', TRUST_PROXY env)` |
| 2 | common/utils/get-client-ip.ts | 新建统一 getClientIp 工具（替代6处重复解析） |
| 3 | rate-limit.guard.ts | IP维度限流 + 违规累计自动拉黑 |
| 4 | rate-limit-user.guard.ts | 新建用户维度限流 Guard（鉴权后） |
| 5 | app.module.ts | Guard 顺序：IP限流→鉴权→用户限流→黑名单→角色 |
| 6 | blacklist.guard.ts | 用 getClientIp |
| 7 | user/post/membership/resource controller | 4处 IP 获取换 getClientIp |

## 验证

- 类型检查：0 error
- Redis 逻辑测试：违规累计计数 1→2→3→4→5（达阈值）→清零，验证通过
- 运行时闭环测试：需重启后端（trust proxy + Guard 顺序变更需重启生效）

## 架构：纵深防御分层

```
客户端 → nginx（未来：deny 文件硬封禁，连接级拦截）
       → 应用层 RateLimitGuard（IP限流，违规累计判定）
       → 应用层 AuthGuard（鉴权）
       → 应用层 RateLimitUserGuard（用户限流）
       → 应用层 BlacklistGuard（IP黑名单兜底拦截）
       → 应用层 RolesGuard（角色校验）
```

黑名单表同时作为"判定结果库"，未来供 nginx 同步消费（生成 deny 配置或 lua shared dict）。
