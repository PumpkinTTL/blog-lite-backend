# R1 后端审查报告

> 审查范围：v2 客户端接入后需要的 backend 配套修改 + 数据库索引系统性复查
> 状态标记：✅ 已修 / ⏸️ 未修（设计问题或低优先级）

---

## 一、Entity 字段缺失

### ✅ B1. UserEntity 缺 gender/signature/phone（高危）
- **位置**：`api/src/modules/user/user.entity.ts`
- **问题**：前端 `UserInfo` 接口、UserCenter 资料 UI、adaptUserInfo 都用这三字段，但 entity 无对应列
- **核验**：`user.entity.ts:25-124` 确认无 gender/signature/phone 的 @Column
- **修复**：加三个 nullable 列（commit `619ae6c`）
  - `gender: int nullable default 0`（0=未知 1=男 2=女）
  - `signature: varchar(200) nullable`
  - `phone: varchar(20) nullable`

### ✅ B2. UpdateProfileDto 不放开新字段（高危）
- **位置**：`api/src/modules/user/user.dto.ts:80-95`
- **问题**：DTO 只声明 nickname/email/avatar，配合 `forbidNonWhitelisted:true`，前端发 signature/gender 会 400
- **修复**：放开 gender（IsInt/IsIn [0,1,2]）、signature（MaxLength 200）、phone（Matches 数字+加减空格）（commit `619ae6c`）

### ✅ B3. user.service.ts updateProfile 透传（无需改）
- **位置**：`api/src/modules/user/user.service.ts:717-722`
- **现状**：`Object.assign(user, data)` 自动透传 DTO 所有已声明字段，DTO 补字段后无需改 service

---

## 二、悬空装饰器 bug

### ✅ B4. code-usage-log.entity.ts 悬空 @Index（真 bug，高危）
- **位置**：`api/src/modules/code/code-usage-log.entity.ts:40-44`
- **问题**：三个 `@Index('used_at')` / `@Index('code_id')` / `@Index('user_id')` 装饰器悬空——夹在 `@CreateDateColumn` 和 `@ManyToOne` 之间，**没挂在任何 @Column 属性上**。TypeORM 解析时不会把它们绑定到对应列，索引实际未生成
- **修复演变**（重要，详见 `03-fixes-applied.md` 踩坑记录）：
  1. 第一版改为属性级 `@Index()` 无名称 → 触发后端启动崩溃（脏索引 + 外键引用）
  2. 数据库侧清理脏索引（建新索引 → 删外键 → 删脏索引 → 重建外键）
  3. 最终改为类级 `@Index('idx_codeusage_code', ['codeId'])` 与数据库严格对齐（commit `7ef8aa4`）

---

## 三、数据库索引系统性复查

### 复查方法
对照每个 service 的 `createQueryBuilder` / `find` / `findOne` / `orderBy`，逐一核对 WHERE / ORDER BY / JOIN ON 是否都命中索引。

### ✅ 第一批索引（commit `216430c`，已建）
| 表 | 索引 | 列 |
|---|---|---|
| donations | idx_don_status | status |
| donations | idx_don_visible_status | (isVisible, status) |
| donations | idx_don_sort | sortOrder |
| donations | idx_don_created | createdAt |
| donations | idx_don_paymethod | payMethod |
| donations | idx_don_crypto_network | (payMethod, cryptoNetwork) |
| donations | idx_don_txhash | cryptoTxHash |
| donations | idx_don_tradeno | tradeNo |
| media | idx_media_url | url |
| media | idx_media_dedup | (hash, storageType, ossPlatform) |
| post_views | idx_postview_post_ip | (postId, ip) |
| post_tags | idx_post_tags_tag | tag_id（SQL 脚本） |
| users | idx_user_status | status |
| users | idx_user_created | createdAt |
| blacklists | idx_bl_created | createdAt |
| blacklists | idx_bl_expires | expiresAt |
| codes | idx_code_type_status | (type, status) |
| codes | idx_code_status | status |
| settings | idx_setting_group | group |

### ✅ 第二批索引（commit `619ae6c`，已建）
| 表 | 索引 | 列 | 触发查询 |
|---|---|---|---|
| comments | idx_comment_parent_status_created | (parentId, status, createdAt) | listReplies 二级回复热路径 |
| comments | idx_comment_status_created | (status, createdAt) | adminList 后台审核 |
| interactions | idx_interaction_user_type_created | (userId, type, createdAt) | listMine 我的点赞/收藏 |
| memberships | idx_member_created | createdAt | findAll 管理端分页 |
| resources | idx_resource_sort_created | (sortOrder, createdAt) | findAll 列表排序 |
| ai_conversations | idx_ai_conv_updated | updatedAt | findAll 管理页 |
| code_usage_logs | idx_codeusage_code | codeId | findUsageLogs + 外键 |

### ✅ B5. 已确认覆盖良好、无需补索引的表
- posts：列表分页（createdAt/viewCount/sortOrder）、categoryId、status、author/uploader 都已有索引
- entity_visibility：4 列唯一约束最左前缀覆盖 canAccess
- audit_logs：(targetType, targetId) + (createdAt) 已覆盖
- tags / categories / friend_links / announcements / plans：常规小表，索引齐全
- memberships 的 user/plan/status/expires 维度：已覆盖

### ⏸️ B6. 可选优化（未补，性价比低）
- memberships sweepExpired 定时任务：(status, expiresAt) 复合索引。一小时一次，单表数据量决定，可不补
- donation_notifications：(donationId, createdAt) 复合。donationId 单列索引能定位行，回表后 filesort 少量行，可接受

---

## 四、API 设计问题（未修，需统一规划）

### ⏸️ B7. 鉴权失败/资源不存在统一返回 200 + success:false
- **现象**：后端多处对"无权访问/资源不存在"返回 HTTP 200 + `{success:false}`，被 `request.ts` 拦截器统一 reject + notifyError
- **影响**：UI 无法区分"不存在"和"无权访问"，影响 post/resource/code/comment 多个模块的错误提示
- **未修原因**：属于后端响应规范的整体设计问题，需要统一规划（建议：无权访问用 403，不存在用 404，业务校验失败保留 200+success:false）

### ⏸️ B8. logout 改 @Public 的设计权衡
- **现状**：`user.controller.ts` 的 logout 已加 @Public（commit `216430c`）
- **理由**：accessToken 可能已过期（挂很久才点退出），强制鉴权会触发 401 → 续签 → "登录已过期"弹窗，体验断裂
- **权衡**：@Public 后 logout 接口任何人可调，但后端只靠 refreshToken 吊销 Redis 会话，无安全风险。记录此设计决策

---

## 未修项汇总（留给 R2 扫描）

1. **B7**：后端响应规范统一（鉴权失败/不存在的 HTTP 状态码）—— 需要产品 + 后端统一规划
2. **B6**：两个可选索引（memberships sweepExpired、donation_notifications）—— 性价比低，表数据量上来再补
