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

-- ── code_usage_logs: 清理历史脏索引 + 建正确索引 ──
-- 背景：原 code-usage-log.entity.ts 三个 @Index 装饰器悬空（未挂任何列），
-- TypeORM 错误地把名为 used_at 的索引建在了 code_id 列上，且被外键复用，
-- 导致 DROP INDEX used_at 报 ER_DROP_INDEX_FK，后端启动崩溃。
-- 此段幂等完成：建新索引 → 删外键 → 删脏索引 → 重建外键。
-- 已在各环境手工执行过，此脚本作为新环境/重置环境的兜底。

-- 1. 若正确索引 idx_codeusage_code 不存在，先建它（外键需要 code_id 上有索引）
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'code_usage_logs'
    AND index_name = 'idx_codeusage_code'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_codeusage_code ON code_usage_logs(code_id)',
  'SELECT "idx_codeusage_code 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 若脏索引 used_at 仍存在（其索引列实际是 code_id），清理它
--    先找到引用它的外键并删除，再删脏索引，最后重建外键
SET @dirty_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'code_usage_logs'
    AND index_name = 'used_at'
);
-- 仅当脏索引存在时执行清理（用 information_schema 动态拼 SQL）
SET @fk_name := (
  SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'code_usage_logs'
    AND COLUMN_NAME = 'code_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @sql := IF(@dirty_exists > 0 AND @fk_name IS NOT NULL,
  CONCAT('ALTER TABLE code_usage_logs DROP FOREIGN KEY ', @fk_name),
  'SELECT "无外键需删除或无脏索引" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@dirty_exists > 0,
  'DROP INDEX used_at ON code_usage_logs',
  'SELECT "脏索引 used_at 不存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 重建外键（若已不存在）。用 NOT EXISTS 判断避免重复创建报错。
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'code_usage_logs'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE code_usage_logs ADD CONSTRAINT FK_code_usage_logs_code FOREIGN KEY (code_id) REFERENCES codes(id) ON DELETE CASCADE',
  'SELECT "外键已存在，跳过重建" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ════════════════════════════════════════════════════════════
-- codes.assigned_donation_id 列 + 捐赠发码语义修复
-- 背景：原设计捐赠发码时把 status 置 disabled 来"移出码池"，但兑换只接受
-- active，导致捐赠答谢码用户拿到后无法兑换（P0 致命 bug）。
-- 修复：新增 assigned_donation_id 列标记"已分配"，码保持 active；
-- 历史被错误 disabled 的捐赠码（metadata 含 donationId）恢复成 active。
-- ════════════════════════════════════════════════════════════

-- 1. 新增 assigned_donation_id 列（若不存在）
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'codes'
    AND COLUMN_NAME = 'assigned_donation_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE codes ADD COLUMN assigned_donation_id INT NULL COMMENT ''已分配给的捐赠单 ID（null=未分配，仍在码池中）''',
  'SELECT "assigned_donation_id 列已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 从 metadata.donationId 回填 assigned_donation_id（历史数据迁移）
--    JSON_EXTRACT 取出 metadata 里的 donationId 写入正式列
UPDATE codes
SET assigned_donation_id = CAST(JSON_EXTRACT(metadata, '$.donationId') AS UNSIGNED)
WHERE assigned_donation_id IS NULL
  AND JSON_EXTRACT(metadata, '$.donationId') IS NOT NULL;

-- 3. 索引（若不存在）：码池查询 WHERE assigned_donation_id IS NULL 热路径
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'codes'
    AND INDEX_NAME = 'idx_code_assigned_donation'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_code_assigned_donation ON codes(assigned_donation_id)',
  'SELECT "idx_code_assigned_donation 已存在，跳过" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. 修复历史被错误 disabled 的捐赠答谢码（恢复成 active 让用户能兑换）
--    只恢复"因捐赠发码被 disabled 且未使用"的码；admin 主动停用的码不动。
UPDATE codes
SET status = 'active'
WHERE status = 'disabled'
  AND assigned_donation_id IS NOT NULL
  AND used_count = 0;


-- ═══ 性能深扫补丁（2026-08-27，十万行级劣化点）═══
-- posts 公开列表 ORDER BY is_pinned DESC, created_at DESC 零 filesort（H1）
CREATE INDEX idx_post_list ON posts (status, deleted_at, is_pinned, created_at);
-- dashboard 互动 7 天趋势窗口扫描（H2）
CREATE INDEX idx_interaction_created ON interactions (created_at);
-- comments 一级评论：优化器统计偏斜时不再弃用 entity 索引（M6）
CREATE INDEX idx_comment_entity_full ON comments (entity_type, entity_id, status, created_at);
-- request_logs 4xx/5xx 筛选 + 排序（M1）
CREATE INDEX idx_reqlog_status_created ON request_logs (status, created_at);
