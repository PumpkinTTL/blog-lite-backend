# R1 修复清单 + 踩坑记录

> 本文件记录本轮所有已修项的 commit 映射、修法、验证，以及一个重要的踩坑案例
> 后续 AI 扫描时据此判断"哪些已修不要重审"

---

## 一、Backend 提交（3 个）

### `216430c` — feat: 前台公开接口闭环 + 邮箱验证码登录 + 缺失索引补建
**修复内容**：
- 新增 `DonationPublicController`（@Public）：public/submit | wall | stats
- 新增 `MediaUserController`（@Public）：前台直传白名单 app/folder
- 新增 `send-login-code` / `login-by-code` 邮箱验证码登录
- logout 改 @Public 容忍过期 token
- email-code：过期/超限/成功统一走 releaseRecord 清理冷却记录（修复重发被卡 bug）
- 第一批索引补建（donations/media/post_views/post_tags/users/blacklists/codes/settings）
- admin 清理 10+ 未引用的死代码 API 函数
- 修复 user.controller 重复 @Public 装饰器

### `619ae6c` — fix: UserEntity 补资料字段 + 修复 code-usage-log 悬空索引 + 补热表索引
**修复内容**：
- UserEntity 补 gender/signature/phone 三列（B1）
- UpdateProfileDto 放开对应字段（B2）
- code-usage-log.entity 第一版修复（B4，后续因脏索引崩溃又改）
- 第二批索引补建（comments×2 / interactions / memberships / resources / ai_conversations）

### `7ef8aa4` — fix(code-usage-log): 清理历史脏索引 used_at 导致后端启动崩溃
**修复内容**：
- 数据库侧清理脏索引 used_at（建新索引 → 删外键 → 删脏索引 → 重建外键）
- entity 索引名与数据库严格对齐（idx_codeusage_code）
- sql 脚本加幂等清理逻辑，其他环境部署自动修复

---

## 二、Frontend 提交（6 个）

### `2f4ab79` — feat(v2): 评论删除 + 赞助/商城/收藏/通知 接入真实接口
**修复内容**（本轮会话开头，非审查发现）：
- ArticleComments 新增删除评论（仅本人，一/二级均支持）
- DonationDialog 提交赞助接入 submitDonation，用后端返回 id 作凭证
- NotificationCenter mock 通知改接入 siteStore 公告 + localStorage 持久化已读
- UserCenter 收藏列表接入真实接口（并发 hydrate 文章详情）
- Donation / Shop 全接真实接口

### `d74762c` — fix(v2): API 字段对齐后端 DTO，修复 400 错误
**对应审查项**：A1（redeem）、A2（updateProfile）
- redeemResource 不再发多余 resourceId
- updateProfile 对齐后端 UpdateProfileDto 全部字段

### `cd6b1b8` — fix(v2): 详情页/列表页路由切换竞态守卫
**对应审查项**：P1（Home）、P2（ArticleDetail）、P3（ResourceDetail）
- 统一引入 loadVersion 版本号守卫模式
- Home：reset + loadMore 双分支均加守卫，setHomeFirstPage 写入纳入守卫；补 onBeforeUnmount 清理 searchTimer
- ArticleDetail：loadArticle 自增版本号；loadInteractionStatus/loadNeighborsAndRelated 共享版本号，避免旧文章互动态跨污染
- ResourceDetail：loadResource 加守卫

### `772b7fc` — fix(v2): 评论切文章不刷新 + 加载失败与空态混淆
**对应审查项**：P4（切文章不刷新）、P5（无三态）
- ArticleDetail `<ArticleComments>` 加 `:key="rawPost.id"` 强制重建
- ArticleComments 引入 loadingComments + loadCommentsError 三态，失败态提供重试入口

### `5fddf86` — fix(v2): token 续签/缓存泄漏/公开接口误判/TTL 时机/全局错误兜底
**对应审查项**：S1（refreshTokenAction）、S2（site reset）、S3（isPublicPath）、S4（loadFavorites TTL）、S5（全局错误兜底）
- 删除 refreshTokenAction + expireTime（误登出根因）
- site store 新增 reset()，clearLocalAuth 调用（跨用户泄漏）
- isPublicPath 改精确前缀匹配
- loadFavorites TTL 时间戳下移到成功后；profile/membership 改 allSettled
- main.ts 注册 errorHandler + unhandledrejection

### `5e9f6eb` — fix(v2): apis/user.ts 类型修复
**对应审查项**：A2 补充（UpdateProfileParams 补 email）
- UpdateProfileParams 补 email 字段
- adaptUserInfo nickname 用 ?? '' 兜底
- getMembership u?.premium 安全访问
- deleteAccount 未使用参数加 _ 前缀
- 顺手清理 3 个历史类型错误（user.ts 现在 vue-tsc 完全无报错）

---

## 三、踩坑记录：code_usage_logs 脏索引导致后端崩溃

这是本轮最重要的教训，详细记录供后续参考。

