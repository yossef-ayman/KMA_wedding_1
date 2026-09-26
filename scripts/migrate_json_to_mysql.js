/**
 * migrate_json_to_mysql.js
 * ========================
 * One-shot migration: reads legacy data/saved_portfolio.json and
 * data/saved_bookings.json then imports every record into MySQL.
 *
 * Usage:
 *   node scripts/migrate_json_to_mysql.js
 *
 * The script is IDEMPOTENT — it uses INSERT IGNORE / ON DUPLICATE KEY
 * UPDATE so it is safe to run multiple times without duplicating data.
 *
 * Prerequisites:
 *   • .env (or environment) must expose MYSQL_HOST, MYSQL_USER,
 *     MYSQL_PASSWORD, MYSQL_DATABASE (same vars used by api/db/mysql.js).
 *   • Run from the project root: node scripts/migrate_json_to_mysql.js
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql2 from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── helpers ─────────────────────────────────────────────────────────────────
function readJson(relPath, fallback) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    console.warn(`  ⚠  File not found: ${abs} — skipping`);
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    console.error(`  ✗  Could not parse ${abs}: ${e.message}`);
    return fallback;
  }
}

function safeStr(v) {
  if (v == null) return null;
  return String(v);
}

function safeJson(v) {
  if (v == null) return null;
  return JSON.stringify(v);
}

// ─── connect ─────────────────────────────────────────────────────────────────
async function connect() {
  const conn = await mysql2.createConnection({
    host:     process.env.MYSQL_HOST     || 'localhost',
    port:     Number(process.env.MYSQL_PORT || 3306),
    user:     process.env.MYSQL_USER     || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'kma_db',
    multipleStatements: false,
  });
  console.log(`✔  Connected to MySQL at ${process.env.MYSQL_HOST || 'localhost'}/${process.env.MYSQL_DATABASE || 'kma_db'}`);
  return conn;
}

// ─── ensure tables exist (minimal DDL mirrors api/db/schema.sql) ──────────────
async function ensureTables(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS portfolio (
      doc_id      VARCHAR(255) PRIMARY KEY,
      data        LONGTEXT,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id              VARCHAR(255) PRIMARY KEY,
      title           VARCHAR(512),
      category        VARCHAR(100),
      status          VARCHAR(50) DEFAULT 'published',
      is_featured     TINYINT(1) DEFAULT 0,
      cover_media_id  VARCHAR(255),
      description     TEXT,
      media           LONGTEXT,
      raw_data        LONGTEXT,
      created_at      DATETIME,
      updated_at      DATETIME
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS services (
      id          VARCHAR(255) PRIMARY KEY,
      title       VARCHAR(512),
      description TEXT,
      price       VARCHAR(255),
      raw_data    LONGTEXT,
      created_at  DATETIME,
      updated_at  DATETIME
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS bookings (
      id          VARCHAR(255) PRIMARY KEY,
      name        VARCHAR(255),
      phone       VARCHAR(100),
      email       VARCHAR(255),
      event_type  VARCHAR(100),
      event_date  VARCHAR(100),
      location    VARCHAR(512),
      message     TEXT,
      status      VARCHAR(50) DEFAULT 'new',
      created_at  DATETIME,
      updated_at  DATETIME
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id            VARCHAR(255) PRIMARY KEY,
      email         VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name          VARCHAR(255),
      role          VARCHAR(50) DEFAULT 'admin',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log('✔  Tables verified / created');
}

// ─── migrate portfolio (blob + individual projects + services) ────────────────
async function migratePortfolio(conn) {
  const portfolio = readJson('data/saved_portfolio.json', null);
  if (!portfolio) return;

  // 1. Save the full blob
  await conn.execute(
    `INSERT INTO portfolio (doc_id, data) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
    ['kma_portfolio_main', JSON.stringify(portfolio)]
  );
  console.log('  ✔  portfolio blob saved');

  // 2. Individual projects
  const projects = Array.isArray(portfolio.projects) ? portfolio.projects : [];
  let projCount = 0;
  for (const p of projects) {
    if (!p.id) continue;
    await conn.execute(
      `INSERT INTO projects
         (id, title, category, status, is_featured, cover_media_id, description, media, raw_data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), category = VALUES(category), status = VALUES(status),
         is_featured = VALUES(is_featured), cover_media_id = VALUES(cover_media_id),
         description = VALUES(description), media = VALUES(media),
         raw_data = VALUES(raw_data), updated_at = VALUES(updated_at)`,
      [
        safeStr(p.id),
        safeStr(p.title),
        safeStr(p.category || 'weddings'),
        safeStr(p.status === 'draft' ? 'draft' : 'published'),
        p.isFeatured ? 1 : 0,
        safeStr(p.coverMediaId || ''),
        safeStr(p.description || ''),
        safeJson(p.media || []),
        safeJson(p),
        p.createdAt ? new Date(p.createdAt) : new Date(),
        p.updatedAt ? new Date(p.updatedAt) : new Date(),
      ]
    );
    projCount++;
  }
  console.log(`  ✔  ${projCount} project(s) upserted`);

  // 3. Individual services
  const services = Array.isArray(portfolio.services)
    ? portfolio.services
    : Array.isArray(portfolio.practiceAreas)
    ? portfolio.practiceAreas
    : [];
  let svcCount = 0;
  for (const s of services) {
    if (!s.id) continue;
    await conn.execute(
      `INSERT INTO services
         (id, title, description, price, raw_data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), description = VALUES(description),
         price = VALUES(price), raw_data = VALUES(raw_data), updated_at = VALUES(updated_at)`,
      [
        safeStr(s.id),
        safeStr(s.title),
        safeStr(s.description || ''),
        safeStr(s.price || ''),
        safeJson(s),
        s.createdAt ? new Date(s.createdAt) : new Date(),
        s.updatedAt ? new Date(s.updatedAt) : new Date(),
      ]
    );
    svcCount++;
  }
  console.log(`  ✔  ${svcCount} service(s) upserted`);
}

// ─── migrate bookings ─────────────────────────────────────────────────────────
async function migrateBookings(conn) {
  const bookings = readJson('data/saved_bookings.json', []);
  if (!Array.isArray(bookings) || bookings.length === 0) {
    console.log('  ℹ  No bookings to migrate');
    return;
  }

  let count = 0;
  for (const b of bookings) {
    if (!b.id) continue;
    await conn.execute(
      `INSERT INTO bookings
         (id, name, phone, email, event_type, event_date, location, message, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), phone = VALUES(phone), email = VALUES(email),
         event_type = VALUES(event_type), event_date = VALUES(event_date),
         location = VALUES(location), message = VALUES(message),
         status = VALUES(status), updated_at = VALUES(updated_at)`,
      [
        safeStr(b.id),
        safeStr(b.name || ''),
        safeStr(b.phone || ''),
        safeStr(b.email || ''),
        safeStr(b.eventType || 'wedding'),
        safeStr(b.eventDate || ''),
        safeStr(b.location || ''),
        safeStr(b.message || ''),
        safeStr(b.status || 'new'),
        b.createdAt ? new Date(b.createdAt) : new Date(),
        b.updatedAt ? new Date(b.updatedAt) : new Date(),
      ]
    );
    count++;
  }
  console.log(`  ✔  ${count} booking(s) upserted`);
}

// ─── migrate admins ───────────────────────────────────────────────────────────
async function migrateAdmins(conn) {
  const admins = readJson('data/saved_admins.json', []);
  if (!Array.isArray(admins) || admins.length === 0) {
    console.log('  ℹ  No legacy admin records in JSON file');
    return;
  }

  let count = 0;
  for (const a of admins) {
    if (!a.email) continue;
    await conn.execute(
      `INSERT INTO admins (id, email, password_hash, name, role)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         password_hash = COALESCE(VALUES(password_hash), password_hash),
         name = COALESCE(VALUES(name), name),
         role = COALESCE(VALUES(role), role)`,
      [
        safeStr(a.id || `admin_${Date.now()}_${count}`),
        safeStr(a.email.toLowerCase()),
        safeStr(a.password_hash || null),
        safeStr(a.name || 'Admin'),
        safeStr(a.role || 'admin'),
      ]
    );
    count++;
  }
  console.log(`  ✔  ${count} admin record(s) upserted`);
}

// ─── summary counts ───────────────────────────────────────────────────────────
async function printSummary(conn) {
  const tables = ['portfolio', 'projects', 'services', 'bookings', 'admins'];
  console.log('\n─── Migration Summary ───────────────────────────');
  for (const t of tables) {
    try {
      const [rows] = await conn.execute(`SELECT COUNT(*) AS n FROM ${t}`);
      console.log(`  ${t.padEnd(12)}: ${rows[0].n} row(s)`);
    } catch {
      console.log(`  ${t.padEnd(12)}: (table not accessible)`);
    }
  }
  console.log('─────────────────────────────────────────────────');
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀  KMA — JSON → MySQL Migration\n');
  let conn;
  try {
    conn = await connect();
    await ensureTables(conn);

    console.log('\n📂  Migrating portfolio data...');
    await migratePortfolio(conn);

    console.log('\n📂  Migrating bookings...');
    await migrateBookings(conn);

    console.log('\n📂  Migrating admin accounts...');
    await migrateAdmins(conn);

    await printSummary(conn);
    console.log('\n✅  Migration complete!\n');
  } catch (err) {
    console.error('\n✗  Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
