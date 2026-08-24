/**
 * 种子数据脚本：初始化 admin 角色和默认管理员账号
 *
 * 用法：npx ts-node -r tsconfig-paths/register src/scripts/seed.ts
 */
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { generateUniqueUserId } from '../common/utils/generate-user-id';

/**
 * 演示数据：资源分类 / 资源 / 友链
 * 仅当对应表为空时插入（幂等，可重复执行）。
 * 用于前端 V2 资源区 / 友链区的真实数据展示。
 */
async function seedDemoData(dataSource: DataSource) {
  // 兜底：确保 resources.uploader_id 列存在（旧库可能没有，synchronize 未跑时）
  try {
    await dataSource.query(
      `ALTER TABLE resources ADD COLUMN IF NOT EXISTS (uploader_id INT NULL COMMENT '上传者用户 ID')`,
    );
  } catch {
    // MySQL 旧版本不支持 IF NOT EXISTS，忽略（后端 synchronize 会建）
  }

  // 取 admin 用户 id 作为资源 uploader
  // username 概念已移除，改用 email 定位 seed 创建的管理员账号。
  const adminRows: Array<{ id: number }> = await dataSource.query(
    `SELECT id FROM users WHERE email = 'admin@blog.local' LIMIT 1`,
  );
  const adminId = adminRows[0]?.id ?? null;

  // 1. 资源分类（resource_categories 为空才插）
  const catCount: Array<{ cnt: number }> = await dataSource.query(
    `SELECT COUNT(*) AS cnt FROM resource_categories`,
  );
  if (Number(catCount[0].cnt) === 0) {
    const cats = [
      ['开发工具', 'IDE/CLI/调试工具'],
      ['设计模板', 'UI Kit / 设计资源'],
      ['学习资料', '教程 / 电子书 / 课程'],
      ['插件扩展', '浏览器/编辑器插件'],
    ];
    for (const [name, desc] of cats) {
      await dataSource.query(
        `INSERT INTO resource_categories (name, description, sort_order, created_at) VALUES (?, ?, 0, NOW())`,
        [name, desc],
      );
    }
    console.log('  资源分类: 已插入 4 条');
  }

  // 2. 资源（resources 为空才插）
  const resCount: Array<{ cnt: number }> = await dataSource.query(
    `SELECT COUNT(*) AS cnt FROM resources`,
  );
  if (Number(resCount[0].cnt) === 0) {
    const catRows: Array<{ id: number; name: string }> = await dataSource.query(
      `SELECT id, name FROM resource_categories ORDER BY id`,
    );
    const catId = (name: string) =>
      catRows.find((c) => c.name === name)?.id ?? null;

    const resources = [
      {
        title: 'VS Code 高效开发配置包',
        description: '精选主题 + 快捷键 + 常用插件配置，开箱即用的高效前端开发环境。',
        cover: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800&h=600&fit=crop',
        cat: '开发工具',
        panLinks: [{ name: '夸克网盘', url: 'https://pan.quark.cn/example', code: 'abc1' }],
        status: 'published',
        requiredRoles: [] as string[], // 无门槛
      },
      {
        title: 'Tailwind UI Kit 设计模板',
        description: '120+ 高质量组件，覆盖后台/落地页/博客等场景，Figma 源文件。',
        cover: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&h=600&fit=crop',
        cat: '设计模板',
        panLinks: [{ name: '百度网盘', url: 'https://pan.baidu.com/example', code: 'def2' }],
        status: 'published',
        requiredRoles: ['plus', 'pro', 'max'], // 任意会员可解锁
      },
      {
        title: 'Vue 3 进阶实战教程合集',
        description: '从 Composition API 到源码解析，配套 20+ 完整项目示例。',
        cover: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&h=600&fit=crop',
        cat: '学习资料',
        panLinks: [{ name: '蓝奏云', url: 'https://wwa.lanzoui.com/example', code: null }],
        status: 'published',
        requiredRoles: [] as string[],
      },
      {
        title: 'Chrome 前端调试插件精选',
        description: '开发者必备的 15 款浏览器扩展，涵盖调试/性能/安全/设计。',
        cover: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=800&h=600&fit=crop',
        cat: '插件扩展',
        panLinks: [{ name: '自定义', url: 'https://example.com/plugins', code: null }],
        status: 'published',
        requiredRoles: ['pro', 'max'], // Pro 及以上
      },
      {
        title: 'Node.js 后端架构图解',
        description: '微服务/消息队列/缓存/日志等核心架构的可视化笔记 PDF。',
        cover: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=600&fit=crop',
        cat: '学习资料',
        panLinks: [{ name: '夸克网盘', url: 'https://pan.quark.cn/example2', code: 'ghi3' }],
        status: 'published',
        requiredRoles: [] as string[],
      },
      {
        title: 'Figma 图标库 2000+',
        description: '线性/面性/双色三大风格，SVG 可编辑，商用授权。',
        cover: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&h=600&fit=crop',
        cat: '设计模板',
        panLinks: [{ name: '百度网盘', url: 'https://pan.baidu.com/example2', code: 'jkl4' }],
        status: 'published',
        requiredRoles: [] as string[],
      },
      {
        title: 'Git 工作流速查手册',
        description: '团队协作 Git 规范 + 常用命令速查 + 冲突解决实战。',
        cover: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop',
        cat: '开发工具',
        panLinks: [{ name: '蓝奏云', url: 'https://wwa.lanzoui.com/example2', code: null }],
        status: 'published',
        requiredRoles: [] as string[],
      },
      {
        title: 'Docker 容器化部署实战',
        description: '从 Dockerfile 到 docker-compose，覆盖前端/后端/数据库全栈部署。',
        cover: 'https://images.unsplash.com/photo-1605379399642-870262d3d051?w=800&h=600&fit=crop',
        cat: '学习资料',
        panLinks: [{ name: '夸克网盘', url: 'https://pan.quark.cn/example3', code: 'mno5' }],
        status: 'published',
        requiredRoles: ['plus', 'pro', 'max'],
      },
    ];

    // 查会员角色 ID（用于 requiredRoleIds 映射）
    const roleRows: Array<{ id: number; name: string }> = await dataSource.query(
      `SELECT id, name FROM roles WHERE name IN ('plus', 'pro', 'max')`,
    );
    const toRoleIds = (names: string[]) =>
      names.map((n) => roleRows.find((r) => r.name === n)?.id).filter((id): id is number => !!id);

    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      const requiredRoleIds = toRoleIds(r.requiredRoles);
      await dataSource.query(
        `INSERT INTO resources
          (title, description, cover, category_id, uploader_id, content, pan_links, price_cents, status, min_member_level, required_role_ids, view_count, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, ?, ?, NOW(), NOW())`,
        [
          r.title,
          r.description,
          r.cover,
          catId(r.cat),
          adminId,
          `## ${r.title}\n\n${r.description}`,
          JSON.stringify(r.panLinks),
          r.status,
          requiredRoleIds.length ? JSON.stringify(requiredRoleIds) : null,
          Math.floor(Math.random() * 2000) + 100,
          i,
        ],
      );
    }
    console.log(`  资源: 已插入 ${resources.length} 条`);
  }

  // 3. 友链（friend_links 为空才插）
  const linkCount: Array<{ cnt: number }> = await dataSource.query(
    `SELECT COUNT(*) AS cnt FROM friend_links`,
  );
  if (Number(linkCount[0].cnt) === 0) {
    const links = [
      { name: 'GitHub', url: 'https://github.com', logo: 'https://github.githubassets.com/favicons/favicon.svg', description: '全球最大代码托管平台' },
      { name: 'Vue.js', url: 'https://vuejs.org', logo: 'https://vuejs.org/logo.svg', description: '渐进式 JavaScript 框架' },
      { name: 'NestJS', url: 'https://nestjs.com', logo: 'https://nestjs.com/favicon.ico', description: '渐进式 Node.js 框架' },
      { name: 'TypeScript', url: 'https://www.typescriptlang.org', logo: 'https://www.typescriptlang.org/favicon-32x32.png', description: 'JavaScript 的超集' },
      { name: 'Tailwind CSS', url: 'https://tailwindcss.com', logo: 'https://tailwindcss.com/favicons/favicon.ico', description: '实用优先的 CSS 框架' },
    ];
    for (let i = 0; i < links.length; i++) {
      const l = links[i];
      await dataSource.query(
        `INSERT INTO friend_links (name, url, logo, description, sort_order, status, post_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'visible', NULL, NOW())`,
        [l.name, l.url, l.logo, l.description, i],
      );
    }
    console.log(`  友链: 已插入 ${links.length} 条`);
  }

  console.log('演示数据检查完成（已存在则跳过）');
}

