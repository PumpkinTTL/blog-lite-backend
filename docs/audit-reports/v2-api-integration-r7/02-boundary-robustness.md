# R7 边界值与健壮性修复

## 1. doRefresh 无 timeout（🔴 高危，前端永久挂起）

**文件**：`src/utils/request.ts` doRefresh()

### 问题

续签用裸 `axios.post` 没传 timeout 配置，axios 默认无超时。
鉴权中心卡死时此请求永久 pending → `refreshSubscribers` 队列里的并发请求也永久挂起（loading 永转）。

### 修复

```ts
const res = await axios.post(
  `${base}/user/refresh`,
  { refreshToken, deviceId },
  { timeout: 15000 },  // 必须设超时
)
```

---

## 2. bannedUntil 可设过去时间（🟡 中）

**文件**：`user/user.service.ts` toggleStatus()

### 问题

admin 封禁时传 `bannedUntil: "2020-01-01"`（过去时间），封禁成功返回，
但用户下次请求经 AuthGuard 时 `bannedUntil < now` 立即惰性解封 → 封禁形同未执行。

### 修复

service 层校验 bannedUntil 必须在未来：
```ts
if (bannedUntil) {
  const banDate = new Date(bannedUntil);
  if (isNaN(banDate.getTime())) throw new BadRequestException('封禁截止时间格式无效');
  if (banDate.getTime() <= Date.now()) throw new BadRequestException('封禁截止时间必须晚于当前时间');
}
```

---

## 3. DTO 缺上限（🟡 中，DoS/精度）

| 文件 | 字段 | 修复 |
|------|------|------|
| interaction.dto.ts | BatchCountDto.entityIds | 加 `@ArrayMaxSize(100)` 防 @Public 接口传超大数组 |
| donation.dto.ts | amount | 加 `@Max(100000000)` 防公开接口超大金额致 SUM 精度溢出 |
| post.dto.ts | content | 加 `@MaxLength(1048576)`（1MB）防超大 body 撑爆内存 |

---

## 4. cleanExpired 全量加载（🟡 性能）

**文件**：`backup/backup.service.ts`

### 问题

`find({ status: 'success' })` 全量加载到内存再 filter createdAt，无 where 时间条件。

### 修复

where 直接带 `createdAt: LessThan(cutoff)`，配合 idx_backup_created 索引。

---

## 5. useCrudList 批量选择未清空（🔴 数据安全）

**文件**：`admin/src/composables/useCrudList.ts` loadList()

### 问题

翻页/搜索/筛选后，旧的 `checkedRowKeys` 仍保留，指向已不在当前页的行。
批量删除会误删新数据里同 ID 的行（跨数据误删）。

### 修复

loadList 成功后清空选中：
```ts
list.value = ...;
// 数据刷新后清空选中项 —— 翻页/搜索/筛选后旧 checkedRowKeys 指向的行已不在当前页
checkedRowKeys.value = [];
```
（comment/IndexView.vue 之前单独处理过，现在统一在 composable 层解决）
