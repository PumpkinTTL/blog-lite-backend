# R2 修复的 Bug 清单

> 按 P0 → P1 → P2 分组，每条含：根因 / 修法 / 文件 / 影响

---

## P0 致命（功能不可用 / 数据损坏）

### P0-1 捐赠答谢码无法兑换
- **根因**：`donation.service.ts` 发码时把码 status 置 `disabled`（语义：移出码池防重复发），但兑换只接受 `active` → 用户拿到的码是废纸
- **修复**：
  - code.entity 新增 `assignedDonationId` 列（+ 索引），解耦"池内可见性"和"可兑换性"
  - donation.service 发码改写 `assignedDonationId`，不再置 disabled（码保持 active 可兑换）
  - 发码前校验：已分配给其他捐赠单的码不能再发
  - code.findAll 加 `onlyAvailable` 过滤（码池查询 `WHERE assignedDonationId IS NULL`）
  - SQL 脚本：迁移历史数据（回填 assignedDonationId + 恢复被错误 disabled 的捐赠码为 active）
- **文件**：code.entity.ts / code.service.ts / code.dto.ts / donation.service.ts / sql/add-missing-indexes.sql
- **影响**：捐赠答谢功能恢复正常，历史被错误 disabled 的码也可用

### P0-2 终身会员被限时码覆盖成限时
- **根因**：`membership.service.grant` 续期分支，`existing.expiresAt === null`（终身）+ `durationDays > 0` 时，`null` 被算成 `now + days` → 终身变限时
- **修复**：grant 续期分支特判——已是终身（expiresAt=null）时，收到限时码直接忽略（保持终身），收到终身码无变化
- **文件**：membership.service.ts
- **影响**：终身会员不再被损坏

### P0-3 跨等级兑换无处理（多条并行 active 记录）
- **根因**：grant 按 `(userId, planId)` 精确匹配，跨 planId 各建一条记录，靠 getActiveLevel 取最高权宜，运营/用户都难理解
- **修复**：grant 重写实现升降级策略（决策：升级作废低级 + 降级拒绝）
  - 升级：作废所有低级 active 会员（标 cancelled，保留审计记录）
  - 降级：拒绝并提示"未到期无法兑换更低等级，请到期后再兑换"
  - 同等级：基于 expiresAt 续期
- **文件**：membership.service.ts
- **影响**：用户同时只有一条有效会员记录，等级切换符合直觉

### P0-4 grant 无事务，并发可建多条同级会员
- **根因**：grant 的"查 active → 判断升降级 → 作废/新建"无事务无锁，并发两个兑换请求会同时查到"无同级 active"各建一条
- **修复**：整个 grant 包进 `dataSource.transaction` + `SELECT ... FOR UPDATE` 悲观锁，保证串行化
- **文件**：membership.service.ts（constructor 注入 DataSource）
- **影响**：并发兑换不会产生重复会员记录

### P0-5 降级时兑换码被白白消耗
- **根因**：redeem 流程 `verifyCode → useCode（消耗码）→ grant`，grant 抛"无法降级"时码已被 useCode 消耗（usedCount++ + 写日志），但会员没开通
- **修复**：新增 `preCheckGrant(userId, planId)` 预检查方法（只查不落库），在 useCode 之前调用。降级时在 preCheckGrant 就被拦截，**码不会被消耗**
- **文件**：membership.service.ts（preCheckGrant）+ membership.controller.ts（redeem 流程）
- **影响**：降级时码保持可用状态，用户可改兑其他码或等到期后兑

### P0-6 删用户不级联清理（孤儿数据 + 计数虚高）
- **根因**：user.service.remove 只删 user 本身 + 头像文件。interactions/memberships/code_usage_logs 是裸列无 FK，删用户后成孤儿；文章 likeCount/favoriteCount 永不回算
- **修复**：remove 改成事务，删用户前清理 interactions（+ 回算受影响文章计数）/ memberships / code_usage_logs。comments 和 user_roles 因 FK CASCADE 自动删
- **文件**：user.service.ts（import InteractionEntity/MembershipEntity/PostEntity）
- **影响**：删用户后数据干净，文章计数准确

