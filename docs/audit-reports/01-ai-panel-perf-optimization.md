# AI 写作面板性能优化报告

> 日期：2026-06-19
> 范围：`admin/src/components/ai/AgentPanel.vue` + `ToolCallCard.vue`
> 目标：解决「加载多个对话记录后滚动掉帧」，达到工业级渲染性能

## 问题现象

用户反馈：加载多条对话记录后，滚动出现明显掉帧，尤其在含联网工具（web_search）的消息附近。

## 根因分析（基于代码审查 + 编译器/框架行为验证）

### 根因 1：消息项深度响应式代理开销

`addRenderItem` 对每个消息项调用 `reactive(item)`，产生**深度响应式代理**。
历史消息（已完成、内容不变）本不需要深度代理，但每条都背上了完整的 Proxy 拦截层。
列表越长，响应式依赖收集与触发开销越大。

```js
// 优化前
function addRenderItem(item: RenderItem) {
  const reactiveItem = reactive(item)  // 深度代理，历史消息不需要
  renderItems.value.push(reactiveItem)
  return reactiveItem
}
```

### 根因 2：滚动时整列表 patch（核心元凶）

`onScroll` 节流到 rAF 后，`updateScrollUi` 仍会写 `showBackBtn`/`arrowDown` 等 ref。
这些 ref 变化触发 Vue 重新 patch **整个 `visibleItems` 列表**——
因为没有任何 memo 隔离，每条历史消息都要走一遍 VNode diff。

**这是「列表越长越卡」的直接原因**：N 条消息 = N 次 patch diff，即使内容没变。

## 优化方案（业界标准）

### 优化 1：`shallowReactive` 替代深度 `reactive`

历史消息的流式更新只涉及**顶层属性赋值**（`item.replyText = ... + tok`），
`shallowReactive` 顶层响应式即可驱动流式更新，深层对象（如 `toolCall`）无需代理。

```js
// 优化后
function addRenderItem(item: RenderItem) {
  const reactiveItem = shallowReactive(item)  // 仅顶层响应式
  renderItems.value.push(reactiveItem)
  return reactiveItem
}
```

**收益**：消除每条消息深层对象的 Proxy 拦截开销。流式更新兼容性已验证（顶层赋值正常触发）。

### 优化 2：`v-memo` 隔离历史消息 patch

对消息列表加 `v-memo`，仅当消息项的可见字段变化时才 patch 该项。
历史消息这些值不变 → 滚动/按钮状态变化时 Vue **完全跳过该项 diff**。

```html
<!-- 优化后：包裹 div 承载 v-memo -->
<div
  v-for="item in visibleItems"
  :key="item.id"
  v-memo="[item.text, item.replyText, item.thinkText, item.streaming,
          item.toolStatus, item.toolResult, item.toolProgress,
          thinkExpanded.has(item.id), itemUsage[item.id], isDark]"
  class="msg-wrap"
>
  <!-- 原三分支消息模板不变 -->
</div>
```

**关键技术决策**：

1. **为什么用包裹 div 而非 `<template v-for v-memo>`**：
   Vue 3.5.34 + rolldown 编译器对 `<template v-for v-memo>` 组合有 bug
   （`processFor` → `processExpression` 抛 `Cannot read properties of undefined`）。
   已用最小复现验证：普通 `<div v-for v-memo>` 正常，仅 `<template>` 组合崩溃。
   故用包裹 div 承载 v-memo 绕过。

2. **`display: contents` 保持布局不变**：
   包裹 div 设 `display: contents`，自身不产生布局盒，
   `.msg` 仍是 `.panel-body`（flex column gap）的直接子项，间距/对齐完全不变。

3. **memo 依赖数组包含外部状态**：
   `thinkExpanded.has(item.id)`（折叠状态）、`itemUsage[item.id]`（token 显示）、`isDark`（主题）
   都纳入 memo。它们变化时对应项才重渲染，滚动时这些不变 → memo 命中 → 跳过 patch。

## 前置优化（本次任务前已完成）

此前已修复的滚动性能问题（commit `df41272`）：
- ToolCallCard 的 `setInterval` 揭示动画（web_search 卡顿真凶）
- `onScroll` 响应式写入节流到 rAF
- `loadMoreAbove` 防重入加固

## 验证

- `vue-tsc --noEmit`：通过（仅历史 TS6133 未使用警告）
- `vite build`：✓ 1.43s
- **UI 零改动验证**：diff 过滤样式关键词 = 空，确认只新增 `.msg-wrap{display:contents}` 一行 + v-memo 结构，无任何现有样式值改动

## 性能预期

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 滚动时（N条历史消息） | 每帧 patch N 条 VNode diff | 跳过所有未变项，仅 patch 按钮状态 |
| 响应式追踪开销 | 每条深度 Proxy | 每条浅 Proxy |
| loadMoreAbove 加载50条 | 50条深度代理 + 挂载 | 50条浅代理 + 挂载 |

**理论提升**：滚动时 patch 复杂度从 O(N) 降到 O(1)（仅按钮），响应式代理开销降低。
