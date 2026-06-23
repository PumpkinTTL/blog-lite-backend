# R3 未修项（留 R4 或产品决策）

> 本轮发现但未修的问题，按"可技术修复"和"需产品决策"分类

---

## 一、可技术修复（留 R4）

### 中危

#### R4-1 EmailCodeService 用内存 Map 存验证码
- **位置**：email-code.service.ts:14-15
- **问题**：多实例部署直接失效（A 发码 B 验证必失败）+ 重启丢失 + 防刷维度单实例
- **建议**：迁移 Redis（项目已有 RedisModule）
- **严重度**：中（单实例无影响，水平扩容必崩）

#### R4-2 private 资源可被遍历 ID 探测
- **位置**：resource.service.ts:48-119（findAll）vs 135-204（findByIdForUser）
- **问题**：登录用户遍历 /resource/1..N，private 资源返回 locked + 标题/封面等元信息，泄露资源存在性
- **建议**：private 资源对未授权用户返回 404（当作不存在），而非 locked + 元信息
- **严重度**：中（信息泄露）

#### R4-3 X-Forwarded-For 可伪造绕过 IP 去重
- **位置**：post.service.ts:441-458（recordView）
- **问题**：IP 从 req.headers['x-forwarded-for'] 取，未校验可信代理链，攻击者伪造 XFF 头每次 IP 不同绕过 24h 去重
- **建议**：配 Express trust proxy 白名单，或改用 req.ip
- **严重度**：中（影响浏览量真实性）

#### R4-4 EntityVisibilityService.setVisibility 非事务
- **位置**：entity-visibility.service.ts:22-52
- **问题**：先 delete 再 save 两步无事务，并发可能 delete 后 save 失败 → 资源对所有用户无授权
- **建议**：包 transaction
- **严重度**：中

#### R4-5 interaction toggle 非原子
- **位置**：interaction.service.ts:32-55
- **问题**：先 findOne 再 save/remove 无事务无锁，并发双击点赞第二个触发 unique 约束抛原生 SQL
- **建议**：用 ON DUPLICATE KEY 或事务 + 悲观锁
- **严重度**：中（有 unique 兜底，但用户体验看到错误）

#### R4-6 /code/verify 仍 @Public 可枚举
- **位置**：code.controller.ts:34
- **问题**：R3 已脱敏字段（不再泄露 metadata），但仍可无限次探测码是否存在/状态
- **建议**：加 IP 级限频（加入 SENSITIVE_DEFAULTS）
- **严重度**：低-中（R3 已脱敏，枚举价值降低）

#### R4-7 LIKE 关键词未转义 %/_
- **位置**：apply-filters.ts:36-41 + 多处手写 LIKE
- **问题**：搜索 `100%` 会匹配任意 `100` 开头；`_` 匹配任意单字符。功能性问题非注入
- **建议**：转义 `keyword.replace(/[%_\\]/g, m => '\\'+m)` + LIKE 后加 `ESCAPE '\\'`
- **严重度**：低（搜索结果不准，不泄露数据）

### 低危

#### R4-8 admin 上传白名单含 svg
- **位置**：media.controller.ts multer fileFilter
- **问题**：svg 可内嵌 JS（存储型 XSS），admin 端有角色守卫但仍是隐患
- **建议**：从白名单移除 svg，或上传后 sanitize

#### R4-9 admin uploaderId 回退默认 1
- **位置**：media.controller.ts:171 / post.controller.ts:176
- **问题**：`parseInt(payload.user?.sub ?? '1')` 回退默认 1（admin 用户），守卫失效时匿名上传归属 admin
- **建议**：改成抛 BadRequestException

#### R4-10 grantAccess / setVisibility 并发可丢授权
- **位置**：resource.service.ts:250-264
- **问题**：setVisibility 的 delete+insert 非事务，并发写同一 entityId 不同 userId 可能丢授权
- **建议**：事务包裹，或改 INSERT IGNORE 单语句追加

#### R4-11 changeEmail 未捕获并发 unique 冲突
- **位置**：user.service.ts:869-908
- **问题**：两用户同时绑同邮箱，第二个触发 ER_DUP_ENTRY（R3 已不回传 message，但仍是 500）
- **建议**：捕获该错误转 ConflictException（409 + 友好提示）

---

## 二、需产品决策

### 产品-1 评论点赞
- **现状**：R2 删除了评论点赞死 UI，后端无评论点赞接口
- **待决策**：是否实现评论点赞（走 interaction entityType='comment'）？

### 产品-2 评论编辑
- **现状**：后端支持 PUT /comment/:id，前端有 updateComment API 但无编辑 UI
- **待决策**：是否允许用户编辑自己的评论？

### 产品-3 用户注销
- **现状**：前端有 deleteAccount API（throw 未实现），后端无客户端注销接口，v1 有注销 UI 但 v2 没有
- **待决策**：是否提供用户自助注销？（软删除 + 数据保留策略）

### 产品-4 上一篇/下一篇
- **现状**：从首页 12 条派生，超出第一页或筛选列表时无上下篇
- **待决策**：是否加 /post/:id/adjacent 接口按发布时间查真正的上下篇？

### 产品-5 用户名/邮箱可用性实时检查
- **现状**：前端 checkUsername/checkEmail 是 mock（永远 available:true），后端注册时才校验
- **待决策**：是否加 /user/check-username / /user/check-email 接口做实时预检查？

### 产品-6 捐赠钱包地址动态化
- **现状**：DonationDialog 钱包地址硬编码（TODO 从后端设置接口获取），后端无 /setting/public 接口
- **待决策**：是否加 /setting/public 返回钱包地址，前端动态获取？

### 产品-7 Profile 统计数据
- **现状**：UserCenter 的 posts/followers/following 显示 '-'（后端无聚合接口）
- **待决策**：是否加 /user/me/stats 返回发文数/关注数/粉丝数？

---

## 三、R1/R2/R3 三轮覆盖总结

| 轮次 | 主题 | 修复数 |
|---|---|---|
| R1 | v2 对接 API 逻辑（竞态/缓存/字段不匹配）| 6 commit, 6 高危 + 6 中危 |
| R2 | 业务闭环（会员码/级联清理/状态机/错误处理）| 24 个（7 P0 + 8 P1 + 9 P2）|
| R3 | 安全与契约（越权/泄露/上传/限流/类型对齐）| 10 个（3 P0 + 5 P1 + 2 P2）|

三轮后 v2 客户端 + 后端的安全与功能闭环基本完整。R4 建议聚焦：
1. Redis 迁移（email-code + 限流降级）
2. private 资源访问控制收紧
3. 性能优化（N+1 / 批量操作 / 缓存）
4. 产品决策项的落地
