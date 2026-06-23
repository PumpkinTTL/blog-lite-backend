# R2 未修项（留 R3 或产品决策）

> 本轮发现但未修的问题，按"可技术修复"和"需产品决策"分类

---

## 一、可技术修复（留 R3）

### 中危

#### R3-1 EmailCodeService 用内存 Map 存验证码
- **位置**：email-code.service.ts:14-15 `private readonly store = new Map()`
- **问题**：多实例部署直接失效（A 实例发码 B 实例验证必失败）+ 重启丢失所有待验证码
- **建议**：改用 Redis（项目已有 RedisModule）
- **严重度**：中（单实例无影响，水平扩容必崩）

#### R3-2 code 的 expired 状态从未被写入
- **位置**：code.entity.ts enum 有 'expired'，但无任何代码主动写入
- **问题**：expiresAt 过期的码在 DB 仍是 active，管理后台按 status=active 过滤会混入已过期码
- **建议**：加定时任务（参考 membership.service.ts:62-76 的 sweepExpired 模式）
- **严重度**：中（影响管理端展示准确性）

#### R3-3 InteractionService.toggle 非原子
- **位置**：interaction.service.ts:32-55
- **问题**：先 findOne 再 save/remove 无事务无锁，并发双击点赞第二个触发 unique 约束抛原生 SQL 错误
- **建议**：用 ON DUPLICATE KEY 或事务 + 悲观锁
- **严重度**：中（有 unique 约束兜底，但用户体验是看到错误）

#### R3-4 code verify 接口 @Public 可枚举码
- **位置**：code.controller.ts:34-43
- **问题**：verifyCode 接口无需登录，可暴力探测码是否存在（返回"码不存在"vs"码状态为 active"区分）
- **建议**：加登录要求或 IP 限频
- **严重度**：中（安全）

#### R3-5 resource view 无防刷
- **位置**：resource.service.ts:311-313（incrementView 裸 increment）
- **问题**：post 的 recordView 有 24h 同 IP 去重，resource 完全没有，可被刷量
- **建议**：参照 post 的 IP 去重表
- **严重度**：中

#### R3-6 EntityVisibilityService.setVisibility 非事务
- **位置**：entity-visibility.service.ts:22-52
- **问题**：先 delete 再 save 两步无事务，并发可能 delete 后 save 失败 → 资源对所有用户无授权
- **建议**：包 transaction
- **严重度**：中

### 低危

#### R3-7 DonationService.exportCsv 全量加载
- **位置**：donation.service.ts:316-348
- **问题**：一次 take 10000 拼 CSV，大表 OOM
- **建议**：流式输出

#### R3-8 MediaService.decodeFilename 正则字符可疑
- **位置**：media.service.ts:312-321
- **问题**：`/[ÃÂÄÅåäöü]/` 字符集可能是 latin1 误读 utf-8 的产物
- **建议**：核对源码字节

#### R3-9 AiProviderEntity 硬编码 API Key
- **位置**：ai-provider.service.ts:9-22
- **问题**：`apiKey: 'sk-...'` 硬编码在源码
- **建议**：立即轮换 key + 改环境变量读取

#### R3-10 审计日志多处 fire-and-forget 静默失败
- **位置**：user.service / setting.service 等多处 `.catch(() => {})` 或 `.catch(() => warn)`
- **问题**：审计失败不阻塞主流程（合理），但完全静默会丢失合规记录
- **建议**：至少 warn 级别日志（部分已修，剩余的补齐）

---

## 二、需产品决策（不技术修复）

### 产品-1 会员升降级策略
- **当前**：升级作废低级（不折算）+ 降级拒绝
- **待决策**：升级时是否折算剩余时长？（如 Plus 剩 15 天按比例折算成 Pro 7.5 天）
- **本轮选择**：不折算（最简单清晰）。如需折算，grant 方法加 upgradePolicy 参数

### 产品-2 邮箱换绑是否需旧邮箱验证
- **当前**：换绑只需新邮箱验证码（accessToken 已证明身份）
- **待决策**：高安全场景是否要求"旧邮箱 + 新邮箱"双重验证？
- **本轮选择**：单验证（用户友好）。如需双重，加 send-old-email-code 接口

### 产品-3 resource 兑换是否补 claimedUserId 校验
- **当前**：会员码锁归属（claimedUserId），资源码不锁
- **待决策**：资源码是否也锁归属？
- **本轮选择**：不锁（资源码场景不同，资源码通常公开分发）

### 产品-4 时区统一
- **当前**：用 `new Date()` 服务端本地时间存 datetime 列
- **待决策**：是否统一 UTC？（跨时区部署会漂移）
- **本轮选择**：不改（单时区部署无影响）

---

## 三、性能优化（留 R3，性价比排序）

| 优先级 | 项 | 收益 |
|---|---|---|
| 高 | resource findAll 改 getVisibilityBatch（消除 N+1）| 资源列表页查询从 N+1 降到 2 |
| 中 | dashboard 加 Redis 缓存 60s | admin 频繁刷新不压 DB |
| 中 | comment/interaction 批量操作改批量 UPDATE 子查询 | 批量审核/删除从 2N 查询降到 1 |
| 低 | setting batchUpdate 批量 upsert | 配置保存从 2N 降到 1 |
| 低 | ai-conversation 用 JSON_LENGTH | 列表查询不解析大 JSON |
| 低 | CSV 流式输出 | 大表导出不 OOM |

---

## 四、本轮未触及的模块（R3 扫描建议）

R2 聚焦 user/membership/code/donation/resource/post/announcement，以下模块本轮未深入：

| 模块 | R3 关注点 |
|---|---|
| ai-conversation | JSON.parse 性能、postId 关联清理 |
| ai-provider | 硬编码 key、配置管理 |
| media | 秒传并发、hash 唯一索引、文件名解码 |
| tag/category | 常规小表，预期问题少 |
| friend-link/announcement | 二态 toggle OK，sortOrder 已修 |
| setting | 批量更新性能、value 校验 |
| blacklist | expiresAt 过期清理 |
| post-view | IP 去重逻辑边界 |
| r2-storage | OSS 配置、错误处理 |
| dashboard | 20 查询无缓存 |
