# R6 全站表格固定列错位系统性修复

## 现象

用户反馈：推广管理、黑名单、数据备份等多个表格的「操作」列（固定在右侧）被挤压、与左侧列重叠错位。

## 根因（系统性，非个别页面）

naive-ui 的 `n-data-table` 固定列（`fixed: 'right'`）要求：
1. **所有列必须有确定宽度**（`width`，非 `minWidth`）
2. **`scroll-x` ≥ 各列 width 之和**

只要有一个列用 `minWidth`（会随内容撑开）或没设 `width`（自动铺满），实际渲染宽度就会超过
`scroll-x`，导致固定列的定位计算错乱 → 操作栏被挤过去、与左边那列重叠。

这是**所有表格共用的 bug 模式**，之前每个页面各自踩了一遍，所以推广/黑名单/备份/媒体/会员/兑换码/资源全都有。

## 修复方法

写脚本逐文件扫描所有列定义，三类问题逐个清：

### 第一类：`minWidth` → `width`（4 处，最危险，会撑开）

| 文件 | 列 |
|------|-----|
| interaction/IndexView.vue | 文章标题列 |
| media/IndexView.vue | 文件名列、备注列 |
| membership/IndexView.vue | 备注列 |

### 第二类：补缺失的 `width`（3 处，自动铺满）

| 文件 | 列 |
|------|-----|
| blacklist/IndexView.vue | 原因列 |
| resource/IndexView.vue | 描述列 |
| rate-limit/IndexView.vue | 当前规则列 |

### 第三类：`scroll-x` 调至各列 width 精确总和（11 个表格）

脚本计算「各列 width 之和 + selection 列 40」，确保 `scroll-x` 严格 ≥ 总和：

| 文件 | 表格 | 列宽和 | 原 scroll-x | 改后 |
|------|------|--------|------------|------|
| ads | columns | 1390 | 1380 | 1390 |
| blacklist | columns | 920 | 1000 | 920 |
| ai-conversation | columns | 1090 | 950 | 1090 |
| ai-provider | columns | 1250 | 1200 | 1250 |
| audit-log | columns | 1180 | 1120 | 1180 |
| donation | columns | 1467 | 1270 | 1467 |
| media | columns | 1171 | 1032 | 1171 |
| rate-limit | columns | 840 | 820 | 840 |
| user | columns | 1434 | 1400 | 1434 |
| backup | logColumns | 1220 | 1320 | 1220 |
| backup | scheduleColumns | 750 | 660 | 750 |
| code | codeColumns | 1420 | 1360 | 1420 |
| membership | planColumns | 1400 | 1360 | 1400 |
| resource | catColumns | 820 | 660 | 820 |

## 验证

- 扫描脚本确认：**0 个 minWidth 残留**，所有 scroll-x 对齐列宽和
- `vue-tsc --noEmit` 0 error
- 这是 admin 前端改动，Vite 热重载生效，刷新即可见操作列归位
