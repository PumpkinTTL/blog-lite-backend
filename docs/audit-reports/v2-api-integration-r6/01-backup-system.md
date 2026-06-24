# R6 备份系统实战 bug 修复

## 背景

备份系统（防云服务商跑路，mysqldump → gzip → R2）实现后，实战测试暴露多个 bug。
核心问题集中在「定时器配置持久化」和「前端交互反馈」。

---

## P1 修复（功能 bug）

### 1. 定时器 toggle 后调度/保留天数丢失（最严重）

**现象**：在 admin 切换定时器启用状态后，调度时间（hour/minute）和保留天数（retainDays）全部变成默认值。

**根因（架构缺陷）**：`backup-schedule.service.ts` 用内存 `configs: Map` 作为**唯一数据源**，
`list()`/`getById()`/`update()` 全部读内存缓存。这导致：

1. **内存与 DB 脱节**：手动删了 DB 记录，内存还在，`list` 返回幽灵数据
2. **update 拿脏数据 merge**：`update()` 的 `existing` 从内存读，如果内存是历史脏数据
   （早期版本 create 没写全字段，DB 里只存了 `{id, enabled}`），merge 后字段全是 undefined
   → `normalizeConfig` 填默认值 → **toggle 后 hour/minute/retainDays 全变默认**

**实测证据**：HTTP 闭环测试 39/48，toggle 后 interval `retainDays 7→30`、daily `hour 2→3 minute 30→0`。

**修复**：重构 service，**DB 改为唯一真相源**：
- `loadFromDb()` 私有方法直接查 settings 表
- `list()`/`getById()` 都走 DB，内存 Map 只作 cron job 索引
- `update()` 的 `existing` 从 `getById()`（查 DB）取，不再信任内存
- 新增 `normalizeConfig()` 在 create/update/loadAll 三处统一兜底字段 + 校验枚举
- `remove()` 即使内存没有也从 DB 删（修复 DB 有记录但内存没有时删不掉）

**验证**：算法单元测试 22/22（脏数据兜底 / toggle 不丢字段 / 非法枚举回落 / 负数防御 / 字符串类型防御）。

### 2. remove 删不掉 DB 有但内存没有的记录

**原代码**：`if (!cfg) return;` —— 内存没有就直接 return，DB 记录永远删不掉。
**修复**：内存没有时先 `getById()` 从 DB 确认，存在则继续删。

### 3. 校验永远失败（R2 最终一致性）

**现象**：手动点「校验」一直提示「校验失败：文件不存在或大小不符」，但文件其实在 R2。

**根因**：`verifyBackup` 用**严格 size 匹配** `head.size === log.size`。R2 是最终一致性存储，
HEAD 查询的 size 可能短暂漂移。而自动备份的 `executeBackup` 早已改成只验 `exists`，
两条路径逻辑不一致。

**修复**：`verifyBackup` 对齐 `executeBackup`，只验 `head.exists`，size 差异 >100B 只记 warn。

---

## P1 修复（接口契约）

### 4. 校验失败却弹绿色 success toast

**根因（三层叠加）**：
1. Service `verifyBackup` 严格 size 匹配 → 假阴性
2. Controller 校验失败仍返回 `success: true`，把失败消息塞进成功响应体
3. Frontend `handleVerify` 无条件把 `res.message` 包进 `message.success()`

**修复**：
- Controller 失败时 `throw new BadRequestException`，让前端走 catch
- Frontend 读 `res.data.verified` 分支 success/error toast

---

## P2 修复（交互体验 — 解决「用户干等」）

### 5. 切 tab 不刷新数据

**现象**：切到「备份历史」/「定时器配置」不重新请求，显示过期数据，需手动刷新。

**修复**：`watch(activeTab)` 切换时自动刷新对应 tab。

### 6. 分页越界：删最后一条后看空白页

**修复**：`loadLogs` 检测当前页空了且非首页 → 自动回退到正确页。

### 7. 各操作无 loading 反馈

逐个加 loading + 防重复点击：
- 校验按钮：`verifyingId`，转圈 + 其他行禁用防并发
- 下载：`downloadingId` + loading toast
- 删除（日志/定时器）：`deletingLogId`/`deletingScheduleId`
- 创建/保存定时器弹窗：`savingSchedule`，提交按钮 loading + 取消禁用
- toggle 定时器：`togglingId` + 乐观更新单行（避免全表 reload 闪烁）

### 8. 备份进度 toast 静态 60 秒（用户以为卡死）

**修复**：轮询时动态更新 toast 文案，按阶段切换：
```
正在导出数据库（mysqldump）… → 正在压缩（gzip）… → 正在上传到 R2… → 仍在上传，备份文件较大请耐心等待…
```
带秒数倒计时，轮询延长到 90 秒。

### 9. logs tab 缺刷新按钮（schedules tab 有，不一致）

**修复**：logs 右上角加刷新按钮（带 loading）。
