/**
 * 一次性迁移脚本：把 blog-lite 全库（库本身 + 所有表 + 所有文本列）转为 utf8mb4。
 *
 * 背景：
 *   app.module.ts 里 TypeORM 连接设置了 charset: 'utf8mb4'，但那只控制连接编码。
 *   表和列是早期用 utf8（3 字节）建的，synchronize:true 不会改字符集，
 *   导致存 4 字节字符（emoji / 生僻字）时报：
 *     Incorrect string value: '\xF0\x9F\x92\xA1 *...' for column 'content'
 *
 * 脚本逻辑：
 *   1. ALTER DATABASE ... CHARACTER SET utf8mb4
 *   2. 遍历所有表：ALTER TABLE ... CONVERT TO CHARACTER SET utf8mb4
 *      （CONVERT 会同时改表默认字符集 + 所有文本列的实际字符集）
 *
 * 用法（在 backend/api 目录下）：
 *   node scripts/convert-utf8mb4.js
 *
 * 完成后此脚本可删除。
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// 简易 .env 解析（不引入 dotenv 依赖）
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

(async () => {
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_DATABASE;

  if (!host || !user || !database) {
    console.error('缺少 DB 环境变量，请确认 .env 中 DB_HOST/DB_USERNAME/DB_DATABASE 已配置');
    process.exit(1);
  }

  console.log(`连接 ${user}@${host}:${port}/${database} ...`);
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    charset: 'utf8mb4',
    multipleStatements: false,
  });

  try {
    // 1. 改库默认字符集
    console.log('\n[1/3] 转换数据库默认字符集 ...');
    await conn.query(
      `ALTER DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    console.log('   ✔ 数据库默认字符集 = utf8mb4 / utf8mb4_unicode_ci');

    // 2. 取所有表名
    const [tables] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [database],
    );
    console.log(`\n[2/3] 发现 ${tables.length} 张表，开始逐表转换 ...`);

    let converted = 0;
    let skipped = 0;
    for (const { TABLE_NAME } of tables) {
      // 先看当前表字符集，已经是 utf8mb4 就跳过
      const [[row]] = await conn.query(
        `SELECT CCSA.character_set_name AS charset
         FROM information_schema.TABLES T
         JOIN information_schema.COLLATION_CHARACTER_SET_APPLICABILITY CCSA
           ON CCSA.collation_name = T.table_collation
         WHERE T.TABLE_SCHEMA = ? AND T.TABLE_NAME = ?`,
        [database, TABLE_NAME],
      );

      if (row && row.charset === 'utf8mb4') {
        skipped++;
        continue;
      }

      // CONVERT TO 会把表默认字符集 + 所有文本列一起转
      await conn.query(
        `ALTER TABLE \`${TABLE_NAME}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      converted++;
      console.log(`   ✔ ${TABLE_NAME}`);
    }
    console.log(`   完成：转换 ${converted} 张，跳过 ${skipped} 张（已是 utf8mb4）`);

    // 3. 复查：列出还有残留非 utf8mb4 文本列的表（应为空）
    console.log('\n[3/3] 复查残留非 utf8mb4 文本列 ...');
    const [residual] = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME, CHARACTER_SET_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND CHARACTER_SET_NAME IS NOT NULL
         AND CHARACTER_SET_NAME != 'utf8mb4'`,
      [database],
    );
    if (residual.length === 0) {
      console.log('   ✔ 全部文本列已是 utf8mb4，无残留');
    } else {
      console.log('   ⚠ 仍有残留列（可能是 ENUM/SET 或视图，需手动处理）：');
      for (const r of residual) {
        console.log(`     - ${r.TABLE_NAME}.${r.COLUMN_NAME} = ${r.CHARACTER_SET_NAME}`);
      }
    }

    console.log('\n✅ 全库 utf8mb4 转换完成。');
  } catch (err) {
    console.error('\n❌ 转换失败：', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
