# 第五轮代码审计与优化（R5）

> 日期：2026-06-24
> 范围：v2 客户端（src/）+ admin 后台（backend/admin/）+ API 后端（backend/api/）
> 重点：冗余请求、重复逻辑、边界值、内存/监听器泄漏、类型安全、死代码

---

## 文档结构

| 文件 | 内容 |
|------|------|
| `00-README.md` | 本文件，总览 + 优先级 |
| `01-findings.md` | 三端发现的问题清单（带文件行号 + 严重度）|
| `02-fixes.md` | 修复记录（改了什么、为什么）|

---

## 审计覆盖

- **v2 客户端**：views/v2、components/v2、stores、apis、utils、composables
- **admin 后台**：api、stores、composables、views（24 个）
- **API 后端**：modules 下 service/controller、common、main.ts

## 发现汇总

| 端 | P0（必修）| P1（应修）| P2（优化）|
|----|----------|----------|----------|
| v2 客户端 | 3 | 10 | 2 |
| admin | 3 | 7 | 5 |
| API 后端 | 4 | 6 | 5 |
| **合计** | **10** | **23** | **12** |

## 本轮修复优先级

**P0（功能 bug / 安全 / 内存泄漏）— 必修**：
1. ai-provider 路由顺序：`@Delete(':id')` 拦截了 `@Delete('batch')`，批量删除失效
2. API Key 明文泄露在源码（ai-provider.service.ts 种子数据）
3. PostCard 互动状态不随 props 更新（列表刷新后状态错乱）
4. stores/user.ts storage 监听器 + nprogress MutationObserver 泄漏
5. admin request.ts 续签用裸 axios（不带 requestId）+ isRedirecting 永不重置

**P1（边界值 / 类型 / 数据一致性）**：
- 密码/验证码 DTO 缺 @MaxLength
- getProfile 返回 registerIp 等管理字段给普通用户
- PostCard getInitial 对 emoji 截断
- DonationDialog usdtAmount NaN 兜底
- 批量删用户不做级联清理
- admin 列表翻页竞态（无请求序号）
- admin useCrudList 分页样板代码重复（12+ view）

**P2（清理）**：
- 死代码：checkUsername/checkEmail/getMembership/refreshToken/__userInfo/deleteAccount
- email-code 用 console.error 绕过 Logger
- resolveFileUrl 4 处重复

详细清单见 `01-findings.md`，修复记录见 `02-fixes.md`。
