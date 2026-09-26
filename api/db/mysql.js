/**
 * KMA Wedding & Media Production
 * MySQL Database Access Layer (mysql2/promise)
 *
 * Provides connection pooling, automatic schema initialization,
 * and repository query helpers for Hostinger production deployment.
 */

import mysql from 'mysql2/promise';

let pool = null;
let isConnected = false;

// 1. Connection Pool Initialization
export async function initMySQL() {
  if (isConnected && pool) return true;

  const hasConfig =
    process.env.MYSQL_URL ||
    process.env.DATABASE_URL ||
    (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER);

  if (!hasConfig) {
    console.warn('[MySQL] Missing database configuration in environment variables.');
    return false;
  }

  try {
    let poolConfig = {};

    if (process.env.MYSQL_URL || process.env.DATABASE_URL) {
      poolConfig = {
        uri: process.env.MYSQL_URL || process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      };
    } else {
      poolConfig = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      };
    }

    pool = mysql.createPool(poolConfig);

    // Test connection
    const connection = await pool.getConnection();
    connection.release();

    isConnected = true;
    console.log('[MySQL] Connected to MySQL database pool successfully.');

    await createTablesIfNotExist();
    return true;
  } catch (err) {
    // طباعة الخطأ بالكامل
    console.error('[MySQL] Database connection failed with error:');
    console.error(err);

    isConnected = false;
    pool = null;
    return false;
  }
}

export function isMySQLConnected() {
  return isConnected && pool !== null;
}

export function getPool() {
  return pool;
}

// 2. Schema Auto-Initialization
async function createTablesIfNotExist() {
  if (!pool) return;

  const queries = [
    `CREATE TABLE IF NOT EXISTS \`portfolio\` (
      \`doc_id\` VARCHAR(64) NOT NULL,
      \`data\` LONGTEXT NOT NULL,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`doc_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS \`projects\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`title\` VARCHAR(255) NOT NULL,
      \`category\` VARCHAR(64) DEFAULT 'weddings',
      \`category_label\` VARCHAR(128) DEFAULT 'Cinematic Showcase',
      \`client\` VARCHAR(128) DEFAULT '',
      \`location\` VARCHAR(255) DEFAULT '',
      \`year\` VARCHAR(16) DEFAULT '',
      \`date\` VARCHAR(32) DEFAULT '',
      \`value\` VARCHAR(128) DEFAULT '',
      \`description\` TEXT,
      \`outcome\` TEXT,
      \`tech_stack\` LONGTEXT DEFAULT NULL,
      \`live_url\` VARCHAR(512) DEFAULT '',
      \`github_url\` VARCHAR(512) DEFAULT '',
      \`status\` ENUM('published', 'draft') DEFAULT 'published',
      \`is_featured\` BOOLEAN DEFAULT FALSE,
      \`cover_media_id\` VARCHAR(64) DEFAULT '',
      \`image_url\` VARCHAR(1024) DEFAULT '',
      \`video_url\` VARCHAR(1024) DEFAULT '',
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS \`project_media\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`project_id\` VARCHAR(64) NOT NULL,
      \`type\` ENUM('image', 'video') DEFAULT 'image',
      \`url\` TEXT NOT NULL,
      \`thumbnail_url\` TEXT,
      \`title\` VARCHAR(255) DEFAULT '',
      \`sort_order\` INT DEFAULT 0,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_media_project\` (\`project_id\`),
      CONSTRAINT \`fk_project_media\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS \`services\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`title\` VARCHAR(255) NOT NULL,
      \`category\` VARCHAR(64) DEFAULT 'weddings',
      \`description\` TEXT,
      \`items\` LONGTEXT DEFAULT NULL,
      \`price\` VARCHAR(64) DEFAULT '',
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS \`bookings\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`name\` VARCHAR(128) NOT NULL,
      \`phone\` VARCHAR(64) NOT NULL,
      \`email\` VARCHAR(128) DEFAULT '',
      \`event_type\` VARCHAR(64) DEFAULT 'wedding',
      \`event_date\` VARCHAR(64) DEFAULT '',
      \`location\` VARCHAR(255) DEFAULT '',
      \`message\` TEXT,
      \`status\` ENUM('new', 'contacted', 'confirmed', 'completed', 'cancelled') DEFAULT 'new',
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS \`settings\` (
      \`key_name\` VARCHAR(64) NOT NULL,
      \`value\` TEXT NOT NULL,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`key_name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS \`admins\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`email\` VARCHAR(128) NOT NULL UNIQUE,
      \`password_hash\` VARCHAR(255) NOT NULL,
      \`name\` VARCHAR(128) DEFAULT 'Admin',
      \`role\` VARCHAR(32) DEFAULT 'admin',
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`idx_admin_email\` (\`email\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  for (const q of queries) {
    try {
      await pool.query(q);
    } catch (e) {
      console.error('[MySQL] Error executing auto-table query:', e.message);
    }
  }
}

// --------------------------------------------------------
// 3. REPOSITORY QUERY HELPERS
// --------------------------------------------------------

// --- PORTFOLIO REPOSITORY ---
export const portfolioRepo = {
  async get(docId = 'kma_portfolio_main') {
    if (!pool) return null;
    const [rows] = await pool.query('SELECT data FROM portfolio WHERE doc_id = ? LIMIT 1', [docId]);
    if (rows && rows.length > 0) {
      const raw = rows[0].data;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    return null;
  },

  async save(docId = 'kma_portfolio_main', data) {
    if (!pool) return false;
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    await pool.query(
      `INSERT INTO portfolio (doc_id, data, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
      [docId, jsonStr]
    );
    return true;
  }
};

