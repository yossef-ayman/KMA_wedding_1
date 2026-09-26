-- ========================================================
-- KMA Wedding & Media Production — MySQL Production Schema
-- Compatible with MySQL 5.7, 8.0, and MariaDB (Hostinger Standard)
-- ========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Portfolio Monolithic State Table
CREATE TABLE IF NOT EXISTS `portfolio` (
  `doc_id` VARCHAR(64) NOT NULL,
  `data` LONGTEXT NOT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`doc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS `projects` (
  `id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `category` VARCHAR(64) DEFAULT 'weddings',
  `category_label` VARCHAR(128) DEFAULT 'Cinematic Showcase',
  `client` VARCHAR(128) DEFAULT '',
  `location` VARCHAR(255) DEFAULT '',
  `year` VARCHAR(16) DEFAULT '',
  `date` VARCHAR(32) DEFAULT '',
  `value` VARCHAR(128) DEFAULT '',
  `description` TEXT,
  `outcome` TEXT,
  `tech_stack` LONGTEXT DEFAULT NULL,
  `live_url` VARCHAR(512) DEFAULT '',
  `github_url` VARCHAR(512) DEFAULT '',
  `status` ENUM('published', 'draft') DEFAULT 'published',
  `is_featured` BOOLEAN DEFAULT FALSE,
  `cover_media_id` VARCHAR(64) DEFAULT '',
  `image_url` VARCHAR(1024) DEFAULT '',
  `video_url` VARCHAR(1024) DEFAULT '',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_status` (`status`),
  KEY `idx_project_category` (`category`),
  KEY `idx_project_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Project Media Table (1-to-N with projects, CASCADE delete)
CREATE TABLE IF NOT EXISTS `project_media` (
  `id` VARCHAR(64) NOT NULL,
  `project_id` VARCHAR(64) NOT NULL,
  `type` ENUM('image', 'video') DEFAULT 'image',
  `url` TEXT NOT NULL,
  `thumbnail_url` TEXT,
  `title` VARCHAR(255) DEFAULT '',
  `sort_order` INT DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_media_project` (`project_id`),
  KEY `idx_media_sort` (`sort_order`),
  CONSTRAINT `fk_project_media` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Services / Packages Table
CREATE TABLE IF NOT EXISTS `services` (
  `id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `category` VARCHAR(64) DEFAULT 'weddings',
  `description` TEXT,
  `items` LONGTEXT DEFAULT NULL,
  `price` VARCHAR(64) DEFAULT '',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Bookings Inquiries Table
CREATE TABLE IF NOT EXISTS `bookings` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `phone` VARCHAR(64) NOT NULL,
  `email` VARCHAR(128) DEFAULT '',
  `event_type` VARCHAR(64) DEFAULT 'wedding',
  `event_date` VARCHAR(64) DEFAULT '',
  `location` VARCHAR(255) DEFAULT '',
  `message` TEXT,
  `status` ENUM('new', 'contacted', 'confirmed', 'completed', 'cancelled') DEFAULT 'new',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_booking_status` (`status`),
  KEY `idx_booking_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Settings Table (Admin passcodes, system keys)
CREATE TABLE IF NOT EXISTS `settings` (
  `key_name` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Admins Table (Email & Password Authentication)
CREATE TABLE IF NOT EXISTS `admins` (
  `id` VARCHAR(64) NOT NULL,
  `email` VARCHAR(128) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `name` VARCHAR(128) DEFAULT 'Admin',
  `role` VARCHAR(32) DEFAULT 'admin',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_admin_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