### P0-7 删文章（硬删）不清理孤儿数据
- **根因**：post.service.remove(force=true) 只删 post + 图片，interactions（裸列）和 entity_visibility（多态表）无 FK，成孤儿
- **修复**：硬删前事务内删 interactions + `visibilityService.purgeEntity('post', id)`。comments/post_views/ai_conversations 因 FK CASCADE 自动删
- **文件**：post.service.ts（constructor 注入 DataSource + import InteractionEntity）
- **影响**：删文章后无孤儿授权/互动记录

---

## P1 重要（状态机 / 错误处理 / 体验）

### P1-1 donation toggleStatus 丢失 refunded 语义
- **根因**：toggleStatus 在 confirmed↔pending 切，refunded 状态点 toggle 会变 confirmed，丢失退款语义
- **修复**：refunded 是终态，禁止 toggle
- **文件**：donation.service.ts

### P1-2 resource toggleStatus 丢失 login/private 语义
- **根因**：toggleStatus 在 published↔draft 切，login/private 状态点 toggle 会变 draft
- **修复**：非 published/draft 状态拒绝 toggle，提示"只能在已发布/草稿之间切换"
- **文件**：resource.service.ts

### P1-3 email-code 把 SMTP 错误细节暴露给用户
- **根因**：`throw new BadRequestException(\`邮件发送失败: ${err.message}\`)` 把 SMTP host/凭证等内部信息泄露
- **修复**：错误细节只 console.error 记日志，对用户返回"邮件发送失败，请稍后重试"
- **文件**：email-code.service.ts

### P1-4 issueToken 失败抛 Error → 500
- **根因**：auth.service.issueToken 抛原生 Error，login/loginByCode 没 try/catch，鉴权中心不可用时返回 500
- **修复**：抽 `issueLoginToken` 私有方法（login + loginByCode 共用），catch 后转成"登录服务暂时不可用，请稍后重试"，同时消除两处重复代码
- **文件**：user.service.ts

### P1-5 revokeToken 不校验 success 无 catch
- **根因**：revokeToken 直接 await httpService.post，不校验 data.success，无 try/catch，鉴权中心异常时登出接口 500
- **修复**：加 try/catch + success 校验，鉴权中心不可用不阻塞登出（本地态已在调用方清理）
- **文件**：auth.service.ts

### P1-6 logout 改 lastLoginAt（语义错误）
- **根因**：登出时 `update(userId, { lastLoginAt: new Date() })`，把"最后登录时间"改成"最后登出时间"，前端展示误导
- **修复**：删除该 update，登出不改 lastLoginAt
- **文件**：user.service.ts

### P1-7 同用户可刷满同一码（防刷缺失）
- **根因**：useCode 无 `(codeId, userId)` 去重，同一用户可用 maxUses=10 的码刷 10 次
- **修复**：useCode 事务内查重，已用过抛"您已使用过此兑换码"（未登录用户 userId=null 不限制）
- **文件**：code.service.ts

### P1-8 admin dashboard resize 监听泄漏
- **根因**：onMounted 用匿名函数注册 resize 监听，onBeforeUnmount 无法 remove（引用丢失），反复进出页面监听堆积
- **修复**：提取具名 handleResize，onBeforeUnmount removeEventListener
- **文件**：admin/dashboard/IndexView.vue

---

## P2 一般（文案 / 死代码 / 优化）

### P2-1 兑换码错误提示暴露英文枚举值
- **根因**：`码状态为 ${status}，不可使用` 直接拼英文 active/used/expired/disabled
- **修复**：提取 `codeStatusToMessage(status)` 映射函数（used→已使用 / expired→已过期 / disabled→已停用），verifyCode 和 useCode 复用
- **文件**：code.service.ts

