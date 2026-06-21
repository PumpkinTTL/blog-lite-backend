/**
 * 统一邮件 HTML 模板
 *
 * 风格：米白色卡片 + 温暖琥珀点缀，稳定不花哨。
 * 所有邮件共用同一外壳（renderShell），只替换内容区，保证视觉统一。
 * 内联样式（邮件客户端兼容性要求，不能用 class/外部 CSS）。
 *
 * 可自定义项（发送时传入，未传用默认值）：
 * - platformName：平台名（默认 bitlesu）
 * - tagline：署名寄语（默认"每一篇文章都是生活与阅读的深度思考"）
 * - contact：联系方式（未传则不显示"如有疑问"段）
 * - note：正文附加文案（未传则不渲染）
 */

// —— 色彩系统（温暖、稳定）——
const C = {
  bg: '#FAF7F2', // 外层背景：暖米白
  card: '#FFFDF8', // 卡片底：更亮的米白
  border: '#EDE6D9', // 边框：浅卡其
  ink: '#3D3528', // 正文：深棕墨（比纯黑柔和）
  inkSoft: '#7A6F5C', // 次要文字：暖灰
  inkMute: '#A89B85', // 最弱文字
  accent: '#C2873D', // 点缀色：琥珀金
  accentSoft: '#F5EBD9', // 点缀浅底
  white: '#FFFFFF',
  divider: '#EDE6D9',
};

const FONT =
  "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',-apple system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const FONT_MONO =
  "'SF Mono','Cascadia Code',Consolas,'Courier New',monospace";

/** 默认寄语 */
const DEFAULT_TAGLINE = '每一篇文章都是生活与阅读的深度思考';
/** 默认平台名 */
const DEFAULT_PLATFORM = 'bitlesu';

interface ShellOptions {
  title: string;
  intro?: string;
  body: string;
  /** 底部备注（灰色小字），如安全提示等 */
  footer?: string;
  /** 平台名（默认 bitlesu） */
  platformName?: string;
  /** 署名寄语（默认"每一篇文章都是生活与阅读的深度思考"） */
  tagline?: string;
  /** 联系方式，未传则不显示"如有疑问"段 */
  contact?: string;
}

/** 渲染统一外壳 */
function renderShell(opts: ShellOptions): string {
  const platform = opts.platformName || DEFAULT_PLATFORM;
  const tagline = opts.tagline !== undefined ? opts.tagline : DEFAULT_TAGLINE;
  // 联系方式段：文案写死，contact 只是联系方式占位值。有 contact 才渲染。
  const contactLine = opts.contact
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.7;color:${C.inkMute};">如有疑问或需要帮助，请随时联系我们，我们将尽快为您解答。<br/>联系方式：${opts.contact}</p>`
    : '';

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;">
        <tr><td style="padding:36px 36px 28px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:${C.ink};letter-spacing:0.02em;">${opts.title}</h1>
          ${opts.intro ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:${C.inkSoft};">${opts.intro}</p>` : ''}
          ${opts.body}
          ${contactLine}
        </td></tr>
        ${opts.footer ? `<tr><td style="padding:0 36px 32px;"><p style="margin:0;padding-top:20px;border-top:1px solid ${C.divider};font-size:12px;line-height:1.6;color:${C.inkMute};">${opts.footer}</p></td></tr>` : ''}
      </table>
      <!-- 底部署名：平台名 + 寄语，占满主容器宽度 -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;">
        <tr><td style="padding:20px 4px 0;font-size:11px;color:${C.inkMute};text-align:center;">${platform} · ${tagline}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// —— 内容块工具 ——//

/**
 * 高亮码块（验证码/激活码专用）
 * 白底独立卡片，大号等宽字体，不换行。
 */
function codeBlock(code: string, label?: string): string {
  const labelHtml = label
    ? `<div style="font-size:11px;color:${C.inkMute};margin-bottom:10px;letter-spacing:0.05em;">${label}</div>`
    : '';
  return `
  <div style="margin:24px 0;background:${C.white};border:1px solid ${C.border};border-radius:12px;padding:24px 20px;text-align:center;">
    ${labelHtml}
    <div style="font-family:${FONT_MONO};font-size:24px;font-weight:700;letter-spacing:3px;color:${C.accent};white-space:nowrap;overflow-x:auto;line-height:1.4;">${code}</div>
  </div>`;
}

/** 普通段落 */
function p(text: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:${C.ink};">${text}</p>`;
}

// ============ 各场景模板 ============

/** 验证码邮件 */
export function renderVerifyCode(
  code: string,
  expireMinutes: number,
  opts?: { platformName?: string; tagline?: string; contact?: string },
): string {
  return renderShell({
    title: '验证码',
    intro: '您正在进行身份验证，请使用以下验证码完成操作：',
    body: codeBlock(code),
    footer: `验证码 ${expireMinutes} 分钟内有效。如非本人操作，请忽略此邮件，无需任何操作。`,
    ...opts,
  });
}

/** 密码重置验证码 */
export function renderResetCode(
  code: string,
  expireMinutes: number,
  opts?: { platformName?: string; tagline?: string; contact?: string },
): string {
  return renderShell({
    title: '重置密码',
    intro: `您正在重置${opts?.platformName || DEFAULT_PLATFORM}账号密码，请使用以下验证码完成重置：`,
    body: codeBlock(code),
    footer: `验证码 ${expireMinutes} 分钟内有效。如非本人操作，请忽略此邮件。密码重置完成后请妥善保管账号。`,
    ...opts,
  });
}

/** 捐赠感谢（可带激活码） */
export function renderDonationThanks(opts: {
  donorName: string;
  amount?: number;
  currency?: string;
  /** 管理员留言（浅琥珀底块，可选） */
  message?: string;
  code?: string;
  platformName?: string;
  tagline?: string;
  contact?: string;
}): string {
  const platform = opts.platformName || DEFAULT_PLATFORM;
  const hasCode = !!opts.code;

  // 正文：根据是否有码，用不同文案，不堆砌
  const introPara = hasCode
    ? p(`感谢您对 ${platform} 的支持与慷慨捐赠。为表谢意，我们特地为您准备了一份会员激活码，请在「个人中心」输入以下激活码即可开通会员权益：`)
    : p(`感谢您对 ${platform} 的支持与慷慨捐赠。您的这份心意，是我们持续创作、分享优质内容的温暖动力。`);

  const codeBlockHtml = hasCode ? codeBlock(opts.code!, '会员激活码') : '';

  // message：管理员留言（浅琥珀底块）
  const messageBlock = opts.message
    ? `<div style="margin:16px 0;padding:14px 16px;background:${C.accentSoft};border-radius:8px;font-size:13px;line-height:1.6;color:${C.ink};">${opts.message}</div>`
    : '';

  return renderShell({
    title: '感谢您的捐赠',
    intro: `${opts.donorName}，您好：`,
    body: introPara + codeBlockHtml + messageBlock,
    footer: hasCode ? '请妥善保管激活码，勿泄露他人。' : undefined,
    platformName: opts.platformName,
    tagline: opts.tagline,
    contact: opts.contact,
  });
}

/** 通用通知邮件（预留扩展） */
export function renderNotice(opts: {
  title: string;
  intro?: string;
  body: string;
  footer?: string;
  platformName?: string;
  tagline?: string;
  contact?: string;
}): string {
  return renderShell(opts);
}
