/**
 * KMA Wedding & Media Production
 * Admin Account Creation & Management Script
 *
 * Usage:
 *   node scripts/create_admin.js [email] [password] [name]
 *
 * Example:
 *   node scripts/create_admin.js admin@kma.com kma2026 "KMA Admin"
 *

 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const LOCAL_DATA_DIR = path.join(ROOT_DIR, 'data');
const LOCAL_ADMINS_FILE = path.join(LOCAL_DATA_DIR, 'saved_admins.json');

// Parse CLI arguments with fallback defaults
const args = process.argv.slice(2);
const email = (args[0] || 'admin@kma.com').trim().toLowerCase();
const password = args[1] || 'kma2026';
const name = args[2] || 'KMA Admin';

console.log('====================================================');
console.log('🛡️  KMA Wedding & Media Production — Admin Creation');
console.log('====================================================');
console.log(`📧 Target Email:    ${email}`);
console.log(`🔑 Target Password: ${'*'.repeat(password.length)} (${password})`);
console.log(`👤 Admin Name:      ${name}`);
console.log('----------------------------------------------------');

async function run() {
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const adminRecord = {
    id: `admin_${Buffer.from(email).toString('hex').slice(0, 16)}`,
    email,
    password_hash: passwordHash,
    name,
    role: 'admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const results = {
    localFile: false,
    mysql: false,
    mongodb: false
  };

  // 1. Save to local data/saved_admins.json
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }

    let admins = [];
    if (fs.existsSync(LOCAL_ADMINS_FILE)) {
      try {
        const raw = fs.readFileSync(LOCAL_ADMINS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) admins = parsed;
      } catch (e) {
        admins = [];
      }
    }

    const existingIdx = admins.findIndex((a) => a.email && a.email.toLowerCase() === email);
    if (existingIdx >= 0) {
      admins[existingIdx] = {
        ...admins[existingIdx],
        ...adminRecord,
        updated_at: new Date().toISOString()
      };
    } else {
      admins.push(adminRecord);
    }

    fs.writeFileSync(LOCAL_ADMINS_FILE, JSON.stringify(admins, null, 2), 'utf-8');
    results.localFile = true;
    console.log(`✅ [Local Store] Saved admin to ${LOCAL_ADMINS_FILE}`);
  } catch (err) {
    console.error(`❌ [Local Store] Failed to save local file: ${err.message}`);
  }

  // 2. Save to MySQL if configured
  const hasMySQL =
    process.env.MYSQL_URL ||
    process.env.DATABASE_URL ||
    (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER);

  if (hasMySQL) {
    try {
      const mysqlModule = await import('../api/db/mysql.js');
      const isConnected = await mysqlModule.initMySQL();

      if (isConnected && mysqlModule.isMySQLConnected()) {
        await mysqlModule.adminRepo.upsertAdmin({
          id: adminRecord.id,
          email: adminRecord.email,
          password_hash: adminRecord.password_hash,
          name: adminRecord.name,
          role: adminRecord.role
        });
        results.mysql = true;
        console.log(`✅ [MySQL Database] Successfully synced admin user to table 'admins'`);
      } else {
        console.log(`⚠️  [MySQL Database] MySQL credentials found but connection could not be established.`);
      }
    } catch (err) {
      console.warn(`⚠️  [MySQL Database] MySQL sync skipped: ${err.message}`);
    }
  } else {
    console.log(`ℹ️  [MySQL Database] No MySQL environment variables configured (Hostinger). Skipping.`);
  }

  // 3. Save to MongoDB if configured
  if (process.env.MONGODB_URI) {
    try {
      const mongoose = (await import('mongoose')).default;
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 4000 });

      const AdminSchema = new mongoose.Schema({
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password_hash: { type: String, required: true },
        name: { type: String, default: 'Admin' },
        role: { type: String, default: 'admin' },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
      });

      const MongoAdmin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

      await MongoAdmin.findOneAndUpdate(
        { email },
        {
          password_hash: passwordHash,
          name,
          role: 'admin',
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      results.mongodb = true;
      console.log(`✅ [MongoDB Atlas] Successfully synced admin user to collection 'admins'`);
      await mongoose.disconnect();
    } catch (err) {
      console.warn(`⚠️  [MongoDB Atlas] MongoDB sync skipped: ${err.message}`);
    }
  } else {
    console.log(`ℹ️  [MongoDB Atlas] No MONGODB_URI configured. Skipping.`);
  }

  console.log('----------------------------------------------------');
  console.log('🎉 SUCCESS: Admin account created / updated successfully!');
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('Fatal error creating admin:', err);
  process.exit(1);
});