// --- PROJECTS REPOSITORY ---
export const projectRepo = {
  async listAll() {
    if (!pool) return [];
    const [projects] = await pool.query('SELECT * FROM projects ORDER BY updated_at DESC');
    if (!projects || projects.length === 0) return [];

    const [mediaRows] = await pool.query('SELECT * FROM project_media ORDER BY sort_order ASC');
    const mediaByProject = {};
    (mediaRows || []).forEach((m) => {
      if (!mediaByProject[m.project_id]) mediaByProject[m.project_id] = [];
      mediaByProject[m.project_id].push({
        id: m.id,
        type: m.type,
        url: m.url,
        thumbnailUrl: m.thumbnail_url || '',
        title: m.title || '',
        sortOrder: m.sort_order,
        createdAt: m.created_at ? new Date(m.created_at).toISOString() : ''
      });
    });

    return projects.map((p) => formatProjectRecord(p, mediaByProject[p.id] || []));
  },

  async getById(id) {
    if (!pool) return null;
    const [projects] = await pool.query('SELECT * FROM projects WHERE id = ? LIMIT 1', [id]);
    if (!projects || projects.length === 0) return null;

    const [mediaRows] = await pool.query(
      'SELECT * FROM project_media WHERE project_id = ? ORDER BY sort_order ASC',
      [id]
    );
    const media = (mediaRows || []).map((m) => ({
      id: m.id,
      type: m.type,
      url: m.url,
      thumbnailUrl: m.thumbnail_url || '',
      title: m.title || '',
      sortOrder: m.sort_order,
      createdAt: m.created_at ? new Date(m.created_at).toISOString() : ''
    }));

    return formatProjectRecord(projects[0], media);
  },

  async create(project) {
    if (!pool) return null;
    const techStackJson = JSON.stringify(project.techStack || []);

    await pool.query(
      `INSERT INTO projects (
        id, title, category, category_label, client, location, year, date,
        value, description, outcome, tech_stack, live_url, github_url,
        status, is_featured, cover_media_id, image_url, video_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        title = VALUES(title), category = VALUES(category), category_label = VALUES(category_label),
        client = VALUES(client), location = VALUES(location), year = VALUES(year), date = VALUES(date),
        value = VALUES(value), description = VALUES(description), outcome = VALUES(outcome),
        tech_stack = VALUES(tech_stack), live_url = VALUES(live_url), github_url = VALUES(github_url),
        status = VALUES(status), is_featured = VALUES(is_featured), cover_media_id = VALUES(cover_media_id),
        image_url = VALUES(image_url), video_url = VALUES(video_url), updated_at = NOW()`,
      [
        project.id,
        project.title,
        project.category || 'weddings',
        project.categoryLabel || 'Cinematic Showcase',
        project.client || '',
        project.location || '',
        project.year || '',
        project.date || '',
        project.value || '',
        project.description || '',
        project.outcome || '',
        techStackJson,
        project.liveUrl || '',
        project.githubUrl || '',
        project.status === 'draft' ? 'draft' : 'published',
        Boolean(project.isFeatured),
        project.coverMediaId || '',
        project.imageUrl || '',
        project.videoUrl || ''
      ]
    );

    // Insert media items
    await pool.query('DELETE FROM project_media WHERE project_id = ?', [project.id]);
    if (Array.isArray(project.media) && project.media.length > 0) {
      for (let i = 0; i < project.media.length; i++) {
        const m = project.media[i];
        if (!m || !m.url) continue;
        await pool.query(
          `INSERT INTO project_media (id, project_id, type, url, thumbnail_url, title, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            m.id || `media-${project.id}-${i}`,
            project.id,
            m.type === 'video' ? 'video' : 'image',
            m.url,
            m.thumbnailUrl || '',
            m.title || '',
            typeof m.sortOrder === 'number' ? m.sortOrder : i
          ]
        );
      }
    }

    return this.getById(project.id);
  },

  async update(id, updates) {
    if (!pool) return null;
    const existing = await this.getById(id);
    if (!existing) return null;

    const merged = {
      ...existing,
      ...updates,
      id
    };

    return this.create(merged);
  },

  async delete(id) {
    if (!pool) return false;
    await pool.query('DELETE FROM projects WHERE id = ?', [id]);
    return true;
  }
};

function formatProjectRecord(row, media = []) {
  let techStack = [];
  try {
    techStack = typeof row.tech_stack === 'string' ? JSON.parse(row.tech_stack) : row.tech_stack || [];
  } catch (e) {
    techStack = [];
  }

  return {
    id: row.id,
    title: row.title,
    category: row.category || 'weddings',
    categoryLabel: row.category_label || 'Cinematic Showcase',
    client: row.client || '',
    location: row.location || '',
    tribunal: row.location || '', // legacy mirror
    year: row.year || '',
    date: row.date || '',
    value: row.value || '',
    description: row.description || '',
    outcome: row.outcome || '',
    techStack: Array.isArray(techStack) ? techStack : [],
    liveUrl: row.live_url || '',
    githubUrl: row.github_url || '',
    status: row.status || 'published',
    isFeatured: Boolean(row.is_featured),
    coverMediaId: row.cover_media_id || '',
    imageUrl: row.image_url || '',
    videoUrl: row.video_url || '',
    media,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  };
}

// --- SERVICES REPOSITORY ---
export const serviceRepo = {
  async listAll() {
    if (!pool) return [];
    const [rows] = await pool.query('SELECT * FROM services ORDER BY created_at ASC');
    return (rows || []).map(formatServiceRecord);
  },

  async getById(id) {
    if (!pool) return null;
    const [rows] = await pool.query('SELECT * FROM services WHERE id = ? LIMIT 1', [id]);
    return rows && rows.length > 0 ? formatServiceRecord(rows[0]) : null;
  },

  async create(service) {
    if (!pool) return null;
    const itemsJson = JSON.stringify(service.items || []);
    await pool.query(
      `INSERT INTO services (id, title, category, description, items, price, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), category = VALUES(category), description = VALUES(description),
         items = VALUES(items), price = VALUES(price), updated_at = NOW()`,
      [
        service.id,
        service.title,
        service.category || 'weddings',
        service.description || '',
        itemsJson,
        service.price || ''
      ]
    );
    return this.getById(service.id);
  },

  async update(id, updates) {
    if (!pool) return null;
    const existing = await this.getById(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates, id };
    return this.create(merged);
  },

  async delete(id) {
    if (!pool) return false;
    await pool.query('DELETE FROM services WHERE id = ?', [id]);
    return true;
  }
};

function formatServiceRecord(row) {
  let items = [];
  try {
    items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items || [];
  } catch (e) {
    items = [];
  }

  return {
    id: row.id,
    title: row.title,
    category: row.category || 'weddings',
    description: row.description || '',
    items: Array.isArray(items) ? items : [],
    price: row.price || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  };
}

// --- BOOKINGS REPOSITORY ---
export const bookingRepo = {
  async listAll() {
    if (!pool) return [];
    const [rows] = await pool.query('SELECT * FROM bookings ORDER BY created_at DESC');
    return (rows || []).map((b) => ({
      id: b.id,
      name: b.name,
      phone: b.phone,
      email: b.email || '',
      eventType: b.event_type || 'wedding',
      eventDate: b.event_date || '',
      location: b.location || '',
      message: b.message || '',
      status: b.status || 'new',
      createdAt: b.created_at ? new Date(b.created_at).toISOString() : new Date().toISOString(),
      updatedAt: b.updated_at ? new Date(b.updated_at).toISOString() : new Date().toISOString()
    }));
  },

  async create(b) {
    if (!pool) return null;
    await pool.query(
      `INSERT INTO bookings (id, name, phone, email, event_type, event_date, location, message, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        b.id,
        b.name,
        b.phone,
        b.email || '',
        b.eventType || 'wedding',
        b.eventDate || '',
        b.location || '',
        b.message || '',
        b.status || 'new'
      ]
    );
    return b;
  },

  async updateStatus(id, status) {
    if (!pool) return false;
    await pool.query('UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return true;
  },

  async delete(id) {
    if (!pool) return false;
    await pool.query('DELETE FROM bookings WHERE id = ?', [id]);
    return true;
  }
};

// --- SETTINGS REPOSITORY ---
export const settingRepo = {
  async get(keyName) {
    if (!pool) return null;
    const [rows] = await pool.query('SELECT value FROM settings WHERE key_name = ? LIMIT 1', [keyName]);
    return rows && rows.length > 0 ? rows[0].value : null;
  },

  async set(keyName, value) {
    if (!pool) return false;
    await pool.query(
      `INSERT INTO settings (key_name, value, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
      [keyName, value]
    );
    return true;
  }
};

// --- ADMIN REPOSITORY ---
export const adminRepo = {
  async findByEmail(email) {
    if (!pool || !email) return null;
    const [rows] = await pool.query('SELECT * FROM admins WHERE LOWER(email) = LOWER(?) LIMIT 1', [email.trim()]);
    return rows && rows.length > 0 ? rows[0] : null;
  },

  async upsertAdmin(admin) {
    if (!pool || !admin.email || !admin.password_hash) return false;
    const id = admin.id || `admin_${Date.now()}`;
    await pool.query(
      `INSERT INTO admins (id, email, password_hash, name, role, updated_at)
       VALUES (?, LOWER(?), ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name), role = VALUES(role), updated_at = NOW()`,
      [id, admin.email.trim(), admin.password_hash, admin.name || 'Admin', admin.role || 'admin']
    );
    return true;
  },

  async updatePassword(email, passwordHash) {
    if (!pool || !email || !passwordHash) return false;
    await pool.query('UPDATE admins SET password_hash = ?, updated_at = NOW() WHERE LOWER(email) = LOWER(?)', [passwordHash, email.trim()]);
    return true;
  },

  async count() {
    if (!pool) return 0;
    const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM admins');
    return rows && rows.length > 0 ? rows[0].cnt : 0;
  }
};
