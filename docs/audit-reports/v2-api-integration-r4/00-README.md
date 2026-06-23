# 第四轮代码检查与优化（R4）— 性能与数据一致性

> 日期：2026-06-24
> 范围：全栈（backend api + frontend v2），聚焦"性能优化 + 数据一致性 + R3 未修项 + 前端体验"
> 触发：R3 修完安全后，还有一批性能（N+1/缓存/事务）和一致性（toggle 原子/visibility 并发）问题待处理
> 方式：2 个 Explore agent 并行扫描（后端性能与一致性 + 前端体验与边界）

---

## 为什么有第四轮

R1-R3 修了"对接逻辑 + 业务闭环 + 安全契约"，但还有两类问题没覆盖：
- **性能**：N+1 查询、无缓存的热查询、串行批量操作
- **数据一致性**：并发写操作的竞态（toggle/visibility/grantAccess 非原子）

R4 集中解决这些，确保"高并发下数据正确 + 大数据量下性能不崩"。

---

## 文档结构

| 文件 | 内容 |
|---|---|
| `00-README.md` | 本文件，总索引 + 快速结论 |
| `01-perf-fixes.md` | 性能修复（Redis/N+1/缓存/bundle）|
| `02-consistency-fixes.md` | 数据一致性修复（toggle 原子/事务/LIKE 转义）|
| `03-frontend-fixes.md` | 前端体验修复（错误态/倒计时/disabled）|
| `04-remaining.md` | 未修项（留 R5 或产品决策）|

---

## 快速结论

### 本轮处理统计

| 维度 | 数量 |
|---|---|
| P0（并发数据损坏/性能瓶颈）| 7 |
| P1（体验/一致性）| 5 |
| 前端优化 | 4 |

### 关键修复

1. **EmailCodeService Redis 迁移**（P0）：内存 Map → Redis hash，多实例安全 + 防刷维度统一
2. **interaction toggle 原子化**（P0）：DELETE 优先 + INSERT catch unique + 原子 increment 计数，消除并发双击报错
3. **setVisibility/grantAccess 并发安全**（P0）：setVisibility 包事务，grantAccess 改 INSERT IGNORE
4. **resource findAll N+1**（P0）：改用 getVisibilityBatch（一次 WHERE IN）
5. **dashboard 60s 缓存**（P0）：20 个聚合查询不再每次重算
6. **private 资源访问控制**（P0）：未授权返回 404 不泄露元信息
7. **LIKE 转义 %/_**（P1）：搜索特殊字符不再失控
8. **ArticleDetail 错误态**（前端 P0）：加载失败不再永久卡骨架屏
9. **bundle 优化**（前端 P1）：FontAwesome 条件加载 + UserCenter/cropperjs 异步

### 验证

- 后端：watch 模式，代码已编译（verifyCode 改 async，3 处调用方加 await）
- 前端：未构建（遵守规则），改动类型安全
- 重启后端后：Redis 验证码 + dashboard 缓存 + 新限流规则生效

---

## 四轮覆盖总结

| 轮次 | 主题 | 修复数 |
|---|---|---|
| R1 | v2 对接逻辑（竞态/缓存/字段）| 6 高危 + 6 中危 |
| R2 | 业务闭环（会员码/级联/状态机）| 7 P0 + 8 P1 + 9 P2 |
| R3 | 安全与契约（越权/泄露/上传/限流）| 3 P0 + 5 P1 + 2 P2 |
| R4 | 性能与一致性（Redis/原子/N+1/缓存）| 7 P0 + 5 P1 + 4 前端 |

四轮后，v2 客户端 + 后端在**对接逻辑 + 业务闭环 + 安全 + 性能**四个维度基本完整。
