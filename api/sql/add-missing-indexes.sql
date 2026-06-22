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

-- ════════════════════════════════════════════════════════════
-- 第二批：v2 接入真实接口后补齐的热表索引
-- ════════════════════════════════════════════════════════════

-- ── comments: 二级回复热路径 (parentId, status, createdAt) ──
-- comment.service.ts listReplies: WHERE parentId=? AND status='approved' ORDER BY createdAt ASC
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'comments'
    AND index_name = 'idx_comment_parent_status_created'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_comment_parent_status_created ON comments(parent_id, status, created_at)',
  'SELECT "idx_comment_parent_status_created 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── comments: 后台审核列表 (status, createdAt) ──
-- adminList: WHERE status=? ORDER BY createdAt DESC
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'comments'
    AND index_name = 'idx_comment_status_created'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_comment_status_created ON comments(status, created_at)',
  'SELECT "idx_comment_status_created 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── interactions: 我的点赞/收藏列表 (userId, type, createdAt) ──
-- listMine: WHERE userId=? AND type=? ORDER BY createdAt DESC
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'interactions'
    AND index_name = 'idx_interaction_user_type_created'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_interaction_user_type_created ON interactions(user_id, type, created_at)',
  'SELECT "idx_interaction_user_type_created 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── memberships: 管理端列表分页 (createdAt) ──
-- findAll: ORDER BY createdAt DESC
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'memberships'
    AND index_name = 'idx_member_created'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_member_created ON memberships(created_at)',
  'SELECT "idx_member_created 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── resources: 列表排序 (sortOrder, createdAt) ──
-- findAll: ORDER BY sortOrder ASC, createdAt DESC
-- 注：MySQL 8.0+ 支持降序索引，5.7 会忽略 DESC 关键字（仅作前缀优化）
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'resources'
    AND index_name = 'idx_resource_sort_created'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_resource_sort_created ON resources(sort_order, created_at)',
  'SELECT "idx_resource_sort_created 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── ai_conversations: 管理页列表 (updatedAt) ──
-- findAll: ORDER BY updatedAt DESC
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_conversations'
    AND index_name = 'idx_ai_conv_updated'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_ai_conv_updated ON ai_conversations(updated_at)',
  'SELECT "idx_ai_conv_updated 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── code_usage_logs: 兑换记录查询 (codeId, usedAt) + (userId) + (usedAt) ──
-- 原代码三个 @Index 装饰器悬空（夹在 @Column 和 @ManyToOne 之间，未挂在任何列上），
-- TypeORM 未生成索引。这里补回。
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'code_usage_logs'
    AND index_name = 'idx_codeusage_code_used'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_codeusage_code_used ON code_usage_logs(code_id, used_at)',
  'SELECT "idx_codeusage_code_used 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'code_usage_logs'
    AND index_name = 'IDX_code_usage_logs_user_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX IDX_code_usage_logs_user_id ON code_usage_logs(user_id)',
  'SELECT "IDX_code_usage_logs_user_id 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
