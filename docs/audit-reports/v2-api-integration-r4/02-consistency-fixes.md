# R4 数据一致性修复

> 事务边界 + 原子操作 + 并发安全

---

## P0 数据一致性

### P0-1 EmailCodeService Redis 原子操作
- **问题**：内存 Map 的 attempts 自增非原子，并发双请求各拿到 < MAX 再各自 ++ 绕过上限
- **修复**：Redis `HINCRBY attempts` 原子自增，超限直接删 key 强制重新获取
- **文件**：email-code.service.ts verifyCode

### P0-2 interaction toggle 并发 unique 冲突
- **问题**：findOne→save 之间并发，两个请求都查到 null 都 insert，第二个撞 unique 抛 500
- **修复**：
  - 先 DELETE（affected=1 = 原本存在已取消）
  - 再 INSERT（catch ER_DUP_ENTRY = 别人抢先，幂等返回 active:true）
  - 消除并发报错 + 计数漂移
- **文件**：interaction.service.ts toggle

### P0-3 post 计数原子化
- **问题**：toggle 后 controller 用 count+update 同步计数，并发下反复横跳
- **修复**：改 `UPDATE posts SET field = field + delta WHERE id = ?`（delta = ±1 常量，SQL 注入安全）
- **文件**：post.controller.ts toggleInteract

### P0-4 setVisibility 事务
- **问题**：delete + save 非事务，delete 后崩溃 → 资源对所有用户无授权
- **修复**：包 `dataSource.transaction`，delete + save 原子
- **文件**：entity-visibility.service.ts setVisibility

### P0-5 grantAccess INSERT IGNORE
- **问题**：read-modify-write（getVisibility→push→setVisibility），并发覆盖丢授权
- **修复**：改 INSERT IGNORE（依赖 uq_entity_visibility 组合唯一约束），并发幂等
- **文件**：entity-visibility.service.ts grantAccess（新增）+ resource.service.ts grantAccess（改调）

---

## P1 一致性

### P1-1 LIKE 转义（搜索结果一致性）
- **问题**：用户搜 `100%` 被当通配符，结果不符合预期
- **修复**：escapeLike 转义 + ESCAPE 子句
- **文件**：apply-filters.ts + 4 处手写 LIKE

### P1-2 verifyCode 改 async
- **问题**：Redis 操作是异步的，原同步 verifyCode 调用方没 await
- **修复**：verifyCode 改 async，3 处调用方加 await
- **文件**：email-code.service.ts + user.controller.ts + user.service.ts

---

## 确认良好（无需修改）

### 软删一致性 ✓
R3 已修 post.findById 过滤 deletedAt。R4 确认其他实体（resource/comment/category/tag/announcement/friend-link/media）无软删字段，删除即硬删，无残留软删查询未过滤的问题。

### SQL 注入 ✓
所有 createQueryBuilder 都用 `:param` 绑定。R4 新增的 `field + delta` 是常量拼接（+1/-1），安全。

### 唯一约束预校验 ✓
post slug、user username/email、code code 都有 service 层预校验 + 数据库 unique 兜底。
