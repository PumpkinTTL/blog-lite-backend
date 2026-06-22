# v2 接入真实 API 后第一轮审查（R1）

> 日期：2026-06-22 ~ 2026-06-23
> 范围：v2 客户端（`src/views/v2/` + `src/components/v2/` + `src/apis/` + `src/stores/` + `src/utils/`）+ backend api 配套字段/索引
> 触发条件：v2 各页面从 mock 数据切换为真实接口后，做一次系统性逻辑审查
> 执行：3 个 Explore agent 并行扫描（API 层 / 页面组件层 / store+router 层）+ 人工逐条核验

---

## 为什么有这个目录

v2 客户端刚完成"接入真实后端接口"的切换（comment 删除、donation/media/user 公开接口、shop/resource/收藏/通知 全部接通）。切换后必然存在一批"接口对得上但逻辑有坑"的遗留问题，需要一次集中扫描。

本轮已修的不再重审，**本轮记录但未修的（误报 / 范围外 / 低优先级）留给下一轮 AI 扫描时参考，避免重复发现**。

---

## 文档结构

| 文件 | 内容 |
|---|---|
| `00-README.md` | 本文件，总索引 + 快速结论 |
| `01-frontend-audit.md` | 前端审查报告：API 层 / 页面组件 / store+router 三类问题清单 |
| `02-backend-audit.md` | 后端审查报告：entity 字段缺失 / 悬空装饰器 / 索引复查 |
| `03-fixes-applied.md` | 本轮已修项的完整清单（commit 映射 + 修法 + 验证） |

---

## 快速结论

### 本轮处理统计

| 维度 | 数量 |
|---|---|
| 提交数（frontend） | 6 个（`2f4ab79` → `5e9f6eb`） |
| 提交数（backend） | 3 个（`216430c` / `619ae6c` / `7ef8aa4`） |
| 高危逻辑 bug 修复 | 6 个 |
| 中危问题修复 | 6 个 |
| 数据库索引补建 | 12 个（含 1 个真 bug 修复） |
| 历史类型错误顺手清理 | 3 个 |

### 验证状态

- backend：`nest build` 通过；5100 端口响应 200；所有热表索引已建成并核对
- frontend：`vue-tsc --noEmit` 通过；`vue-tsc -b` 错误数从 33 → 30（改的文件零错误，还顺手修了 3 个历史错误）
- 数据库脏索引 `code_usage_logs.used_at` 已清理（详见 `03-fixes-applied.md` 的"踩坑记录"）

---

## 后续 AI 扫描指引

下一轮扫描时请：

1. **先读本目录全部 4 个文件**，了解 R1 已修了什么、留了什么
2. **重点扫 R1 留的未修项**（见 `01-frontend-audit.md` 末尾"未修项"和 `03-fixes-applied.md` 末尾"未修清单"）
3. **不要重复审查 R1 已修的项**（见 `03-fixes-applied.md` 的 commit 映射）
4. **关注本次切换引入的新代码**：v2 各 `apis/*.ts` 与 backend controller 的字段对齐、store 持久化与 request.ts 续签的协调、详情页竞态
5. **数据库索引类问题**：先 `SHOW INDEX` 看实际状态，不能只看 entity 定义（详见踩坑记录）
