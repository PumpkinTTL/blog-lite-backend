# R6 安全加固

## 审计方法

双 agent 并行扫描 `backend/api/src/modules` 下全部 28 controller + 29 service + 25 DTO：
- Agent 1：越权/IDOR/鉴权缺失
- Agent 2：信息泄露/输入校验/逻辑漏洞

---

## ✅ 已修复（commit 7558b68）

### 1. 登录信息泄露 — 用户名枚举 + 时序攻击（🔴 高危）

**文件**：`user/user.service.ts` login()

**原问题**：
- 账号不存在/禁用 → `'账号不存在或已禁用'`
- 密码错误 → `'密码错误'`
- 两条**不同消息**让攻击者区分「用户名不存在」和「密码错误」，枚举有效用户名
- 且账号不存在时立即返回（第 91 行），存在时走 bcrypt（第 97 行），**有时序差异**

**修复**：
1. **统一消息**：`LOGIN_FAIL_MSG = '用户名或密码错误'`，三种失败（不存在/禁用/密码错）同一条
2. **恒定时间**：账号不存在时用 `DUMMY_HASH`（真实 bcrypt cost=10 占位哈希）执行一次 bcrypt.compare，
   使「用户不存在」与「密码错误」两个分支耗时一致
3. 临时封禁过期解封逻辑前置（保证 canLogin 判断时 status 已正确）

**验证**：`bcrypt.compare('anypass', DUMMY_HASH)` 返回 false 且耗时与真实比较相当，格式 `$2a$10$` 有效。

### 2. 公开评论接口泄露用户 PII（🔴 高危，匿名可达）

**文件**：`comment/comment.service.ts` listTopLevel() / listReplies()

**原问题**：两个 `@Public()` 接口用 `relations: ['user']`，返回完整 UserEntity。
虽然 `password` 列 `select:false` 不泄露哈希，但 UserEntity 仍含
`email / phone / registerIp / registerSource / bannedUntil / status`。
**任何匿名访客**抓取文章评论即可获得所有评论者的邮箱、手机号、注册 IP（PII）。

**修复**：新增 `sanitizeUser()` 私有方法，返回前把 user 裁剪成公开白名单：
```ts
{ id, username, nickname, avatar }
```
listTopLevel/listReplies 返回前调用。

### 3. 公开资源接口泄露 uploader PII（🔴 高危，匿名可达）

**文件**：`resource/resource.service.ts` findAll() / findById()

**原问题**：两个 `@Public()` 接口用 `leftJoinAndSelect('e.uploader', 'uploader')`，
返回完整 uploader（同上 PII）。匿名访客遍历资源列表即可批量采集上传者隐私。

**修复**：
- findAll：`leftJoinAndSelect` → `leftJoin` + `addSelect(['uploader.id','username','nickname','avatar'])`
- findById：`findOne + relations` → queryBuilder 精确控制字段

### 4. batchModerate 无 DTO 校验（🟡 中危，数据完整性）

**文件**：`comment/comment.controller.ts` batchModerate()

**原问题**：`@Body() dto: { ids: number[]; status: 'approved'|'rejected' }` 是 TS inline 类型，
**运行时被擦除，无任何校验**。`status` 可传任意字符串（如 `'xxx'`）直接 `update({status})` 写库，
污染审核状态机。同模块其他批量接口都用了 DTO，唯独这里漏了。

**修复**：新增 `BatchModerateDto`（`@IsArray @IsInt each @ArrayNotEmpty ids` + `@IsEnum status`），
controller 改用 DTO。

---

## ✅ 扫描确认无问题（不需要改）

| 检查项 | 结论 |
|--------|------|
| 越权/IDOR | 用户操作资源都有 `userId === currentUser.id` 校验；admin 写操作类级 `@Roles('admin')`；公开 controller 与 admin controller 物理分离 |
| SQL 注入 | 全部参数化查询，LIKE 用 `escapeLike` + `ESCAPE`；动态列名拼接处列名来自代码常量非用户输入；mysqldump 用 `execFile` 非 shell |
| 分页 pageSize | `parsePagination` 统一 clamp 上限 100，无 `pageSize=999999` 拖库 |
| 异常处理 | 非 HttpException 固定返回「服务器内部错误」，不泄露堆栈/SQL/主机 |
| password hash | entity `select:false`，登录 `addSelect` 临时取出 |

## ⚪ 有意未改（已评估）

| 项 | 原因 |
|----|------|
| admin 用户列表含 registerIp | 管理后台的审计能力，admin 本就需要看；用户自查 `getProfile` 已裁剪。两边职责不同 |
| 注册「用户名已存在」 | 注册场景 UX 必需（提示用户换用户名），不是登录枚举漏洞 |
| 密码仅 MinLength(6) | 低危加固项，可后续单独做密码强度策略 |
| loginByCode「该邮箱尚未注册」 | 验证码本身是防枚举屏障，攻击者需先拿到目标邮箱验证码才能触达此分支，风险低 |
