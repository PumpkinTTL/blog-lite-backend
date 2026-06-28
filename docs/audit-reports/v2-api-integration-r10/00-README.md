# 第十轮代码审计与优化（R10）

> 日期：2026-06-28
> 范围：邮箱登录修复 + 表单校验补全 + PII 安全 + username 死代码清理 + UI/性能微优化
> 重点：上线前深度优化，功能性 bug、前端校验、安全泄漏、重构遗留清理

---

## 文档结构

| 文件 | 内容 |
|------|------|
| `00-README.md` | 本文件，总览 + 改动统计 |
| `01-email-login-fix.md` | 邮箱验证码登录 500 根因与修复（Redis hmset 兼容） |
| `02-form-validation.md` | 前端表单校验补全（validate.ts + LoginModal + UserCenter） |
| `03-security-deadcode.md` | PII 泄漏修复 + username 死代码清理 |
| `04-ui-perf.md` | UI 优化（分类列 NTag）+ 性能微优化（缩略图 lazy） |

## 背景：上线前扫描发现的问题

| # | 问题 | 严重度 | 类型 |
|---|------|--------|------|
| A | 邮箱验证码登录返回 500「服务器内部错误」 | 高 | 功能性 bug |
| B | 文章列表/详情的 author 对象泄漏作者 email、status | 高 | 安全（PII 泄漏） |
| C | v2 前端表单普遍无正则校验（邮箱/密码/验证码） | 中 | 健壮性 |
| D | username 字段删除后，前端大量残留类型定义和兜底分支 | 低 | 死代码 |
| E | 文章列表页「分类」列纯文本显示，视觉不统一 | 低 | UI |
| F | UserCenter 收藏缩略图未懒加载 | 低 | 性能 |

## 改动统计

| 类型 | 数量 | 关键项 |
|------|------|--------|
| Bug 修复 | 1 | 邮箱登录 500（Redis hmset 兼容） |
| 安全修复 | 1 | author PII 泄漏（裁剪为 id/nickname/avatar） |
| 新增工具 | 1 | `src/utils/validate.ts` 共享校验 |
| 表单校验补全 | 13 处 | LoginModal 9 + UserCenter 4 |
| 死代码清理 | 19 处 | admin 17 + v2 2 |
| UI 优化 | 1 | 分类列 NTag |
| 性能优化 | 1 | 缩略图 lazy |

## 验证结果

| 检查项 | 结果 |
|--------|------|
| 后端 `tsc --noEmit` | ✅ |
| 管理后台 `vue-tsc --noEmit` | ✅ |
| 前端 v2 `vue-tsc --noEmit` | ✅ |
| 后端 `nest build` | ✅ |
| 邮箱发码接口 | ✅ 返回 success |
| 验证码登录（测试用户 455336348） | ✅ 登录成功 |
| profile 接口无 username 字段 | ✅ |
| 文章 author 无 email/status | ✅ PII 修复确认 |

## 确认非 bug 项

| 项目 | 结论 |
|------|------|
| 注册硬编码默认角色 | `name: 'user'` 按语义标识查（非硬编码 id），行业通用做法，设计合理 |
