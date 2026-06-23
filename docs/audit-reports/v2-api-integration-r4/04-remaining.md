# R4 未修项（留 R5 或产品决策）

---

## 一、可技术修复（留 R5）

### 中危

#### R5-1 X-Forwarded-For 可伪造
- **位置**：post.service.ts recordView + 各 controller 取 IP
- **问题**：未配 trust proxy，XFF 头可伪造绕过 IP 去重刷浏览量
- **建议**：main.ts 配 `app.set('trust proxy', ...)` + 使用方改 `req.ip`

#### R5-2 donation.sendThanks 非事务
- **位置**：donation.service.ts:177-232
- **问题**：code update + donation update 分离提交，crash 丢追溯
- **建议**：code + donation 包同一事务

#### R5-3 comment.moderate/delete 非事务
- **位置**：comment.service.ts:200-259
- **问题**：save/remove 后才 syncPostCommentCount，crash 计数不一致
- **建议**：包事务

#### R5-4 recordView 并发多 increment
- **位置**：post.service.ts:437-465
- **问题**：并发同 IP 请求都通过查重各 increment
- **建议**：post_views 加 (postId, ip, DATE) 唯一约束 + INSERT IGNORE 判 affectedRows

#### R5-5 setting batchUpdate 串行 N+1
- **位置**：setting.service.ts:124-160
- **问题**：N 个配置 N 次 findOne + N 次 save
- **建议**：INSERT ... ON DUPLICATE KEY UPDATE 单 UPSERT

#### R5-6 comment/interaction 批量操作串行同步计数
- **位置**：comment.service.ts batchModerate/batchRemove
- **问题**：N 个 post 各 count + update = 2N 查询
- **建议**：一次 GROUP BY 拿回所有计数 + 批量 update

#### R5-7 admin 上传白名单含 svg（XSS）
- **位置**：media.controller.ts multer fileFilter
- **建议**：移除 svg 或上传后 sanitize

### 低危

#### R5-8 changeEmail 未捕获并发 unique 冲突
- **位置**：user.service.ts:869-908
- **建议**：catch ER_DUP_ENTRY 转 ConflictException（409）

#### R5-9 admin uploaderId 回退默认 1
- **位置**：media.controller.ts:171 / post.controller.ts:176
- **建议**：改成抛 BadRequestException

#### R5-10 /code/verify 加 IP 限频
- **位置**：code.controller.ts:34
- **建议**：加入 SENSITIVE_DEFAULTS（R3 已脱敏字段，但枚举风险仍在）

#### R5-11 donation getPublicStats 加缓存
- **位置**：donation.service.ts:389-401
- **建议**：60s Redis 缓存（公开端点防刷）

---

## 二、需产品决策

### 产品-1 评论点赞
- 后端无评论点赞接口，前端死 UI 已在 R2 删除。是否实现（走 interaction entityType='comment'）？

### 产品-2 评论编辑
- 后端支持 PUT /comment/:id（仅 pending 可编辑），前端有 API 无 UI。列表只显示 approved，pending 的自己的评论看不到 → 编辑入口实际显示不出来。需产品决策编辑策略。

### 产品-3 用户注销
- 前端有 deleteAccount API（throw），后端无客户端注销接口，v2 无注销 UI。是否提供？

### 产品-4 上一篇/下一篇
- 当前从首页 12 条派生，超出范围失效。是否加 /post/:id/adjacent 按发布时间查？

### 产品-5 捐赠钱包地址动态化
- DonationDialog 硬编码钱包地址。是否加 /setting/public 动态获取？

### 产品-6 Profile 统计数据
- UserCenter 的 posts/followers/following 显示 '-'。是否加 /user/me/stats？

### 产品-7 用户名/邮箱可用性实时检查
- checkUsername/checkEmail 是 mock。是否加实时预检查接口？

---

## 三、四轮覆盖完整度

| 维度 | R1 | R2 | R3 | R4 | 状态 |
|---|---|---|---|---|---|
| 对接逻辑 | ✓✓✓ | | | | 完整 |
| 业务闭环 | | ✓✓✓ | | | 完整 |
| 安全（越权/泄露/上传）| | | ✓✓✓ | | 完整 |
| 并发数据一致性 | | | | ✓✓✓ | 完整 |
| 性能（N+1/缓存）| | | | ✓✓ | 基本完整（剩 setting/批量同步）|
| 限流/防刷 | | | ✓✓ | ✓ | 基本完整（剩 verify IP 限频）|
| 前端体验（三态/竞态）| ✓✓ | | | ✓✓ | 完整 |
| 前端性能（bundle）| | | | ✓✓ | 基本完整 |

**结论**：四轮后，v2 客户端 + 后端在对接、业务、安全、一致性、性能五个维度已基本完整。剩余项以产品决策（功能是否做）和边角优化（trust proxy / 批量 UPSERT）为主，不影响核心功能闭环。

R5 建议方向：
1. 产品决策项落地（评论点赞/编辑、上下篇、钱包动态化等）
2. 边角优化（trust proxy、setting UPSERT、批量计数同步）
3. 监控告警（Redis 故障、限流降级、审计失败）
