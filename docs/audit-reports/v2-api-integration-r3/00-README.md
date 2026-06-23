# 第三轮代码检查与优化（R3）— 安全与功能闭环

> 日期：2026-06-23
> 范围：全栈（backend api + admin + frontend v2），聚焦"安全漏洞 + 功能完整性 + 前后端契约一致性"
> 触发：R2 修完业务闭环后，发现全项目还存在一批越权/泄露/契约不一致问题
> 方式：3 个 Explore agent 并行扫描（功能对接完整性 + 安全与数据一致性 + 前后端契约）+ 人工核验

---

## 为什么有第三轮

R1 修了 v2 对接逻辑，R2 修了业务闭环（会员码/级联清理/状态机）。但 R2 聚焦"业务流程正确性"，没覆盖：
- **安全**：公开接口泄露敏感数据、越权访问、文件上传无类型校验、异常细节回传客户端
- **功能完整性**：前后端契约不一致（类型/枚举）、死字段误导、客户端做了该服务端做的事

R3 集中扫这三块，确保"客户端+服务端安全完美闭环"。

---

## 文档结构

| 文件 | 内容 |
|---|---|
| `00-README.md` | 本文件，总索引 + 快速结论 |
| `01-security-fixes.md` | 安全修复清单（越权/泄露/上传/限流） |
| `02-contract-fixes.md` | 前后端契约 + 功能完整性修复 |
| `03-remaining.md` | 未修项（留 R4 或产品决策） |

---

## 快速结论

### 本轮处理统计

| 维度 | 数量 |
|---|---|
| P0 致命 | 3（软删文章可访问 / verify 泄露 metadata / DonationStatus 类型冲突）|
| P1 重要 | 5（文件上传无校验 / 异常泄露 / redeem 越权 / 限流缺失 / Shop 客户端过滤）|
| P2 一般 | 2（resource view 重复计数 + 死字段）|

### 关键修复（按影响排序）

1. **软删文章仍可访问**（P0 数据泄露）：post.findById 加 deletedAt 过滤，软删文章对所有人不可见
2. **/code/verify 泄露 metadata**（P0 越权）：公开接口只回白名单字段（type/status/expiresAt/maxUses/usedCount），不回 metadata/claimedUserId/donationId
3. **前台 R2 直传无文件类型校验**（P1 安全/XSS）：presign + confirm 加图片类型白名单 + HEAD 二次校验，防上传 html/svg/exe
4. **异常过滤器泄露 SQL/表名**（P1 泄露）：非 HttpException 不回传原始 message，只记日志 + 通用提示
5. **redeem 误用 @Public + 无限流**（P1 越权/防刷）：去掉 @Public 让 AuthGuard 统一处理 + 加 6 个敏感接口限流规则
6. **resource view 重复计数 + 可刷量**（P1+P2）：删掉冗余的 /resource/:id/view 接口（detail 已自动 +1）

### 验证方式

- 后端：watch 模式热重启，代码已编译（无 TS 错误）
- 前端：未跑构建（遵守"不构建"规则）
- 限流规则：需重启后端让 RateLimitConfigService 重新 seed（首次启动 seed 新规则到 settings 表）

---

## 与 R1/R2 的关系

- R1 修的项本轮**没有重审**
- R2 修的项本轮**没有重审**
- R3 是安全与契约层面的收尾，覆盖 R1/R2 未触及的越权/泄露/一致性

三轮后，v2 客户端 + 后端的安全与功能闭环基本完整。

---

## 后续 AI 扫描指引

下一轮（R4）扫描时：

1. **先读 R1 + R2 + R3 全部文档**，了解已修边界
2. **重点扫 R3 留的未修项**（见 `03-remaining.md`）
3. **关注本次新引入的代码**：
   - 文件类型白名单 `isAllowedContentType`（未来加新类型要更新）
   - 限流规则（admin 可在设置页调阈值）
   - Shop 的 categoryId 过滤（确认 siteStore.categories 有数据）
4. **安全回归测试**建议：
   - 遍历 /resource/1..N 确认 private 资源返回 404/locked 不泄露正文
   - 构造超长字段触发 DB 错误，确认响应是通用提示不含 SQL
   - 上传 .html/.svg 确认被拒
