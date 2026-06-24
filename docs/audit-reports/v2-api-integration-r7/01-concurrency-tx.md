# R7 并发与事务修复

## 1. 兑换码超发（🔴 高危）

**文件**：`code/code.service.ts` useCode()

### 问题

限量码（maxUses>0）的 useCode 用「读后写」判定上限：
```ts
// 旧代码（有竞态）
const codeEntity = await manager.findOne(CodeEntity, { where: { code } });  // 读快照
if (codeEntity.usedCount >= codeEntity.maxUses) throw ...;                  // 用快照判定
await manager.increment(CodeEntity, { id }, 'usedCount', 1);                // 无条件下更新
```

并发场景：两个事务同时 findOne，都读到 `usedCount=0`，都通过校验，各自 increment → 超发。
对比 `user.service.ts` register() 的邀请码消费用了正确的条件 UPDATE，但 useCode 漏了。

### 修复

用条件 UPDATE 防超发，检查 affected rows：
```ts
const result = await manager.createQueryBuilder(CodeEntity, 'c')
  .update()
  .set({
    usedCount: () => 'usedCount + 1',
    usedAt: new Date(),
    // 用完即置 used（CASE 在 DB 层判定，不依赖应用层快照值）
    status: () => maxUses > 0
      ? `CASE WHEN usedCount + 1 >= ${maxUses} THEN 'used' ELSE status END`
      : 'status',
  })
  .where('c.id = :id', { id })
  .andWhere(maxUses > 0 ? 'c.usedCount < :maxUses' : '1 = 1', { maxUses })
  .execute();

if (result.affected === 0) {
  // 并发竞争失败，抛错让事务回滚（含刚插的 CodeUsageLogEntity）
  throw new BadRequestException('该兑换码使用次数已用完');
}
```

### 验证

DB 实测：建 maxUses=1 的测试码，两个并发事务抢：
```
事务A: affected=1 (抢到)
事务B: affected=0 (被拒-防超发生效)
最终: usedCount=1 status=used
✅ 防超发：仅1次成功
```

---

## 2. code_usage_logs 缺 userId 索引（🟡 性能）

**文件**：`code/code-usage-log.entity.ts`

### 问题

`user.service.remove()` 删用户时按 `userId` 清理兑换记录：
```ts
manager.delete(CodeUsageLogEntity, { userId: id })
```
但 code_usage_logs 只有 `idx_codeusage_code(codeId)`，**userId 无索引** → 全表扫描。
该表随时间累积（每次兑换一条），达数十万行时删用户代价显著。

### 修复

加索引：`@Index('idx_codeusage_user', ['userId'])`

### 验证

DB 实测确认索引已建（TypeORM synchronize 自动）：
```json
[{"INDEX_NAME":"idx_codeusage_user","COLUMN_NAME":"user_id"}]
```