async function seed() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_DATABASE || 'blog-lite',
    charset: 'utf8mb4',
  });

  await dataSource.initialize();
  console.log('数据库连接成功');

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    // 1. 插入 admin 角色 + 默认角色 user（注册流程依赖 name='user' 的默认角色）
    await queryRunner.query(
      `INSERT IGNORE INTO roles (name, display_name, description, created_at) VALUES (?, ?, ?, NOW())`,
      ['admin', '管理员', '系统超级管理员，拥有所有权限'],
    );
    await queryRunner.query(
      `INSERT IGNORE INTO roles (name, display_name, description, created_at) VALUES (?, ?, ?, NOW())`,
      ['user', '用户', '注册用户默认角色'],
    );

    // 1.5 插入会员等级对应的角色组（权益载体，套餐会绑定它们）
    const memberRoles: Array<[string, string, string]> = [
      ['plus', 'Plus 会员', 'Plus 基础会员权益组'],
      ['pro', 'Pro 会员', 'Pro 专业版会员权益组'],
      ['max', 'Max 会员', 'Max 旗舰版会员权益组'],
    ];
    for (const [name, displayName, desc] of memberRoles) {
      await queryRunner.query(
        `INSERT IGNORE INTO roles (name, display_name, description, created_at) VALUES (?, ?, ?, NOW())`,
        [name, displayName, desc],
      );
    }

    // 2. 插入默认管理员用户（密码: admin123）
    // username 概念已移除：管理员用 email + id 登录。
    // 登录方式：邮箱 admin@blog.local + 密码 admin123，或用户 id + 密码。
    // id 为 9 位随机数字（非自增主键），仅在 admin 不存在时生成插入（幂等）。
    const existingAdmin: Array<{ id: number }> = await queryRunner.query(
      `SELECT id FROM users WHERE email = 'admin@blog.local' LIMIT 1`,
    );
    if (existingAdmin.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      const adminId = await generateUniqueUserId(async (id) => {
        const rows: Array<{ cnt: number }> = await queryRunner.query(
          `SELECT COUNT(*) AS cnt FROM users WHERE id = ?`,
          [id],
        );
        return Number(rows[0].cnt) > 0;
      });
      await queryRunner.query(
        `INSERT INTO users (id, email, password, nickname, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', NOW(), NOW())`,
        [adminId, 'admin@blog.local', passwordHash, '超级管理员'],
      );
      console.log(`  管理员已创建，id: ${adminId}`);
    } else {
      console.log(`  管理员已存在，id: ${existingAdmin[0].id}`);
    }

    // 3. 关联用户和角色（用 email 定位 seed 创建的 admin）
    await queryRunner.query(
      `INSERT IGNORE INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u JOIN roles r WHERE u.email = 'admin@blog.local' AND r.name = 'admin'`,
    );

    // 4. 系统设置初始数据
    // settings 表只 seed 'site' group（前台可见的业务配置）。
    // 旧的 general/seo/appearance group 已废弃（前后端均无消费代码），
    // rate_limit 由 RateLimitConfigService 自行 seed，backup 由 BackupScheduleService 动态写。
    // 已有库里残留的旧 group 数据不删除（无害），仅新部署不再写入。
    const settings: Array<[string, string, string | null, string]> = [
      // 站点公开设置（前台可见，白名单由 setting-public.controller 控制）
      ['site.name', '慢成长', '站点名称', 'site'],
      ['site.title', '慢成长', '站点标题（浏览器标签后缀）', 'site'],
      ['site.subtitle', 'Slow Growth', '站点副标题（Logo 下方显示）', 'site'],
      ['site.description', '记录成长，分享所思', '站点描述', 'site'],
      ['site.logo_url', '', '站点 Logo URL（空则用文字 Logo）', 'site'],
      ['site.favicon_url', '', 'Favicon URL（空则用默认）', 'site'],
      ['site.contact_email', 'contact@bloglite.dev', '联系邮箱', 'site'],
      ['site.shop_url', 'https://shop.bitlesu.com', '商城跳转链接', 'site'],
      [
        'site.social_links',
        JSON.stringify({ github: '', x: '', telegram: '', rss: '' }),
        '社交链接 JSON（github/x/telegram/rss）',
        'site',
      ],
      // 捐赠设置
      ['donation.enabled', 'true', '是否开放捐赠', 'site'],
      // 注册设置
      ['registration.enabled', 'true', '是否开放注册', 'site'],
      ['registration.require_invitation', 'true', '注册是否需要邀请码（关闭则开放自由注册）', 'site'],
      [
        'registration.email_whitelist',
        '',
        '允许注册的邮箱后缀（逗号分隔，如 qq.com,163.com；留空表示不限）',
        'site',
      ],
      // 维护模式（开启后非管理员只能访问只读接口）
      ['maintenance.enabled', 'false', '维护模式（开启后前台只读）', 'site'],
      // 模块开关（控制前台功能显隐 + 后端接口拒绝，前后端一致）
      ['comments.enabled', 'true', '是否开放评论（关闭后不能发新评论，历史评论仍可查看）', 'site'],
      ['announcements.enabled', 'true', '是否开放公告（关闭后前台隐藏公告位，列表接口返回空）', 'site'],
      ['ads.enabled', 'true', '是否开放广告（关闭后前台隐藏所有广告位，列表接口返回空）', 'site'],
      [
        'donation.usdt_rate',
        '7',
        'CNY→USDT 汇率（用于加密货币换算展示）',
        'site',
      ],
      [
        'donation.wallet_addresses',
        JSON.stringify({
          TRC20: 'TJYeasTPa6gpVh7ZsAPDfnBrLaaTSE3qKr',
          BSC: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
          POL: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
        }),
        '加密货币收款地址 JSON（TRC20/BSC/POL）',
        'site',
      ],
      // Turnstile 人机验证（site_key 公开、secret_key 私密，均存库由后端按需读取）
      ['turnstile.enabled', 'false', '是否启用 Turnstile 人机验证', 'site'],
      ['turnstile.site_key', '', 'Cloudflare Turnstile Site Key（公开，前端用）', 'site'],
      ['turnstile.secret_key', '', 'Cloudflare Turnstile Secret Key（私密，后端校验用）', 'site'],
      // R2 存储（多账号，系统设置面板管理；空列表时回落 .env R2_* 配置）
      [
        'storage.r2.accounts',
        '[]',
        'Cloudflare R2 账号列表 JSON：[{id,name,accountId,accessKeyId,secretAccessKey,bucket,publicDomain,prefix,enabled}]',
        'site',
      ],
      ['storage.r2.active_id', '', '当前启用的 R2 账号 id（空则取第一个启用账号）', 'site'],
      // SMTP 邮件（面板配置优先，空字段回落 .env SMTP_*）
      ['smtp.host', '', 'SMTP 服务器（如 smtp.163.com，空则用 .env）', 'site'],
      ['smtp.port', '', 'SMTP 端口（常用 465/587，空则用 .env）', 'site'],
      ['smtp.user', '', 'SMTP 用户名（空则用 .env）', 'site'],
      ['smtp.pass', '', 'SMTP 密码/授权码（空则用 .env）', 'site'],
      ['smtp.from', '', '发件人（如 "站名" <noreply@example.com>，空则用 .env）', 'site'],
      // Tavily 联网搜索（AI 写作助手 web_search 工具用，面板配置优先，空则 .env）
      ['ai.tavily_key', '', 'Tavily API Key（AI 联网搜索，空则用 .env）', 'site'],
      ['ai.tavily_url', '', 'Tavily 接口地址（默认 https://api.tavily.com，一般不用改）', 'site'],
    ];
    for (const [key, value, description, group] of settings) {
      await queryRunner.query(
        `INSERT IGNORE INTO settings (\`key\`, value, description, \`group\`, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [key, value, description, group],
      );
    }

    // 5. 会员套餐（仅当 plans 表为空时创建，避免覆盖已有配置）
    //    每个套餐绑定对应等级的角色组（roleId），兑换后自动授予角色。
    const planCount: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM plans`,
    );
    if (Number(planCount[0].cnt) === 0) {
      const levelRoles: Array<{ id: number; name: string }> = await queryRunner.query(
        `SELECT id, name FROM roles WHERE name IN ('plus', 'pro', 'max')`,
      );
      const roleIdOf = (name: string) =>
        levelRoles.find((r) => r.name === name)?.id ?? null;

      const plans: Array<{
        name: string; slug: string; level: string; days: number; roleId: number | null;
      }> = [
        { name: 'Plus 月度', slug: 'plus_monthly', level: 'plus', days: 30, roleId: roleIdOf('plus') },
        { name: 'Pro 月度', slug: 'pro_monthly', level: 'pro', days: 30, roleId: roleIdOf('pro') },
        { name: 'Max 月度', slug: 'max_monthly', level: 'max', days: 30, roleId: roleIdOf('max') },
        { name: 'Pro 年度', slug: 'pro_yearly', level: 'pro', days: 365, roleId: roleIdOf('pro') },
      ];
      for (const p of plans) {
        await queryRunner.query(
          `INSERT INTO plans (name, slug, level, durationDays, priceCents, benefits, roleId, description, isActive, sort, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, NULL, ?, NULL, 1, 0, NOW(), NOW())`,
          [p.name, p.slug, p.level, p.days, p.roleId],
        );
      }
      console.log(`  套餐: 已创建 ${plans.length} 个（绑定会员角色组）`);
    }

    await queryRunner.commitTransaction();
    console.log('种子数据初始化完成');
    console.log('  角色: admin（管理员）+ plus/pro/max（会员权益组）');
    console.log('  账号: admin@blog.local（或用户 id）/ 密码: admin123');
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('种子数据初始化失败:', err);
    process.exit(1);
  } finally {
    await queryRunner.release();
  }

  // ── 演示数据：资源分类 + 资源 + 友链（独立 try/catch，不阻塞基础 seed）──
  await seedDemoData(dataSource);
  await dataSource.destroy();
}

seed();
