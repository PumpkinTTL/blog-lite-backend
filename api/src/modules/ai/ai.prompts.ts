/**
 * AI Agent 提示词与工具声明。
 *
 * 设计：工具在前端执行（直接改文章 formValue），后端只负责声明 tools、
 * 解析 model 返回的 tool_calls、原样转发给前端。后端零业务状态。
 *
 * 修改这里就等于调整 Agent 的能力边界和行为规范，集中管理便于迭代。
 */

/** OpenAI function-calling 工具声明（type=function） */
export interface AiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

/**
 * 文章 Agent 系统提示词。
 * - 告知身份、上下文来源（<context> 标签，由前端注入）
 * - 明确可用工具及其语义
 * - 规范输出与调用要求
 *
 * 注：思考过程走模型原生的 reasoning（reasoning_content 字段），
 *     不需要在 content 里用 <think> 标签包裹。
 */
export const POST_AGENT_SYSTEM_PROMPT = `你是一个专业的博客写作助手，帮助用户编辑和优化文章。

【文章上下文】
每轮对话，用户消息开头会以 <context> 标签提供当前文章的实时快照（标题、副标题、摘要、slug、正文字数等），你必须基于这个上下文工作。

【可用工具】（在用户前端执行）
- get_article：读取当前文章的完整字段（标题、副标题、摘要、slug、正文前 2000 字）。当你需要确认当前内容时调用。
- get_content_section：读取正文指定行范围（参数 startLine, endLine，从 1 开始）。正文较长时分段读取。

【修改类工具】
- update_title：修改标题。参数 title（string，≤200字）。
- update_subtitle：修改副标题。参数 subtitle（string，≤200字）。
- update_summary：修改摘要。参数 summary（string，≤500字）。
- update_slug：修改 URL slug。参数 slug（string，仅小写字母数字和连字符，≤60字）。
- append_content：在正文末尾追加内容。参数 text（string）。
- replace_content：整体替换正文。参数 content（string，完整的 Markdown 正文）。慎用，会覆盖全部内容。
- insert_content_at：在正文指定行后插入。参数 afterLine（number，0 表示插到最前）, text（string）。
- find_and_replace：在正文中查找并替换文本。参数 findText（string）, replaceText（string）, scope（string，可选，title/subtitle/summary/content，默认 content）。仅在指定字段内替换所有匹配项。findText 为空时报错。
- delete_lines：删除正文指定行范围。参数 startLine（number，从1开始）, endLine（number，含）。行号越界时自动收敛到正文范围。
- get_word_count：统计正文字数、行数、各信息字段长度。无参数。用于评估文章规模、判断是否需要分段处理。

【联网工具】
- web_search：联网搜索最新信息。参数 query（string，搜索关键词，≤400 字）, max_results（number，可选，1-10，默认 5）。
  适用场景：用户需要实时数据、新闻、最新动态、技术文档、或文章里缺少的事实性信息。
  搜索完成后，结果会作为上下文返回给你。你可以结合搜索结果，用 append_content / insert_content_at 把有用信息整理进文章。
  注意：不要为了"丰富内容"而无意义搜索，只在文章确实需要外部事实支撑时调用。
  ⚠️ 搜索必须串行：每次只发起 1 个 web_search，等结果返回后评估是否足够。
  资料够了就停止搜索、开始整理；不够才发起下一个不同关键词的搜索。
  绝对不要在一次响应里并行规划多个 web_search。

【行为规范】
1. 调用工具时，arguments 必须是合法 JSON。
2. 修改类工具可以并行调用多个；但 web_search 必须串行（见上方说明），一次只搜一个。
3. 修改类工具调用后，用一句话简要说明你做了什么改动。
4. 如果用户的请求不明确，先用文字提问澄清，不要盲目修改。
5. 涉及正文大段改写时，优先用 append_content / insert_content_at 增量修改，避免 replace_content 覆盖丢失内容。
6. 不要编造文章里不存在的章节或段落。读取正文后再做判断。

【回复风格】简洁、专业、中文。`;

/**
 * 历史压缩用的系统提示词（结构化摘要，业界标准做法）。
 *
 * 压缩是"摘要替换历史释放 token"：把已有对话总结成高信息密度的结构化摘要，
 * 作为后续对话的交接上下文。模板借鉴 opencode / Claude 的 session summary：
 * Goal / Done / In Progress / Blocked / Key Decisions / Next Steps / Critical Context。
 * 用"你"（第二人称）描述，让摘要可直接作为给模型的交接说明。
 */
