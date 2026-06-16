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

【行为规范】
1. 调用工具时，arguments 必须是合法 JSON。
2. 一次可以并行调用多个工具，也可以只调一个。
3. 修改类工具调用后，用一句话简要说明你做了什么改动。
4. 如果用户的请求不明确，先用文字提问澄清，不要盲目修改。
5. 涉及正文大段改写时，优先用 append_content / insert_content_at 增量修改，避免 replace_content 覆盖丢失内容。
6. 不要编造文章里不存在的章节或段落。读取正文后再做判断。

【回复风格】简洁、专业、中文。`;

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
];