### 现象
后端启动崩溃，报错：
```
QueryFailedError: Cannot drop index 'used_at': needed in a foreign key constraint
code: 'ER_DROP_INDEX_FK', errno: 1553
sql: 'DROP INDEX `used_at` ON `code_usage_logs`'
```
所有接口返回 500。

### 根因（三层叠加）
1. **历史代码留雷**：`code-usage-log.entity.ts` 有 3 个悬空 `@Index('used_at')` 等装饰器，没挂在任何 @Column 上
2. **TypeORM 错误绑定**：TypeORM 把名为 `used_at` 的索引错误地建在了紧邻的 `code_id` 列上（而不是 `used_at` 列）
3. **MySQL 外键复用**：InnoDB 给 `code_id` 建外键（→ codes.id）时，复用了这个名为 `used_at` 的索引

数据库实际状态：
```
索引：used_at（但索引的列是 code_id，不是 used_at！）
外键：code_id → codes.id（复用了 used_at 索引）
```

### 触发条件
我修复悬空 @Index 时，第一版改成属性级无名称 `@Index()`（TypeORM 生成 `IDX_xxx` 名）。
- 改之前：entity 声明 `used_at` 索引 → 与数据库一致 → synchronize 不动
- 改之后：entity 无 `used_at` 索引声明 → TypeORM 认为"数据库有但 entity 没声明" → 尝试 `DROP INDEX used_at` → 被外键引用 → 崩

### 修复过程
1. **诊断**：`SHOW INDEX FROM code_usage_logs` 发现 `used_at` 索引实际索引 code_id 列
2. **数据库侧清理**（按顺序，避免外键冲突）：
   ```sql
   CREATE INDEX idx_codeusage_code ON code_usage_logs(code_id);  -- 先建新索引
   ALTER TABLE code_usage_logs DROP FOREIGN KEY FK_xxx;          -- 删外键（释放 used_at）
   DROP INDEX used_at ON code_usage_logs;                        -- 删脏索引
   ALTER TABLE code_usage_logs ADD CONSTRAINT FK_code_usage_logs_code
     FOREIGN KEY (code_id) REFERENCES codes(id) ON DELETE CASCADE;  -- 重建外键
   ```
3. **entity 对齐**：改为类级 `@Index('idx_codeusage_code', ['codeId'])`，与数据库严格对齐
4. **SQL 脚本兜底**：`api/sql/add-missing-indexes.sql` 加幂等清理逻辑，新环境部署自动修复

### 教训
> **TypeORM 索引类修改，必须先 `SHOW INDEX` 看数据库实际状态，不能只看 entity 定义。**

历史代码的悬空装饰器可能在数据库里留下了名实不符的脏数据，贸然"修正" entity 会触发 drop 冲突。这个教训也写进了 `00-README.md` 的"后续 AI 扫描指引"。

---

## 四、未修清单（留给 R2）

### 中危（建议 R2 优先处理）
| 项 | 位置 | 简述 |
|---|---|---|
| P8 | UserCenter.vue:822-839 | 移动端改密表单字段错乱（pwdForm.current 死字段） |
| P9 | ArticleFooter.vue:77-120 | 点赞/收藏乐观更新在登录态变化时计数会错 |
| P11 | ResourceSection.vue:14-31 | 懒加载失败永久卡死无重试 |
| P12 | DonationDialog.vue:64-75 | 提交成功后不重置表单 |
| S8 | request.ts:126-140 | redirectToLogin 无防抖可连续弹窗 |
| B7 | 后端整体 | 鉴权失败/不存在统一返回 200+success:false，UI 无法区分 |

### 低危（可选）
| 项 | 位置 | 简述 |
|---|---|---|
| P7 | ArticleComments.vue:96-103 | loadReplies 并发去重失效（幂等，影响小） |
| P10 | ArticleToc.vue:48-83 | setTimeout(50) 硬编码等待 DOM |
| S7 | stores/user.ts saveToStorage | 只写 'token' 不写 'accessToken'，跨 tab 边界 |
| P13~P28 | 多处 | 一批 UI 小瑕疵（详见 01-frontend-audit.md） |
| B6 | memberships/donation_notifications | 两个可选索引，性价比低 |

### 明确误报（不要重审）
| 项 | 结论 |
|---|---|
| P6 ArticleComments loadReplies L99 响应式 | 误报。Vue 3 Proxy 深层响应式，给已声明可选属性赋值正常触发更新 |

---

## 五、验证记录

### Backend
- `nest build`：通过
- 5100 端口：响应 200，返回真实数据
- 数据库索引核对：`SHOW INDEX` 确认所有热表索引齐全（见 02-backend-audit.md）

### Frontend
- `vue-tsc --noEmit`：通过
- `vue-tsc -b` 错误数：33 → 30（改的文件零错误，顺手清理 3 个历史错误）
- 剩余 30 个错误全部是历史遗留（v1 文件、未用 import、第三方类型缺失），与本轮无关