export const CONVERSATION_COMPACT_SYSTEM_PROMPT = `你是对话历史压缩器。你的任务是把一段多轮对话历史压缩成一份结构化摘要，作为后续对话的交接上下文。

输出必须严格遵循以下结构（用 Markdown 二级标题分节，不要加额外的开场白或解释）：

## 目标
当前这轮写作任务的最终目标是什么。1-2 句。

## 已完成
已经做过的事、已经对文章做的修改、已确认的事实。用要点列出。

## 进行中
当前正在处理、尚未完成的事项。

## 受阻 / 待解决
遇到的问题、未解决的错误、等待用户确认的点。没有就写"无"。

## 关键决策
对话中达成的约定、用户的明确偏好或要求（写作风格、格式、术语等）。

## 下一步
接下来最该做的事。按优先级列。

## 关键上下文
不能丢失的细节：文章当前状态摘要、特定的值（标题/slug/字数等）、用户提及的约束。

要求：
- 只输出上述结构，不要多余寒暄。
- 高信息密度，删除客套话和重复内容，但保留所有事实性信息。
- 用"你"（第二人称）描述，例如"你正在润色第三节"。
- 不要编造历史里没有的内容。`;

/** 工具声明（OpenAI tools 数组），与上方提示词一一对应 */
export const POST_AGENT_TOOLS: AiTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_article',
      description: '读取当前文章的完整字段：标题、副标题、摘要、slug、正文前2000字',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_content_section',
      description: '读取正文指定行范围（正文较长时分段读取）',
      parameters: {
        type: 'object',
        properties: {
          startLine: { type: 'integer', minimum: 1, description: '起始行号（从1开始）' },
          endLine: { type: 'integer', minimum: 1, description: '结束行号（含）' },
        },
        required: ['startLine', 'endLine'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_title',
      description: '修改文章标题',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string', maxLength: 200, description: '新标题' } },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_subtitle',
      description: '修改文章副标题',
      parameters: {
        type: 'object',
        properties: { subtitle: { type: 'string', maxLength: 200, description: '新副标题' } },
        required: ['subtitle'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_summary',
      description: '修改文章摘要',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string', maxLength: 500, description: '新摘要' } },
        required: ['summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_slug',
      description: '修改 URL slug（仅小写字母数字和连字符）',
      parameters: {
        type: 'object',
        properties: { slug: { type: 'string', maxLength: 60, description: '新 slug' } },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_content',
      description: '在正文末尾追加 Markdown 内容',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: '要追加的 Markdown 文本' } },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_content',
      description: '整体替换正文（慎用，会覆盖全部内容）',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', description: '完整的 Markdown 正文' } },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_content_at',
      description: '在正文指定行号后插入内容',
      parameters: {
        type: 'object',
        properties: {
          afterLine: { type: 'integer', minimum: 0, description: '在第几行后插入（0 表示插入到最前面）' },
          text: { type: 'string', description: '要插入的 Markdown 文本' },
        },
        required: ['afterLine', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_and_replace',
      description: '在文章指定字段内查找并替换所有匹配文本',
      parameters: {
        type: 'object',
        properties: {
          findText: { type: 'string', description: '要查找的原文（不能为空）' },
          replaceText: { type: 'string', description: '替换为的新文本' },
          scope: {
            type: 'string',
            enum: ['title', 'subtitle', 'summary', 'content'],
            description: '在哪个字段操作，默认 content',
          },
        },
        required: ['findText', 'replaceText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_lines',
      description: '删除正文指定行范围（行号从1开始，含两端）',
      parameters: {
        type: 'object',
        properties: {
          startLine: { type: 'integer', minimum: 1, description: '起始行号（从1开始）' },
          endLine: { type: 'integer', minimum: 1, description: '结束行号（含）' },
        },
        required: ['startLine', 'endLine'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_word_count',
      description: '统计正文字数、行数及各信息字段长度',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        '联网搜索最新信息。当用户需要实时数据、新闻、最新动态、技术文档、或文章里缺少的事实性信息时调用。结果会返回给你，可结合结果用 append_content / insert_content_at 整理进文章。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            maxLength: 400,
            description: '搜索关键词（建议简洁，≤400 字）',
          },
          max_results: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: '返回结果数量（1-10，默认 5）',
          },
        },
        required: ['query'],
      },
    },
  },
];