### P2-2 兑换码其他文案优化
- `码不存在` → `兑换码不存在，请检查输入`
- `码类型不匹配` → `此兑换码类型不正确`
- `码已过期` → `该兑换码已过期`
- `码已用完` → `该兑换码使用次数已用完`
- **文件**：code.service.ts

### P2-3 DTO 英文校验消息泄露
- **根因**：RedeemMembershipDto/RedeemResourceDto 的 code 字段 + 9 处 @IsEmail 无中文 message，class-validator 英文默认消息直接返回用户
- **修复**：全部加中文 message（"兑换码格式不正确"/"请输入兑换码"/"邮箱格式不正确"）
- **文件**：membership.dto.ts / resource.dto.ts / user.dto.ts

### P2-4 Announcement togglePin 逻辑反了
- **根因**：列表 orderBy sortOrder ASC，置顶设 9999 → 排在**最后**（反了）
- **修复**：置顶用负数（sortOrder=-1 排最前，0=正常）
- **文件**：announcement.service.ts

### P2-5 LoginByCodeDto.invitationCode 声明未实现（误导）
- **根因**：DTO 注释写"未注册自动注册"，但 service 未注册直接抛错，字段是死代码
- **修复**：删除字段（注册必须走专门接口）
- **文件**：user.dto.ts

### P2-6 resource view 计数失败静默吞错
- **根因**：`.catch(() => void 0)` 连日志都不打
- **修复**：补 logger.warn
- **文件**：resource.controller.ts（加 Logger）

### P2-7 UserCenter onBeforeUnmount 引用未声明变量（运行时异常）
- **根因**：迁移到 useCodeCooldown 后残留 `pwdCooldownTimer` 引用，组件卸载时抛 ReferenceError
- **修复**：删除残留代码（定时器已由 useCodeCooldown 内部 onBeforeUnmount 自管）
- **文件**：UserCenter.vue

### P2-8 ArticleComments toggleLike 死 UI
- **根因**：toggleLike 永远只弹"功能即将上线"，likes 硬编码 0，点赞按钮是死 UI
- **修复**：删除 toggleLike 函数 + 点赞按钮 UI + likes/liked 字段 + 未使用 import（ThumbsUp/notifyInfo）
- **文件**：ArticleComments.vue

### P2-9 About.vue 假延迟 + plan 映射重复
- About.vue 300ms 假延迟（静态页假装加载）→ 删除
- ResourceLock + Shop 各自内联 plan 等级映射（3 处重复）→ 统一用 `utils/plan.ts` 的 levelToPlan
- **文件**：About.vue / ResourceLock.vue / Shop.vue

---

## 会员码兑换闭环完整流程（修复后）

```
1. verifyCode（码存在？type=membership？status=active？未过期？次数未满？）
   ↓ 失败 → 中文友好提示，码不消耗
2. 套餐校验（planId 存在？plan.isActive？）
   ↓ 失败 → 提示，码不消耗
3. 归属校验（claimedUserId 匹配？）
   ↓ 失败 → "此兑换码已指定给其他用户"，码不消耗
4. preCheckGrant（能否开通？降级检查）
   ↓ 失败 → "未到期无法兑换更低等级"，码不消耗 ✨（P0-5 修复点）
5. useCode（事务内消耗码：usedCount++ + 写日志 + 同用户防刷）
   ↓ 失败 → 码不消耗（事务回滚）
6. grant（事务 + 悲观锁：升降级判断 + 续期/开通）
   ↓ 升级 → 作废低级 + 开通高级
   ↓ 续期 → 基于 expiresAt 续（终身不被覆盖）
   ↓ 新开 → 创建记录
7. 返回"已开通「套餐名」"
```

关键：**步骤 4-5 之间有保护**，降级在消耗码之前被拦截。
