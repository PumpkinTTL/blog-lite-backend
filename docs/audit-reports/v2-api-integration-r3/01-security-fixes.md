# R3 安全修复清单

> 按 P0 → P1 分组，每条含：根因 / 攻击场景 / 修复 / 文件

---

## P0 致命

### S-P0-1 软删文章仍可访问（数据泄露）
- **根因**：`post.service.findById` 没过滤 deletedAt，软删（force=false）的文章仍可通过 `/post/:id` 访问到完整正文
- **攻击场景**：admin 软删一篇文章（实际只标记 deletedAt），用户仍可通过原 URL/ID 看到完整内容（含私密正文）
- **修复**：findById 查到后判断 `post.deletedAt` 非空则返回 null（对所有人不可见，包括详情接口）
- **文件**：post.service.ts:155-170

### S-P0-2 /code/verify 公开接口泄露 metadata（越权）
- **根因**：`code.controller.verify` 是 @Public，且 `data: result.code` 返回完整 CodeEntity，含 metadata（claimedUserId/donationId）、assignedDonationId、creatorId
- **攻击场景**：攻击者枚举或捡到码片段，调 /code/verify 即可读到码归属哪个用户/哪笔捐赠单，绘制内部数据关系图
- **修复**：verify 只回白名单字段 `{ type, status, expiresAt, maxUses, usedCount }`，不回敏感字段
- **文件**：code.controller.ts:32-56

---

## P1 重要

### S-P1-1 前台 R2 直传无文件类型校验（XSS/恶意文件）
- **根因**：`media.service.presignR2Upload` 只校验 size ≤ 10MB 和 app/folder 白名单，完全不校验 contentType。用户可上传 .html/.svg（存储型 XSS）/ .exe
- **攻击场景**：普通登录用户 presign 上传 .svg（含 JS payload）→ R2 托管 → 通过 getUrl 拿公网 URL → 配合 publicDomain 形成存储型 XSS 或恶意文件分发
- **修复**：
  - presignR2Upload 开头加 `isAllowedContentType` 校验（白名单：jpeg/png/gif/webp/bmp/ico，排除 svg）
  - confirmR2Upload 用 HEAD 返回的实际 contentType 二次校验（不信任前端传的 mimeType）
- **文件**：media.service.ts（presignR2Upload + confirmR2Upload + isAllowedContentType 私有方法 + ALLOWED_CONTENT_TYPES 常量）

### S-P1-2 异常过滤器把原始 Error.message 回传客户端（SQL/表名泄露）
- **根因**：`all-exceptions.filter.ts` 的 `else if (exception instanceof Error)` 分支把 `exception.message` 直接塞进 HTTP response。TypeORM 的 `ER_DUP_ENTRY`、SQL 语法错误、连接错误带主机名 等都会泄露给用户
- **攻击场景**：构造触发数据库原生错误的请求（超长字段触发 `Data too long for column`），response 带列名；unique 冲突带约束名 → 泄露数据库结构
- **修复**：非 HttpException 不覆盖 message（保持默认"服务器内部错误"），原始 message 只记日志
- **文件**：all-exceptions.filter.ts:34-42

### S-P1-3 membership/redeem 误用 @Public + 无专属限流（越权/防刷）
- **根因**：redeem 标 @Public 但实际依赖登录态（内部 if (!userId) return 请先登录），绕过了 AuthGuard 统一校验；且未登记限流规则，靠全局默认 100/min 兜底，刷码空间太大
- **攻击场景**：攻击者拿他人 token 疯狂调 /membership/redeem 试码，每次消耗 verify + DB 查询，可 DoS
- **修复**：
  - 去掉 @Public，改 @Roles()（任意登录用户），AuthGuard 统一处理 401
  - rate-limit-config 加 6 个敏感接口规则：sendLoginCode/loginByCode/sendChangeEmailCode/changeEmail/membership.redeem/resource.redeem
- **文件**：membership.controller.ts（@Public → @Roles）+ rate-limit-config.service.ts（SENSITIVE_DEFAULTS 补 6 条）

### S-P1-4 resource 浏览计数无去重可刷量 + 前端重复调用
- **根因**：
  1. `/resource/:id/view` 是 @Public 裸 increment，无任何去重（post 有 24h IP 去重，resource 没有）
  2. 后端 detail 接口已自动 incrementView，前端 ResourceDetail 又调一次 view → 每次访问 +2
- **攻击场景**：无限调 /resource/:id/view 刷浏览量，影响热门排序 + dashboard 统计
- **修复**：直接删掉 `/resource/:id/view` 接口 + 前端 recordResourceView 调用 + api 函数（detail 已自动 +1，足够）
- **文件**：resource.controller.ts（删 view 接口）+ resource.service.ts（保留 incrementView 给 detail 用）+ frontend ResourceDetail.vue + apis/resource.ts

---

## 本轮未修的安全项（见 03-remaining.md）

- EmailCodeService 内存存储（多实例失效，R3 标记留 R4）
- verify 接口仍 @Public（已脱敏字段，枚举风险降低，但建议加 IP 限流）
- X-Forwarded-For 可伪造绕过 IP 去重（需配 trust proxy）
- private 资源可被遍历 ID 探测（返回 locked + 元信息，建议改 404）
- admin 上传白名单含 svg（admin 可信，风险可控）
- interaction toggle 非原子（有 unique 兜底，体验问题）
