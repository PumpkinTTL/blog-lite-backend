-- ════════════════════════════════════════════════════════════
-- 补建缺失索引（TypeORM synchronize 不会自动建的）
-- 执行方式：mysql -u root -p blog-lite < sql/add-missing-indexes.sql
-- 或在 DB 客户端里逐条跑。
-- 幂等设计：用 information_schema 判断已存在再创建，可重复执行。
-- ════════════════════════════════════════════════════════════

-- ── post_tags 联结表：tag_id 索引 ──
-- TypeORM @JoinTable 自动给 post_id 建索引，但不给 tag_id 建。
-- post.service.ts 按 tag_id 过滤是热路径（WHERE pt.tag_id = :tagId）。
-- 注意：post_id 已有索引（@JoinTable 自动建），这里只补 tag_id。
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'post_tags'
    AND index_name = 'idx_post_tags_tag'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_post_tags_tag ON post_tags(tag_id)',
  'SELECT "idx_post_tags_tag 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── user_roles 联结表：role_id 索引（低优先级，小表）──
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'user_roles'
    AND index_name = 'idx_user_roles_role'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_user_roles_role ON user_roles(role_id)',
  'SELECT "idx_user_roles_role 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
