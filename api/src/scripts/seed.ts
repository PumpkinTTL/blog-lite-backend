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
