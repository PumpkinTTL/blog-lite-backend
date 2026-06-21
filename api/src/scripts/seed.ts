/**
 * 种子数据脚本：初始化 admin 角色和默认管理员账号
 *
 * 用法：npx ts-node -r tsconfig-paths/register src/scripts/seed.ts
 */
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';

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
  const adminRows: Array<{ id: number }> = await dataSource.query(
    `SELECT id FROM users WHERE username = 'admin' LIMIT 1`,
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
        minMemberLevel: null,
      },
      {
        title: 'Tailwind UI Kit 设计模板',
        description: '120+ 高质量组件，覆盖后台/落地页/博客等场景，Figma 源文件。',
        cover: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&h=600&fit=crop',
        cat: '设计模板',
        panLinks: [{ name: '百度网盘', url: 'https://pan.baidu.com/example', code: 'def2' }],
        status: 'published',
        minMemberLevel: 'plus',
      },
      {
        title: 'Vue 3 进阶实战教程合集',
        description: '从 Composition API 到源码解析，配套 20+ 完整项目示例。',
        cover: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&h=600&fit=crop',
        cat: '学习资料',
        panLinks: [{ name: '蓝奏云', url: 'https://wwa.lanzoui.com/example', code: null }],
        status: 'published',
        minMemberLevel: null,
      },
      {
        title: 'Chrome 前端调试插件精选',
        description: '开发者必备的 15 款浏览器扩展，涵盖调试/性能/安全/设计。',
        cover: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=800&h=600&fit=crop',
        cat: '插件扩展',
        panLinks: [{ name: '自定义', url: 'https://example.com/plugins', code: null }],
        status: 'published',
        minMemberLevel: 'pro',
      },
      {
        title: 'Node.js 后端架构图解',
        description: '微服务/消息队列/缓存/日志等核心架构的可视化笔记 PDF。',
        cover: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=600&fit=crop',
        cat: '学习资料',
        panLinks: [{ name: '夸克网盘', url: 'https://pan.quark.cn/example2', code: 'ghi3' }],
        status: 'published',
        minMemberLevel: null,
      },
      {
        title: 'Figma 图标库 2000+',
        description: '线性/面性/双色三大风格，SVG 可编辑，商用授权。',
        cover: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&h=600&fit=crop',
        cat: '设计模板',
        panLinks: [{ name: '百度网盘', url: 'https://pan.baidu.com/example2', code: 'jkl4' }],
        status: 'published',
        minMemberLevel: null,
      },
      {
        title: 'Git 工作流速查手册',
        description: '团队协作 Git 规范 + 常用命令速查 + 冲突解决实战。',
        cover: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop',
        cat: '开发工具',
        panLinks: [{ name: '蓝奏云', url: 'https://wwa.lanzoui.com/example2', code: null }],
        status: 'published',
        minMemberLevel: null,
      },
      {
        title: 'Docker 容器化部署实战',
        description: '从 Dockerfile 到 docker-compose，覆盖前端/后端/数据库全栈部署。',
        cover: 'https://images.unsplash.com/photo-1605379399642-870262d3d051?w=800&h=600&fit=crop',
        cat: '学习资料',
        panLinks: [{ name: '夸克网盘', url: 'https://pan.quark.cn/example3', code: 'mno5' }],
        status: 'published',
        minMemberLevel: 'plus',
      },
    ];

    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      await dataSource.query(
        `INSERT INTO resources
          (title, description, cover, category_id, uploader_id, content, pan_links, price_cents, status, min_member_level, view_count, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NOW(), NOW())`,
        [
          r.title,
          r.description,
          r.cover,
          catId(r.cat),
          adminId,
          `## ${r.title}\n\n${r.description}`,
          JSON.stringify(r.panLinks),
          r.status,
          r.minMemberLevel,
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

    // 1. 插入 admin 角色
    await queryRunner.query(
      `INSERT IGNORE INTO roles (name, display_name, description, created_at) VALUES (?, ?, ?, NOW())`,
      ['admin', '管理员', '系统超级管理员，拥有所有权限'],
    );

    // 2. 插入默认管理员用户（密码: admin123）
    const passwordHash = await bcrypt.hash('admin123', 10);
    await queryRunner.query(
      `INSERT IGNORE INTO users (username, password, nickname, status, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())`,
      ['admin', passwordHash, '超级管理员'],
    );

    // 3. 关联用户和角色
    await queryRunner.query(
      `INSERT IGNORE INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u JOIN roles r WHERE u.username = 'admin' AND r.name = 'admin'`,
    );

    // 4. 系统设置初始数据
    const settings: Array<[string, string, string | null, string]> = [
      // 基本设置
      ['site_name', 'Blog Lite', '站点名称', 'general'],
      ['site_description', 'A lightweight blog', '站点描述', 'general'],
      ['site_url', '', '站点 URL', 'general'],
      ['site_keywords', 'blog,tech,vue,nest', '站点关键词', 'general'],
      ['admin_email', '', '管理员邮箱', 'general'],
      ['posts_per_page', '10', '每页文章数', 'general'],
      ['copyright', '', '版权信息', 'general'],
      ['icp_number', '', '备案号', 'general'],
      ['allow_registration', 'false', '开启注册', 'general'],
      ['maintenance_mode', 'false', '维护模式', 'general'],
      // SEO 设置
      ['seo_title', '', 'SEO 标题', 'seo'],
      ['seo_description', '', 'SEO 描述', 'seo'],
      ['seo_keywords', '', 'SEO 关键词', 'seo'],
      ['google_analytics_id', '', 'Google Analytics ID', 'seo'],
      ['baidu_tongji_id', '', '百度统计 ID', 'seo'],
      // 外观设置
      ['theme_color', '#18a058', '主题色', 'appearance'],
      ['logo_url', '', 'Logo URL', 'appearance'],
      ['favicon_url', '', 'Favicon URL', 'appearance'],
      ['default_dark_mode', 'false', '默认暗黑模式', 'appearance'],
      ['custom_css', '', '自定义 CSS', 'appearance'],
      ['custom_head_html', '', '自定义头部 HTML', 'appearance'],
      ['custom_footer_html', '', '自定义底部 HTML', 'appearance'],
    ];
    for (const [key, value, description, group] of settings) {
      await queryRunner.query(
        `INSERT IGNORE INTO settings (\`key\`, value, description, \`group\`, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [key, value, description, group],
      );
    }

    await queryRunner.commitTransaction();
    console.log('种子数据初始化完成');
    console.log('  角色: admin（管理员）');
    console.log('  账号: admin / 密码: admin123');
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
