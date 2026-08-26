-- ═══ blog-lite schema 基线（生产建库用）═══
-- 生成方式: mysqldump --no-data（结构 only，无任何数据）
-- 用法: mysql -u root -p --default-character-set=utf8mb4 blog_lite_prod < schema-baseline.sql
-- 导入后必须补跑 add-missing-indexes.sql（基线缺 idx_post_tags_tag / idx_user_roles_role）
-- 再跑 seed（见 DEPLOY.md Step 3.3）。此文件随 entity 演进会过时，重新生成即可。
-- 生成时间: 2026-08-26 22:24
-- MySQL dump 10.13  Distrib 8.0.12, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: blog-lite
-- ------------------------------------------------------
-- Server version	8.0.12

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
 SET NAMES utf8mb4 ;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `ads`
--

DROP TABLE IF EXISTS `ads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `ads` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '广告 ID',
  `title` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标题（用户可见）',
  `subtitle` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '副标题/描述（用户可见）',
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '封面图 URL',
  `button_text` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '了解详情' COMMENT 'CTA 按钮文字',
  `href` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '跳转链接（邀请码隐式拼在此）',
  `position` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '投放位置: sidebar/popup/popup_toast',
  `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'card' COMMENT '样式类型（当前仅 card，预留扩展）',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive' COMMENT '状态: active=投放中 inactive=已暂停',
  `start_at` datetime DEFAULT NULL COMMENT '排期开始（null=立即生效）',
  `end_at` datetime DEFAULT NULL COMMENT '排期结束（null=永久）',
  `sort_order` int(11) NOT NULL DEFAULT '0' COMMENT '同位置内排序权重（小在前）',
  `impressions` int(11) NOT NULL DEFAULT '0' COMMENT '曝光计数',
  `clicks` int(11) NOT NULL DEFAULT '0' COMMENT '点击计数',
  `admin_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '后台备注（含收益说明，不对用户展示）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ad_created` (`created_at`),
  KEY `idx_ad_sort` (`sort_order`),
  KEY `idx_ad_position_status` (`position`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ai_conversations`
--

DROP TABLE IF EXISTS `ai_conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `ai_conversations` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '对话 ID',
  `post_id` int(11) NOT NULL COMMENT '关联文章 ID',
  `messages` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '对话消息 JSON',
  `model` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '使用模型',
  `prompt_tokens` int(11) NOT NULL DEFAULT '0' COMMENT '累计输入 token',
  `completion_tokens` int(11) NOT NULL DEFAULT '0' COMMENT '累计输出 token',
  `last_prompt_tokens` int(11) NOT NULL DEFAULT '0' COMMENT '最近一轮输入 token',
  `last_completion_tokens` int(11) NOT NULL DEFAULT '0' COMMENT '最近一轮输出 token',
  `rounds` int(11) NOT NULL DEFAULT '0' COMMENT '对话轮次',
  `compaction_summary` longtext COLLATE utf8mb4_unicode_ci COMMENT '最新历史压缩摘要',
  `compaction_messages` longtext COLLATE utf8mb4_unicode_ci COMMENT '压缩点之后的新对话JSON',
  `compaction_tokens` int(11) NOT NULL DEFAULT '0' COMMENT '最近一次压缩释放的token',
  `compacted_at` datetime DEFAULT NULL COMMENT '最近一次压缩时间',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ai_conv_updated` (`updated_at`),
  KEY `idx_ai_conv_post` (`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ai_providers`
--

DROP TABLE IF EXISTS `ai_providers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `ai_providers` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '提供商 ID',
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '名称',
  `baseUrl` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Base URL',
  `apiKey` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'API Key（明文）',
  `protocol` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'openai' COMMENT '协议',
  `models` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模型列表 JSON',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `status` tinyint(4) NOT NULL DEFAULT '1' COMMENT '状态：1 启用 0 禁用',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ai_provider_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `announcements`
--

DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `announcements` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '公告 ID',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标题',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '内容',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'visible' COMMENT '状态 visible=显示 hidden=隐藏',
  `sort_order` int(11) NOT NULL DEFAULT '0' COMMENT '排序权重',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ann_created` (`created_at`),
  KEY `idx_ann_sort` (`sort_order`),
  KEY `idx_ann_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `audit_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `targetType` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `targetId` bigint(20) NOT NULL,
  `field` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `oldValue` text COLLATE utf8mb4_unicode_ci,
  `newValue` text COLLATE utf8mb4_unicode_ci,
  `operatorId` bigint(20) DEFAULT NULL,
  `target_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `operator_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_2cd10fda8276bb995288acfbfb` (`created_at`),
  KEY `IDX_61614f246ac701597f688946b9` (`targetType`,`targetId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `backup_logs`
--

DROP TABLE IF EXISTS `backup_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `backup_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '记录 ID',
  `trigger` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发方式: schedule=定时器 manual=手动',
  `schedule_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '触发的定时器名称（手动触发为 null）',
  `r2_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'R2 对象 key（失败时可能为 null）',
  `size` bigint(20) DEFAULT NULL COMMENT '备份文件大小（字节，压缩后）',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'running' COMMENT '状态: running=进行中 success=成功 failed=失败',
  `error_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '失败原因（status=failed 时填）',
  `duration_ms` int(11) DEFAULT NULL COMMENT '备份耗时（毫秒）',
  `r2_verified` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'R2 HEAD 校验是否通过',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_backup_trigger` (`trigger`),
  KEY `idx_backup_status` (`status`),
  KEY `idx_backup_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `blacklists`
--

DROP TABLE IF EXISTS `blacklists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `blacklists` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '黑名单 ID',
  `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '类型：ip | user',
  `value` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '封禁值（IP 或 userId）',
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '封禁原因',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态：active 生效中 | expired 已解除',
  `expiresAt` datetime DEFAULT NULL COMMENT '过期时间（null=永久封禁）',
  `creatorId` bigint(20) DEFAULT NULL COMMENT '操作人用户ID（9位随机，与 users.id 对齐）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bl_type_value` (`type`,`value`),
  KEY `idx_bl_expires` (`expiresAt`),
  KEY `idx_bl_created` (`created_at`),
  KEY `idx_bl_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '分类 ID',
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分类名称',
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'URL slug',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '描述',
  `sort_order` int(11) NOT NULL DEFAULT '0' COMMENT '排序权重',
  `parent_id` int(11) DEFAULT NULL COMMENT '父分类 ID',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_category_name` (`name`),
  UNIQUE KEY `IDX_420d9f679d41281f282f5bc7d0` (`slug`),
  KEY `idx_category_sort` (`sort_order`),
  KEY `idx_category_parent` (`parent_id`),
  CONSTRAINT `FK_88cea2dc9c31951d06437879b40` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `code_usage_logs`
--

DROP TABLE IF EXISTS `code_usage_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `code_usage_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `code_id` int(11) NOT NULL COMMENT '关联的码ID',
  `user_id` bigint(20) DEFAULT NULL COMMENT '使用用户ID（9位随机，与 users.id 对齐；未登录可能为null）',
  `used_at` datetime NOT NULL COMMENT '使用时间',
  `clientIp` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户端IP',
  `metadata` json DEFAULT NULL COMMENT '扩展字段',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_codeusage_user` (`user_id`),
  KEY `idx_codeusage_code` (`code_id`),
  CONSTRAINT `FK_8b02c5e2dc3f6b7545ce6c1f9c4` FOREIGN KEY (`code_id`) REFERENCES `codes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `codes`
--

DROP TABLE IF EXISTS `codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `codes` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '激活码/邀请码',
  `type` enum('invitation','activation','discount','membership','resource') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '类型',
  `status` enum('active','used','expired','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `assigned_donation_id` int(11) DEFAULT NULL COMMENT '已分配给的捐赠单 ID（null=未分配，仍在码池中）',
  `maxUses` int(11) NOT NULL DEFAULT '1' COMMENT '最大使用次数（0=无限制）',
  `usedCount` int(11) NOT NULL DEFAULT '0' COMMENT '已使用次数',
  `expiresAt` datetime DEFAULT NULL COMMENT '过期时间（null=永不过期）',
  `creatorId` bigint(20) DEFAULT NULL COMMENT '创建人用户ID（9位随机，与 users.id 对齐）',
  `metadata` json DEFAULT NULL COMMENT '扩展字段',
  `discount` json DEFAULT NULL COMMENT '优惠信息（仅 discount 类型）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `usedAt` datetime DEFAULT NULL COMMENT '首次/末次使用时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_b384bf1b438808f45a0971fce6` (`code`),
  KEY `idx_code_assigned_donation` (`assigned_donation_id`),
  KEY `idx_code_status` (`status`),
  KEY `idx_code_type_status` (`type`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `comments`
--

DROP TABLE IF EXISTS `comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `comments` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '评论 ID',
  `entity_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标实体类型 post|...',
  `entity_id` int(11) NOT NULL COMMENT '目标实体 ID',
  `user_id` bigint(20) NOT NULL COMMENT '评论作者 ID',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '评论内容（纯文本，已转义）',
  `parent_id` int(11) DEFAULT NULL COMMENT '父评论 ID（NULL=一级）',
  `reply_to_user_id` bigint(20) DEFAULT NULL COMMENT '@ 目标用户 ID（二级回复间）',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '审核状态 pending|approved|rejected',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_comment_status_created` (`status`,`created_at`),
  KEY `idx_comment_parent_status_created` (`parent_id`,`status`,`created_at`),
  KEY `idx_user` (`user_id`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_entity` (`entity_type`,`entity_id`,`status`),
  KEY `FK_b7c58a347104bdc579d508fb52f` (`reply_to_user_id`),
  CONSTRAINT `FK_4c675567d2a58f0b07cef09c13d` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_b7c58a347104bdc579d508fb52f` FOREIGN KEY (`reply_to_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_d6f93329801a93536da4241e386` FOREIGN KEY (`parent_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `donation_notifications`
--

DROP TABLE IF EXISTS `donation_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `donation_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '通知记录 ID',
  `donation_id` int(11) NOT NULL COMMENT '关联的捐赠记录 ID',
  `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '通知类型：code=发码邮件 / thanks=感谢邮件',
  `recipientEmail` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '收件邮箱（发送时填写的，可能与捐赠原始邮箱不同）',
  `code_id` int(11) DEFAULT NULL COMMENT '关联激活码 ID（仅 type=code）',
  `subject` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_sent` tinyint(4) NOT NULL DEFAULT '0',
  `error_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `operator_id` bigint(20) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '发送时间',
  PRIMARY KEY (`id`),
  KEY `IDX_981234488bd57ada27ac7713b8` (`donation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `donations`
--

DROP TABLE IF EXISTS `donations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `donations` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '捐赠 ID',
  `donor_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '捐赠者昵称',
  `donor_avatar` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '捐赠者头像 URL',
  `donor_email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '捐赠者邮箱',
  `amount` decimal(10,2) NOT NULL COMMENT '捐赠金额',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CNY' COMMENT '币种',
  `pay_method` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '支付方式: wechat/alipay/crypto/other',
  `crypto_network` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '加密货币网络: TRC20/BSC/POL',
  `crypto_tx_hash` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '链上交易哈希',
  `crypto_from` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发送方钱包地址',
  `crypto_to` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '接收方钱包地址',
  `message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '捐赠者留言',
  `trade_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '第三方交易流水号',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'confirmed' COMMENT '状态: pending=待确认 confirmed=已确认 refunded=已退款',
  `is_visible` tinyint(4) NOT NULL DEFAULT '1' COMMENT '是否在捐赠墙展示: 1=展示 0=隐藏',
  `sort_order` int(11) NOT NULL DEFAULT '0' COMMENT '排序权重',
  `remark` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '管理员备注',
  `reward_code_id` int(11) DEFAULT NULL COMMENT '捐赠答谢激活码 ID（关联 codes.id，null=未发码）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_don_tradeno` (`trade_no`),
  KEY `idx_don_txhash` (`crypto_tx_hash`),
  KEY `idx_don_crypto_network` (`pay_method`,`crypto_network`),
  KEY `idx_don_paymethod` (`pay_method`),
  KEY `idx_don_created` (`created_at`),
  KEY `idx_don_sort` (`sort_order`),
  KEY `idx_don_visible_status` (`is_visible`,`status`),
  KEY `idx_don_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entity_visibility`
--

DROP TABLE IF EXISTS `entity_visibility`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `entity_visibility` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '实体类型：post/announcement/...',
  `entity_id` int(11) NOT NULL COMMENT '实体 ID',
  `subject_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '主体类型：user/role',
  `subject_id` int(11) NOT NULL COMMENT '主体 ID（用户 ID 或角色 ID）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_entity_visibility` (`entity_type`,`entity_id`,`subject_type`,`subject_id`),
  KEY `idx_ev_subject` (`subject_type`,`subject_id`),
  KEY `idx_ev_entity` (`entity_type`,`entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `friend_links`
--

DROP TABLE IF EXISTS `friend_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `friend_links` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '友链 ID',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '站点名称',
  `url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '站点 URL',
  `logo` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Logo URL',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '描述',
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other' COMMENT '分类 blog=博客 tool=工具 learn=学习资源 friend=友情 other=其他',
  `sort_order` int(11) NOT NULL DEFAULT '0' COMMENT '排序权重',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'visible' COMMENT '状态 visible=显示 hidden=隐藏',
  `post_id` int(11) DEFAULT NULL COMMENT '关联文章 ID，null=全局',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_friendlink_name` (`name`),
  KEY `idx_friendlink_category` (`category`),
  KEY `idx_friendlink_sort` (`sort_order`),
  KEY `idx_friendlink_status` (`status`),
  KEY `FK_e45c6b2f718312d48d2dee8f8da` (`post_id`),
  CONSTRAINT `FK_e45c6b2f718312d48d2dee8f8da` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `interactions`
--

DROP TABLE IF EXISTS `interactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `interactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户 ID（9位随机，与 users.id 对齐）',
  `entity_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标实体类型 post|comment',
  `entity_id` int(11) NOT NULL COMMENT '目标实体 ID',
  `type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '互动类型 like|favorite',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_entity_type` (`user_id`,`entity_type`,`entity_id`,`type`),
  KEY `idx_interaction_user_type_created` (`user_id`,`type`,`created_at`),
  KEY `idx_user_type` (`user_id`,`type`),
  KEY `idx_entity` (`entity_type`,`entity_id`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `media`
--

DROP TABLE IF EXISTS `media`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `media` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '素材 ID',
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储文件名',
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '原始文件名',
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'MIME 类型',
  `size` bigint(20) NOT NULL COMMENT '文件大小（字节）',
  `hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件 SHA256 哈希',
  `url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '访问 URL',
  `storage_type` enum('local','oss') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'local' COMMENT '存储类型：local=本地, oss=云存储',
  `oss_platform` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'OSS 平台：aliyun/tencent/cloudflare/backblaze',
  `uploader_id` bigint(20) NOT NULL COMMENT '上传者 ID',
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注：描述文件用途',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_media_dedup` (`hash`,`storage_type`,`oss_platform`),
  KEY `idx_media_url` (`url`),
  KEY `idx_media_created` (`created_at`),
  KEY `idx_media_uploader` (`uploader_id`),
  KEY `idx_media_hash` (`hash`),
  CONSTRAINT `FK_8bd1ad5f79df58cfd7ad9c42fb5` FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `memberships`
--

DROP TABLE IF EXISTS `memberships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `memberships` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '订阅 ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户 ID',
  `plan_id` int(11) NOT NULL COMMENT '套餐 ID',
  `started_at` datetime NOT NULL COMMENT '开始时间',
  `expires_at` datetime DEFAULT NULL COMMENT '到期时间（null=终身）',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态 active=生效 expired=已过期 cancelled=已取消',
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'admin' COMMENT '来源 admin=手动 code=兑换码 payment=支付',
  `source_id` int(11) DEFAULT NULL COMMENT '来源关联 ID',
  `note` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注（如：管理员手动续期）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_member_created` (`created_at`),
  KEY `idx_member_user_status` (`user_id`,`status`,`expires_at`),
  KEY `idx_member_expires` (`expires_at`),
  KEY `idx_member_status` (`status`),
  KEY `idx_member_plan` (`plan_id`),
  KEY `idx_member_user` (`user_id`),
  CONSTRAINT `FK_5c867a1e86e7c2a1abc92d6ecfc` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`),
  CONSTRAINT `FK_7c1e2fdfed4f6838e0c05ae5051` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `plans`
--

DROP TABLE IF EXISTS `plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `plans` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '套餐 ID',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '套餐名称（如：专业版月付）',
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'URL slug（如 pro_monthly）',
  `level` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '权益等级（plus/pro/max），决定可见权益层级',
  `durationDays` int(11) NOT NULL DEFAULT '30' COMMENT '有效期天数（0=终身）',
  `priceCents` int(11) NOT NULL DEFAULT '0' COMMENT '价格（分）',
  `benefits` json DEFAULT NULL COMMENT '权益列表',
  `roleId` int(11) DEFAULT NULL COMMENT '兑换时自动授予的角色组 ID',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '套餐描述',
  `isActive` tinyint(4) NOT NULL DEFAULT '1' COMMENT '是否上架（false=下架，不再售卖）',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT '排序权重（升序）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_e7b71bb444e74ee067df057397` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `post_tags`
--

DROP TABLE IF EXISTS `post_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `post_tags` (
  `post_id` int(11) NOT NULL,
  `tag_id` int(11) NOT NULL,
  PRIMARY KEY (`post_id`,`tag_id`),
  KEY `IDX_5df4e8dc2cb3e668b962362265` (`post_id`),
  KEY `IDX_192ab488d1c284ac9abe2e3035` (`tag_id`),
  CONSTRAINT `FK_192ab488d1c284ac9abe2e30356` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`),
  CONSTRAINT `FK_5df4e8dc2cb3e668b962362265d` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `post_views`
--

DROP TABLE IF EXISTS `post_views`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `post_views` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `post_id` int(11) NOT NULL COMMENT '文章 ID',
  `ip` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '访问者 IP',
  `user_agent` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '浏览器 UA',
  `user_id` bigint(20) DEFAULT NULL COMMENT '登录用户 ID（9位随机，与 users.id 对齐）',
  `viewed_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '访问时间',
  PRIMARY KEY (`id`),
  KEY `idx_postview_post_ip` (`post_id`,`ip`),
  KEY `idx_postview_viewed` (`viewed_at`),
  KEY `idx_postview_post` (`post_id`),
  CONSTRAINT `FK_c7df0096dacc9106dabf85b75cd` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `posts`
--

DROP TABLE IF EXISTS `posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `posts` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '文章 ID',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标题',
  `subtitle` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '副标题',
  `slug` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'URL slug',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '正文内容',
  `summary` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '摘要',
  `cover_image` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '封面图 URL',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '状态 draft=草稿 published=公开 login=登录可见 private=指定用户可见',
  `author_id` bigint(20) NOT NULL COMMENT '作者 ID',
  `category_id` int(11) DEFAULT NULL COMMENT '分类 ID',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `published_at` datetime DEFAULT NULL COMMENT '发布时间',
  `view_count` int(11) NOT NULL DEFAULT '0' COMMENT '阅读量',
  `like_count` int(11) NOT NULL DEFAULT '0' COMMENT '点赞数（冗余缓存）',
  `favorite_count` int(11) NOT NULL DEFAULT '0' COMMENT '收藏数（冗余缓存）',
  `comment_count` int(11) NOT NULL DEFAULT '0' COMMENT '评论数（冗余缓存，仅算 approved）',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  `is_pinned` tinyint(4) NOT NULL DEFAULT '0' COMMENT '是否置顶',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_54ddf9075260407dcfdd724857` (`slug`),
  KEY `idx_post_published` (`published_at`),
  KEY `idx_post_deleted` (`deleted_at`),
  KEY `idx_post_created` (`created_at`),
  KEY `idx_post_status` (`status`),
  KEY `idx_post_category` (`category_id`),
  KEY `idx_post_author` (`author_id`),
  CONSTRAINT `FK_312c63be865c81b922e39c2475e` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`),
  CONSTRAINT `FK_852f266adc5d67c40405c887b49` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `request_logs`
--

DROP TABLE IF EXISTS `request_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `request_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` int(11) NOT NULL,
  `duration_ms` int(11) NOT NULL,
  `ip` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `error_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_reqlog_ip` (`ip`),
  KEY `idx_reqlog_status` (`status`),
  KEY `idx_reqlog_created` (`created_at`),
  KEY `idx_reqlog_request_id` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `resource_categories`
--

DROP TABLE IF EXISTS `resource_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `resource_categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '资源分类 ID',
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分类名称',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '描述',
  `sort_order` int(11) NOT NULL DEFAULT '0' COMMENT '排序权重',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rescat_name` (`name`),
  KEY `idx_rescat_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `resources`
--

DROP TABLE IF EXISTS `resources`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `resources` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '资源 ID',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标题',
  `description` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '副标题/简介',
  `cover` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '封面图 URL',
  `category_id` int(11) DEFAULT NULL COMMENT '资源分类 ID',
  `uploader_id` bigint(20) DEFAULT NULL COMMENT '上传者用户 ID',
  `content` text COLLATE utf8mb4_unicode_ci COMMENT '资源详细说明（富文本）',
  `pan_links` json DEFAULT NULL COMMENT '网盘链接 JSON 数组',
  `price_cents` int(11) NOT NULL DEFAULT '0' COMMENT '价格（分），0=免费',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '状态 draft=草稿 published=公开 login=登录可见 private=指定可见',
  `min_member_level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '【已废弃】最低会员等级，改用 allowedRoleIds',
  `required_role_ids` json DEFAULT NULL COMMENT '解锁所需的角色组 ID 列表（空=无门槛）',
  `view_count` int(11) NOT NULL DEFAULT '0' COMMENT '浏览数',
  `sort_order` int(11) NOT NULL DEFAULT '0' COMMENT '排序权重',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_resource_sort_created` (`sort_order`,`created_at`),
  KEY `idx_resource_uploader` (`uploader_id`),
  KEY `idx_resource_category` (`category_id`),
  KEY `idx_resource_sort` (`sort_order`),
  KEY `idx_resource_status` (`status`),
  CONSTRAINT `FK_42a91403d5498bcd3cde20a3980` FOREIGN KEY (`category_id`) REFERENCES `resource_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_bf650039fa84491f02d72691ea2` FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '角色 ID',
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色标识',
  `display_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示名称',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '描述',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_648e3f5447f725579d7d4ffdfb` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `settings`
--

DROP TABLE IF EXISTS `settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置键',
  `value` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置值',
  `description` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '说明',
  `group` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general' COMMENT '分组',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_c8639b7626fa94ba8265628f21` (`key`),
  KEY `idx_setting_group` (`group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tags`
--

DROP TABLE IF EXISTS `tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `tags` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '标签 ID',
  `name` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标签名称',
  `slug` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'URL slug',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_d90243459a697eadb8ad56e909` (`name`),
  UNIQUE KEY `IDX_b3aa10c29ea4e61a830362bd25` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `user_roles` (
  `user_id` bigint(20) NOT NULL,
  `role_id` int(11) NOT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `IDX_87b8888186ca9769c960e92687` (`user_id`),
  KEY `IDX_b23c65e50a758245a33ee35fda` (`role_id`),
  CONSTRAINT `FK_87b8888186ca9769c960e926870` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_b23c65e50a758245a33ee35fda1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `users` (
  `id` bigint(20) NOT NULL COMMENT '用户 ID（9位随机数字）',
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '密码哈希',
  `nickname` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示昵称',
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱（唯一，可为空）',
  `avatar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '头像 URL',
  `gender` int(11) DEFAULT '0' COMMENT '性别 0=未知 1=男 2=女',
  `signature` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '个性签名',
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '手机号',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态 active=正常 disabled=禁用',
  `banned_until` datetime DEFAULT NULL COMMENT '封禁截止时间（null=未封禁或永久封禁）',
  `register_code_id` int(11) DEFAULT NULL COMMENT '注册时使用的邀请码ID',
  `register_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '注册IP',
  `register_source` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '注册来源',
  `last_login_at` datetime DEFAULT NULL COMMENT '最后登录时间',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_email` (`email`),
  KEY `idx_user_created` (`created_at`),
  KEY `idx_user_status` (`status`),
  KEY `FK_9729b629c1c7c8641c3bff9de06` (`register_code_id`),
  CONSTRAINT `FK_9729b629c1c7c8641c3bff9de06` FOREIGN KEY (`register_code_id`) REFERENCES `codes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping routines for database 'blog-lite'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-26 22:24:34
