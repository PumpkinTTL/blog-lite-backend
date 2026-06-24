# 第七轮代码审计与优化（R7）

> 日期：2026-06-25
> 范围：并发/事务/性能/边界值深度扫描（三 agent 并行）
> 重点：兑换码超发、缺索引、前端续签挂起、DTO 边界、批量选择误删

---

## 文档结构

| 文件 | 内容 |
|------|------|
| `00-README.md` | 本文件，总览 + 提交记录 |
| `01-concurrency-tx.md` | 并发与事务修复（兑换码超发/索引） |
| `02-boundary-robustness.md` | 边界值与健壮性修复（DTO/doRefresh/批量选择） |

## 扫描方法

三 agent 并行：
- Agent 1：实战业务逻辑 bug（状态机/并发/事务/数值计算）
- Agent 2：性能问题（N+1 查询/缺索引/全表扫描）
- Agent 3：边界值与异常处理（数值/字符串/日期/外部服务）

## 本轮修复汇总

| # | 类别 | 问题 | 严重度 | 验证 |
|---|------|------|--------|------|
| 1 | 并发 | useCode 读后写判定上限 → 限量码超发 | 🔴高 | DB 实测：两事务抢 maxUses=1，仅1次成功 |
| 2 | 性能 | code_usage_logs 缺 userId 索引 → 删用户全表扫 | 🟡中 | DB 实测：idx_codeusage_user 已建 |
| 3 | 健壮性 | doRefresh 无 timeout → 鉴权中心卡死前端永久挂起 | 🔴高 | 代码审查 |
| 4 | 边界 | bannedUntil 可设过去时间 → 封禁形同无效 | 🟡中 | 代码审查 |
| 5 | 边界 | DTO 数组/金额/正文缺上限 → DoS/精度溢出 | 🟡中 | 代码审查 |
| 6 | 性能 | cleanExpired 全量加载到内存 | 🟡中 | 代码审查 |
| 7 | 数据安全 | useCrudList 批量选择未清空 → 跨数据误删 | 🔴高 | 代码审查 |

## 扫描确认无问题（不需改）

- 越权/IDOR、SQL 注入、password hash 泄露（R6 已确认）
- membership grant 的 pessimistic_write 行锁（并发开通安全）
- interaction toggle 的 DELETE+INSERT IGNORE（并发双击安全）
- entity-visibility grantAccess 的 orIgnore（并发丢授权安全）
- email-code 的 Redis HINCRBY 原子计数（防刷安全）
- 分页 pageSize clamp 上限 100
- parsePagination 防 NaN/负数

## 未修（评估后保留，非 bug 或低优先级）

| 项 | 原因 |
|----|------|
| 兑换 redeem 跨事务（useCode+grant 独立） | useCode 已防超发；grant 失败的补偿逻辑改动大，单独排期 |
| N+1 批量回算计数（user.remove/comment.batchModerate） | 数据量小时影响小，批量优化单独排期 |
| admin 用户列表含 registerIp | 管理后台审计能力，admin 本就需要看 |
| 前端 v2 加载失败 UI 兜底 | 属 UI 改动，需用户明确指示，本轮不动 |
