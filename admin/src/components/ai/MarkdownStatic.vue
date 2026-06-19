<script setup lang="ts">
/**
 * 轻量静态 Markdown 渲染器
 * ==========================================================================
 * 为什么不用 markstream-vue：它是为"流式打字机效果"设计的，内部有大量
 * ResizeObserver / getBoundingClientRect（每条消息 14+ 处），渲染后内容高度
 * 仍在反复重排（scrollHeight 持续波动），导致聊天列表从下往上滚时视口被顶飞、
 * 严重抖动。CSS 层（content-visibility / overflow-anchor）无法根治，因为根源
 * 是渲染器自身一直在动。
 *
 * 本组件用 markdown-it + DOMPurify 做纯同步渲染：content 变化 → 全文重新解析
 * 成 HTML → XSS 过滤 → v-html 输出。渲染完即静止，不再有任何重排，滚动稳定。
 * 失去的只是"逐字打字机动画"，但 AI 文本一段段整体出现的观感差别很小
 * （ChatGPT 网页版也是整段刷新）。
 *
 * 性能：markdown-it 单例（创建一次），单条消息解析通常 <1ms。
 * ==========================================================================
 */
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const props = defineProps<{
  content: string
}>()

// markdown-it 单例：全应用共享一个解析器实例，避免重复初始化开销。
// 开启：代码高亮占位（code 标签）、表格、删除线、链接转义等聊天常用特性。
// 关闭：html 内联（安全），typographer（不需要）。
const md = new MarkdownIt({
  html: false,        // 禁止原始 HTML（配合 DOMPurify 双保险）
  breaks: true,       // 单换行转 <br>（聊天场景）
  linkify: true,      // 自动识别链接
  typographer: false,
})

// 安全起见：markdown-it 已经禁了 html，但再过一遍 DOMPurify 防止任何注入。
// 只放行聊天 markdown 需要的标签/属性，去掉 script/style/form 等危险元素。
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'del', 's', 'mark', 'sub', 'sup',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'a', 'img', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'input',
]
const ALLOWED_ATTR = ['href', 'title', 'src', 'alt', 'target', 'rel', 'type', 'checked', 'disabled']

// 渲染：content → HTML → 净化。computed 缓存，content 不变不重算。
// DOMPurify.sanitize 返回 string（默认 RETURN_DOM 为 false）。
const html = computed(() => {
  if (!props.content) return ''
  const raw = md.render(props.content)
  return DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR }) as unknown as string
})
</script>

<template>
  <div class="md-static" v-html="html"></div>
</template>

<style scoped>
/* 渲染容器：不设任何视觉样式，交给父组件（.ai-reply）统一控制。
   v-html 内容是普通 HTML（非 scoped 子组件），父组件用非 scoped 或 :deep 样式覆盖。 */
.md-static { display: contents; }
</style>
