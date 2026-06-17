/**
 * 迁移脚本：把 ai_models 表的数据合并进 ai_providers.models JSON 字段。
 *
 * 背景：原设计 provider/model 是两张表（一对多），重构后模型内嵌为
 *       provider.models JSON 数组，ai_models 表废弃。
 *
 * 脚本逻辑：
 *   1. 确保 ai_providers 有 models 列（longtext）
 *   2. 读 ai_models 按 provider_id 分组
 *   3. 对每个 provider，把它的模型写进 models JSON
 *   4. 跑完后可手动 DROP TABLE ai_models（本脚本不自动删表，安全起见）
 *
 * 用法：node scripts/migrate-models-to-provider.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

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
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    charset: 'utf8mb4',
    multipleStatements: false,
  });

  try {
    // 1. 确保 ai_providers.models 列存在（synchronize 应已自动加，但兜底）
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ai_providers' AND COLUMN_NAME = 'models'`,
      [process.env.DB_DATABASE],
    );
    if (cols.length === 0) {
      console.log('ai_providers.models 列不存在，新增 longtext ...');
      await conn.query(
        `ALTER TABLE ai_providers ADD COLUMN models LONGTEXT NULL COMMENT '模型列表 JSON'`,
      );
    }

    // 2. 检查 ai_models 表是否存在
    const [tables] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ai_models'`,
      [process.env.DB_DATABASE],
    );
    if (tables.length === 0) {
      console.log('ai_models 表不存在，无需迁移（新装环境，seed 会写入 models）。');
      return;
    }

    // 3. 读所有模型，按 provider_id 分组
    const [models] = await conn.query(`SELECT * FROM ai_models ORDER BY provider_id, id`);
    console.log(`读到 ${models.length} 个模型记录`);

    const grouped = new Map();
    for (const m of models) {
      const pid = m.provider_id;
      if (!grouped.has(pid)) grouped.set(pid, []);
      grouped.get(pid).push({
        modelId: m.model_id,
        displayName: m.display_name,
        maxContextTokens: m.max_context_tokens ?? undefined,
        maxOutputTokens: m.max_output_tokens ?? undefined,
        supportsTools: !!m.supports_tools,
        supportsThinking: !!m.supports_thinking,
      });
    }

    // 4. 对每个 provider 写入 models JSON
    let updated = 0;
    for (const [pid, list] of grouped) {
      await conn.query(
        `UPDATE ai_providers SET models = ? WHERE id = ?`,
        [JSON.stringify(list), pid],
      );
      updated++;
      console.log(`  ✔ provider #${pid}: 写入 ${list.length} 个模型`);
    }

    // 5. 对没有模型的 provider，写入空数组
    await conn.query(
      `UPDATE ai_providers SET models = '[]' WHERE models IS NULL OR models = ''`,
    );

    console.log(`\n✅ 迁移完成：${updated} 个 provider 的模型已合并到 models 字段。`);
    console.log('   ai_models 表保留未删，确认无误后可手动执行：DROP TABLE ai_models;');
  } catch (err) {
    console.error('❌ 迁移失败：', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
