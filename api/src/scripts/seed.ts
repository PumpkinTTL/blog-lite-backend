/**
 * 种子数据脚本：初始化 admin 角色和默认管理员账号
 *
 * 用法：npx ts-node -r tsconfig-paths/register src/scripts/seed.ts
 */
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';

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
    await dataSource.destroy();
  }
}

seed();
