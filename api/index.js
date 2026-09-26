import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {
  initMySQL,
  isMySQLConnected,
  portfolioRepo,
  projectRepo,
  serviceRepo,
  bookingRepo,
  settingRepo,
  adminRepo
} from './db/mysql.js';

dotenv.config();

const app = express();

// ========================================================
// 1. SECURITY & CORS CONFIGURATION
// ========================================================
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5000', 'http://127.0.0.1:5000','http://localhost:5174', 'http://127.0.0.1:5174' ];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true
  })
);

// Standard security headers without breaking media embeds (YouTube, Vimeo, Google Drive)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========================================================
// 2. RATE LIMITERS
// ========================================================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 failed login attempts
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.'
  }
});

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // max 15 bookings per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many booking inquiries submitted. Please try again later.'
  }
});

// ========================================================
// 3. PERSISTENT STORAGE DIRECTORIES & STATIC UPLOADS
// ========================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LOCAL_DATA_DIR = path.join(ROOT_DIR, 'data');
const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, 'saved_portfolio.json');
const LOCAL_BOOKINGS_FILE = path.join(LOCAL_DATA_DIR, 'saved_bookings.json');
const LOCAL_ADMINS_FILE = path.join(LOCAL_DATA_DIR, 'saved_admins.json');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

function ensureDirectories() {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch (e) {}
}
ensureDirectories();

// Serve uploaded media statically
app.use('/uploads', express.static(UPLOADS_DIR));

function loadLocalFile(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {}
  return fallback;
}

function saveLocalFile(filePath, data) {
  try {
    ensureDirectories();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {}
}

// In-Memory / File Storage Fallback
let memoryPortfolioData = loadLocalFile(LOCAL_DATA_FILE, null);
let memoryPasscode = process.env.ADMIN_PASSCODE || 'kma2026';
let memoryBookings = loadLocalFile(LOCAL_BOOKINGS_FILE, []);

function getMemoryPortfolio() {
  if (!memoryPortfolioData || typeof memoryPortfolioData !== 'object') {
    memoryPortfolioData = {
      profile: {},
      projects: [],
      practiceAreas: [],
      services: [],
      milestones: [],
      partners: [],
      skills: []
    };
  }
  if (!Array.isArray(memoryPortfolioData.projects)) {
    memoryPortfolioData.projects = [];
  }
  if (!Array.isArray(memoryPortfolioData.practiceAreas)) {
    memoryPortfolioData.practiceAreas = [];
  }
  if (!Array.isArray(memoryPortfolioData.services)) {
    memoryPortfolioData.services = memoryPortfolioData.practiceAreas;
  }
  return memoryPortfolioData;
}

// ========================================================
// 4. MONGODB MODELS & SETUP
// ========================================================
let isMongoConnected = false;

const PortfolioModel =
  mongoose.models.Portfolio ||
  mongoose.model(
    'Portfolio',
    new mongoose.Schema({
      docId: { type: String, default: 'kma_portfolio_main', unique: true },
      data: { type: Object, required: true },
      updatedAt: { type: Date, default: Date.now }
    })
  );

const ProjectModel =
  mongoose.models.Project ||
  mongoose.model(
    'Project',
    new mongoose.Schema({
      id: { type: String, required: true, unique: true },
      title: { type: String, required: true },
      category: { type: String, default: 'weddings' },
      categoryLabel: { type: String, default: 'Cinematic Showcase' },
      client: { type: String, default: '' },
      location: { type: String, default: '' },
      year: { type: String, default: '' },
      date: { type: String, default: '' },
      value: { type: String, default: '' },
      description: { type: String, default: '' },
      outcome: { type: String, default: '' },
      techStack: { type: [String], default: [] },
      liveUrl: { type: String, default: '' },
      githubUrl: { type: String, default: '' },
      status: { type: String, default: 'published' },
      isFeatured: { type: Boolean, default: false },
      coverMediaId: { type: String, default: '' },
      imageUrl: { type: String, default: '' },
      videoUrl: { type: String, default: '' },
      media: {
        type: [
          {
            id: String,
            type: { type: String, enum: ['image', 'video'], default: 'image' },
            url: String,
            thumbnailUrl: String,
            title: String,
            sortOrder: Number,
            createdAt: String
          }
        ],
        default: []
      },
      createdAt: { type: String, default: () => new Date().toISOString() },
      updatedAt: { type: String, default: () => new Date().toISOString() }
    })
  );

const BookingModel =
  mongoose.models.Booking ||
  mongoose.model(
    'Booking',
    new mongoose.Schema({
      id: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      eventType: { type: String, default: 'wedding' },
      eventDate: { type: String, default: '' },
      location: { type: String, default: '' },
      message: { type: String, default: '' },
      status: { type: String, default: 'new' },
      createdAt: { type: String, default: () => new Date().toISOString() },
      updatedAt: { type: String, default: () => new Date().toISOString() }
    })
  );

const SettingsModel =
  mongoose.models.Settings ||
  mongoose.model(
    'Settings',
    new mongoose.Schema({
      key: { type: String, required: true, unique: true },
      value: { type: String, required: true }
    })
  );

const AdminModel =
  mongoose.models.Admin ||
  mongoose.model(
    'Admin',
    new mongoose.Schema({
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      password_hash: { type: String, required: true },
      name: { type: String, default: 'Admin' },
      role: { type: String, default: 'admin' },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    })
  );

async function initDB() {
  if (isMongoConnected) return true;
  if (!process.env.MONGODB_URI) return false;

  try {
    if (mongoose.connection.readyState === 1) {
      isMongoConnected = true;
      return true;
    }
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 4000
    });
    isMongoConnected = true;
    console.log('[Backend] Connected to MongoDB Atlas successfully.');
    return true;
  } catch (err) {
    console.warn('[Backend] MongoDB connection skipped/failed:', err.message);
    isMongoConnected = false;
    return false;
  }
}

// Middleware to ensure DB connection attempt
app.use(async (req, res, next) => {
  await Promise.allSettled([initMySQL(), initDB()]);
  next();
});

// ========================================================
// 5. SESSION & AUTHENTICATION MECHANISM
// ========================================================
const COOKIE_NAME = 'kma_admin_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'kma-secure-session-salt-2026';
const activeSessions = new Map(); // sessionId -> { createdAt, expiresAt, user }

function createSessionToken(user = { email: 'admin@kma.com', name: 'Admin', role: 'admin' }) {
  const sessionId = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const payload = `${sessionId}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  const token = `${payload}.${signature}`;

  activeSessions.set(sessionId, { createdAt: Date.now(), expiresAt, user });
  return { token, sessionId, expiresAt };
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [sessionId, expiresAtStr, signature] = parts;
  const payload = `${sessionId}.${expiresAtStr}`;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

  if (signature !== expectedSig) return false;

  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    activeSessions.delete(sessionId);
    return false;
  }

  const session = activeSessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    return false;
  }

  return true;
}

function getSessionUser(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const sessionId = parts[0];
  const session = activeSessions.get(sessionId);
  return session ? session.user : null;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 24 * 60 * 60 * 1000,
  path: '/'
};

// Verify Admin Email & Password
async function verifyAdminCredentials(email, password) {
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return null;
  }
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check MySQL Admins Table
  if (isMySQLConnected()) {
    try {
      const row = await adminRepo.findByEmail(cleanEmail);
      if (row && row.password_hash) {
        const matches = await bcrypt.compare(password, row.password_hash);
        if (matches) {
          return { id: row.id, email: row.email, name: row.name || 'Admin', role: row.role || 'admin' };
        }
      }
    } catch (e) {
      console.warn('[Backend] MySQL admin check error:', e.message);
    }
  }

  // 2. Check MongoDB Admins Collection
  if (isMongoConnected) {
    try {
      const doc = await AdminModel.findOne({ email: cleanEmail });
      if (doc && doc.password_hash) {
        const matches = await bcrypt.compare(password, doc.password_hash);
        if (matches) {
          return { id: doc._id, email: doc.email, name: doc.name || 'Admin', role: doc.role || 'admin' };
        }
      }
    } catch (e) {
      console.warn('[Backend] MongoDB admin check error:', e.message);
    }
  }

  // 3. Check Local File Admins (data/saved_admins.json) — READ-ONLY fallback
  let admins = loadLocalFile(LOCAL_ADMINS_FILE, null);
  if (Array.isArray(admins)) {
    const admin = admins.find((a) => a.email && a.email.toLowerCase() === cleanEmail);
    if (admin) {
      if (admin.password_hash) {
        const matches = await bcrypt.compare(password, admin.password_hash);
        if (matches) {
          return { id: admin.id, email: admin.email, name: admin.name || 'Admin', role: admin.role || 'admin' };
        }
      } else if (admin.password && admin.password === password) {
        // Upgrade plaintext → hash in MySQL only; do NOT write back to JSON file
        const hash = await bcrypt.hash(password, 10);
        if (isMySQLConnected()) {
          try { await adminRepo.updatePassword(admin.email, hash); } catch (e) {}
        }
        return { id: admin.id, email: admin.email, name: admin.name || 'Admin', role: admin.role || 'admin' };
      }
    }
  }

  // 4. Default Admin Fallback (admin@kma.com / kma2026 or ADMIN_PASSWORD)
  if (cleanEmail === 'admin@kma.com') {
    const defaultPass = process.env.ADMIN_PASSWORD || 'kma2026';
    if (password === defaultPass) {
      const hash = await bcrypt.hash(defaultPass, 10);
      const defaultAdmin = {
        id: 'admin_default',
        email: 'admin@kma.com',
        password_hash: hash,
        name: 'KMA Admin',
        role: 'admin'
      };

      // Persist to MySQL only — no JSON file write
      if (isMySQLConnected()) {
        try {
          await adminRepo.upsertAdmin(defaultAdmin);
        } catch (e) {}
      }

      return { id: defaultAdmin.id, email: defaultAdmin.email, name: defaultAdmin.name, role: defaultAdmin.role };
    }
  }

  return null;
}

async function verifyAdminPasscode(inputPasscode) {
  if (!inputPasscode || typeof inputPasscode !== 'string') return false;

  // 1. Check environment variable hash if set
  if (process.env.ADMIN_PASSWORD_HASH) {
    return bcrypt.compare(inputPasscode, process.env.ADMIN_PASSWORD_HASH);
  }

  // 2. Check MySQL settings if connected
  if (isMySQLConnected()) {
    try {
      const mysqlPasscode = await settingRepo.get('admin_passcode');
      if (mysqlPasscode) {
        if (mysqlPasscode.startsWith('$2a$') || mysqlPasscode.startsWith('$2b$')) {
          return bcrypt.compare(inputPasscode, mysqlPasscode);
        }
        if (inputPasscode === mysqlPasscode) {
          const hash = await bcrypt.hash(inputPasscode, 10);
          await settingRepo.set('admin_passcode', hash);
          return true;
        }
        return false;
      }
    } catch (e) {
      console.warn('[Backend] MySQL passcode check error:', e.message);
    }
  }

  // 3. Check MongoDB settings if connected
  if (isMongoConnected) {
    const setting = await SettingsModel.findOne({ key: 'admin_passcode' });
    if (setting && setting.value) {
      if (setting.value.startsWith('$2a$') || setting.value.startsWith('$2b$')) {
        return bcrypt.compare(inputPasscode, setting.value);
      }
      if (inputPasscode === setting.value) {
        const hash = await bcrypt.hash(inputPasscode, 10);
        await SettingsModel.findOneAndUpdate({ key: 'admin_passcode' }, { value: hash });
        return true;
      }
      return false;
    }
  }

  // 4. Fallback to memoryPasscode / process.env.ADMIN_PASSCODE / default kma2026
  const expected = process.env.ADMIN_PASSCODE || memoryPasscode || 'kma2026';
  if (expected.startsWith('$2a$') || expected.startsWith('$2b$')) {
    return bcrypt.compare(inputPasscode, expected);
  }
  return inputPasscode === expected;
}

// Server-side Authorization Middleware
function requireAdminAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || !verifySessionToken(token)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Valid Admin session required.'
    });
  }
  next();
}

// ========================================================
// 6. MEDIA UPLOAD (MULTER CONFIGURATION)
// ========================================================
const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime'
];

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `kma-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Allowed: JPG, PNG, WebP, GIF, MP4, WebM, MOV.'));
    }
  }
});

// POST /api/media/upload -> Upload media item (Requires Admin Auth)
app.post('/api/media/upload', requireAdminAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const isVideo = req.file.mimetype.startsWith('video/');

    return res.status(201).json({
      success: true,
      url: fileUrl,
      type: isVideo ? 'video' : 'image',
      filename: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
      message: 'Media uploaded successfully.'
    });
  });
});

// ========================================================
// 7. HEALTH CHECK ROUTE (PUBLIC)
// ========================================================
app.get('/api/health', (req, res) => {
  const mysqlUp = isMySQLConnected();
  const mongoUp = isMongoConnected;
  let mode = 'memory-store';
  if (mysqlUp) mode = 'mysql';
  else if (mongoUp) mode = 'mongodb-atlas';

  res.json({
    status: 'online',
    appName: 'KMA Wedding & Media Production API',
    mode,
    database: {
      mysql: mysqlUp,
      mongodb: mongoUp
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ========================================================
// 8. ADMIN AUTHENTICATION ROUTES
// ========================================================
// POST /api/auth/login (Rate limited)
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, passcode } = req.body;

    let adminUser = null;

    if (email && password) {
      adminUser = await verifyAdminCredentials(email, password);
    } else if (passcode) {
      // Legacy passcode fallback
      const isPasscodeValid = await verifyAdminPasscode(passcode);
      if (isPasscodeValid) {
        adminUser = { email: 'admin@kma.com', name: 'Admin', role: 'admin' };
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    if (!adminUser) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        message: 'Invalid email or password.'
      });
    }

    const { token } = createSessionToken(adminUser);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    return res.json({
      success: true,
      authenticated: true,
      user: adminUser,
      message: 'Admin authenticated successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me -> Verify active session state (PUBLIC CHECK)
app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  const isValid = verifySessionToken(token);
  const user = isValid ? getSessionUser(token) : null;
  return res.json({
    success: true,
    authenticated: isValid,
    user: user || (isValid ? { email: 'admin@kma.com', name: 'Admin', role: 'admin' } : null)
  });
});

// POST /api/auth/logout -> Invalidate active session & clear cookie
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    const [sessionId] = token.split('.');
    if (sessionId) activeSessions.delete(sessionId);
  }
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// POST /api/auth/change-password (Requires Admin Auth)
app.post('/api/auth/change-password', requireAdminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, email } = req.body;
    const targetEmail = (email).trim().toLowerCase();

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'New password must be at least 4 characters.' });
    }

    if (currentPassword) {
      const verified = await verifyAdminCredentials(targetEmail, currentPassword);
      if (!verified) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    // 1. MySQL
    if (isMySQLConnected()) {
      await adminRepo.updatePassword(targetEmail, hashed);
    }

    // 2. MongoDB
    if (isMongoConnected) {
      await AdminModel.findOneAndUpdate(
        { email: targetEmail },
        { password_hash: hashed, updatedAt: new Date() },
        { upsert: true }
      );
    }

    // JSON file writes removed — MySQL is the sole persistence layer for passwords

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/change-passcode (Requires Admin Auth - Backward Compatibility)
app.post('/api/auth/change-passcode', requireAdminAuth, async (req, res) => {
  try {
    const { currentPasscode, newPasscode } = req.body;
    const isValid = await verifyAdminPasscode(currentPasscode);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Current passcode is incorrect.' });
    }

    if (!newPasscode || newPasscode.length < 4) {
      return res.status(400).json({ success: false, message: 'New passcode must be at least 4 chars.' });
    }

    const hashed = await bcrypt.hash(newPasscode, 10);
    memoryPasscode = hashed;

    if (isMySQLConnected()) {
      await settingRepo.set('admin_passcode', hashed);
    }

    if (isMongoConnected) {
      await SettingsModel.findOneAndUpdate(
        { key: 'admin_passcode' },
        { value: hashed },
        { upsert: true }
      );
    }

    return res.json({ success: true, message: 'Passcode changed and hashed securely.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================================
// 9. MONOLITHIC PORTFOLIO DATA ROUTES
// ========================================================
// GET /api/data -> Get current portfolio content (PUBLIC)
app.get('/api/data', async (req, res) => {
  try {
    if (isMySQLConnected()) {
      const data = await portfolioRepo.get('kma_portfolio_main');
      if (data && typeof data === 'object') {
        return res.json({ success: true, data, source: 'mysql' });
      }
    }
    if (isMongoConnected) {
      const doc = await PortfolioModel.findOne({ docId: 'kma_portfolio_main' });
      if (doc && doc.data) {
        return res.json({ success: true, data: doc.data, source: 'mongodb' });
      }
    }
    return res.json({
      success: true,
      data: getMemoryPortfolio(),
      source: 'memory'
    });
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/data -> Save full portfolio content (REQUIRES ADMIN AUTH)
app.post('/api/data', requireAdminAuth, async (req, res) => {
  try {
    const incomingData = req.body;
    if (!incomingData || typeof incomingData !== 'object' || !incomingData.profile) {
      return res.status(400).json({ success: false, message: 'Invalid portfolio data payload.' });
    }

    // Update memory cache only (no JSON file write — MySQL is source of truth)
    memoryPortfolioData = incomingData;

    if (isMySQLConnected()) {
      await portfolioRepo.save('kma_portfolio_main', incomingData);
    }

    if (isMongoConnected) {
      await PortfolioModel.findOneAndUpdate(
        { docId: 'kma_portfolio_main' },
        { data: incomingData, updatedAt: new Date() },
        { upsert: true, new: true }
      );
    }

    let source = 'file-memory';
    if (isMySQLConnected()) source = 'mysql';
    else if (isMongoConnected) source = 'mongodb';

    return res.json({
      success: true,
      message: 'Portfolio data updated successfully.',
      source,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error saving data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================================
// 10. GRANULAR PROJECTS REST API
// ========================================================
// GET /api/projects -> List all projects (PUBLIC)
app.get('/api/projects', async (req, res) => {
  try {
    if (isMySQLConnected()) {
      const list = await projectRepo.listAll();
      if (list && list.length > 0) {
        return res.json({ success: true, count: list.length, data: list, source: 'mysql' });
      }
    }
    if (isMongoConnected) {
      const docs = await ProjectModel.find({}).sort({ updatedAt: -1 });
      if (docs && docs.length > 0) {
        return res.json({ success: true, count: docs.length, data: docs, source: 'mongodb' });
      }
    }
    const portfolio = getMemoryPortfolio();
    return res.json({
      success: true,
      count: portfolio.projects.length,
      data: portfolio.projects,
      source: 'file-memory'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/projects/:id -> Get single project (PUBLIC)
app.get('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isMySQLConnected()) {
      const doc = await projectRepo.getById(id);
      if (doc) return res.json({ success: true, data: doc });
    }
    if (isMongoConnected) {
      const doc = await ProjectModel.findOne({ id });
      if (doc) return res.json({ success: true, data: doc });
    }
    const portfolio = getMemoryPortfolio();
    const found = portfolio.projects.find((p) => p.id === id);
    if (!found) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    return res.json({ success: true, data: found });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects -> Create new project (REQUIRES ADMIN AUTH)
app.post('/api/projects', requireAdminAuth, async (req, res) => {
  try {
    const raw = req.body;
    if (!raw || !raw.title || typeof raw.title !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid project title is required.' });
    }

    const now = new Date().toISOString();
    const project = {
      ...raw,
      title: raw.title.trim(),
      category: raw.category || 'weddings',
      status: raw.status === 'draft' ? 'draft' : 'published',
      isFeatured: !!raw.isFeatured,
      media: Array.isArray(raw.media) ? raw.media : [],
      coverMediaId: raw.coverMediaId || '',
      id: raw.id || `proj-${Date.now()}`,
      createdAt: raw.createdAt || now,
      updatedAt: now
    };

    // Persist to MySQL; keep memory cache consistent but don't write to JSON
    const portfolio = getMemoryPortfolio();
    portfolio.projects = [project, ...portfolio.projects.filter((p) => p.id !== project.id)];

    if (isMySQLConnected()) {
      await projectRepo.create(project);
      await portfolioRepo.save('kma_portfolio_main', portfolio);
    }

    if (isMongoConnected) {
      await ProjectModel.findOneAndUpdate({ id: project.id }, project, { upsert: true, new: true });
      await PortfolioModel.findOneAndUpdate(
        { docId: 'kma_portfolio_main' },
        { data: portfolio, updatedAt: new Date() },
        { upsert: true }
      );
    }

    return res.status(201).json({
      success: true,
      data: project,
      message: 'Project created successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/projects/:id -> Update project (REQUIRES ADMIN AUTH)
app.put('/api/projects/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload.' });
    }

    // For memory fallback only; primary write goes to MySQL
    const portfolio = getMemoryPortfolio();
    const existingIdx = portfolio.projects.findIndex((p) => p.id === id);
    const existing = existingIdx >= 0 ? portfolio.projects[existingIdx] : {};

    const updated = {
      ...existing,
      ...updates,
      id,
      updatedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      portfolio.projects[existingIdx] = updated;
    } else {
      portfolio.projects.push(updated);
    }

    if (isMySQLConnected()) {
      await projectRepo.update(id, updated);
      await portfolioRepo.save('kma_portfolio_main', portfolio);
    }

    if (isMongoConnected) {
      await ProjectModel.findOneAndUpdate({ id }, updated, { upsert: true, new: true });
      await PortfolioModel.findOneAndUpdate(
        { docId: 'kma_portfolio_main' },
        { data: portfolio, updatedAt: new Date() },
        { upsert: true }
      );
    }

    return res.json({
      success: true,
      data: updated,
      message: 'Project updated successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/projects/:id -> Delete project (REQUIRES ADMIN AUTH)
app.delete('/api/projects/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // Sync memory cache; MySQL handles permanent deletion
    const portfolio = getMemoryPortfolio();
    portfolio.projects = portfolio.projects.filter((p) => p.id !== id);

    if (isMySQLConnected()) {
      await projectRepo.delete(id);
      await portfolioRepo.save('kma_portfolio_main', portfolio);
    }

    if (isMongoConnected) {
      await ProjectModel.deleteOne({ id });
      await PortfolioModel.findOneAndUpdate(
        { docId: 'kma_portfolio_main' },
        { data: portfolio, updatedAt: new Date() },
        { upsert: true }
      );
    }

    return res.json({ success: true, message: 'Project deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================================
// 11. GRANULAR SERVICES & PACKAGES REST API
// ========================================================
// GET /api/services -> List all services (PUBLIC)
app.get('/api/services', async (req, res) => {
  try {
    if (isMySQLConnected()) {
      const dbServices = await serviceRepo.listAll();
      if (dbServices && dbServices.length > 0) {
        return res.json({ success: true, count: dbServices.length, data: dbServices, source: 'mysql' });
      }
    }
    const portfolio = getMemoryPortfolio();
    const services = portfolio.services || portfolio.practiceAreas || [];
    return res.json({ success: true, count: services.length, data: services });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/services -> Add service (REQUIRES ADMIN AUTH)
app.post('/api/services', requireAdminAuth, async (req, res) => {
  try {
    const raw = req.body;
    if (!raw || !raw.title || typeof raw.title !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid service title is required.' });
    }

    const now = new Date().toISOString();
    const newService = {
      ...raw,
      title: raw.title.trim(),
      id: raw.id || `service-${Date.now()}`,
      createdAt: raw.createdAt || now,
      updatedAt: now
    };

    // Sync memory cache; MySQL handles persistence
    const portfolio = getMemoryPortfolio();
    const currentServices = portfolio.services || portfolio.practiceAreas || [];
    const updatedServices = [...currentServices, newService];
    portfolio.services = updatedServices;
    portfolio.practiceAreas = updatedServices;

    if (isMySQLConnected()) {
      await serviceRepo.create(newService);
      await portfolioRepo.save('kma_portfolio_main', portfolio);
    }

    if (isMongoConnected) {
      await PortfolioModel.findOneAndUpdate(
        { docId: 'kma_portfolio_main' },
        { data: portfolio, updatedAt: new Date() },
        { upsert: true }
      );
    }

    return res.status(201).json({
      success: true,
      data: newService,
      message: 'Service package created successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/services/:id -> Update service (REQUIRES ADMIN AUTH)
app.put('/api/services/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    // Sync memory cache; MySQL handles persistence
    const portfolio = getMemoryPortfolio();
    const currentServices = portfolio.services || portfolio.practiceAreas || [];

    const updatedServices = currentServices.map((s) =>
      s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
    );
    portfolio.services = updatedServices;
    portfolio.practiceAreas = updatedServices;

    if (isMySQLConnected()) {
      await serviceRepo.update(id, updates);
      await portfolioRepo.save('kma_portfolio_main', portfolio);
    }

    if (isMongoConnected) {
      await PortfolioModel.findOneAndUpdate(
        { docId: 'kma_portfolio_main' },
        { data: portfolio, updatedAt: new Date() },
        { upsert: true }
      );
    }

    return res.json({ success: true, message: 'Service package updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/services/:id -> Delete service (REQUIRES ADMIN AUTH)
app.delete('/api/services/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // Sync memory cache; MySQL handles permanent deletion
    const portfolio = getMemoryPortfolio();
    const currentServices = portfolio.services || portfolio.practiceAreas || [];
    const updatedServices = currentServices.filter((s) => s.id !== id);
    portfolio.services = updatedServices;
    portfolio.practiceAreas = updatedServices;

    if (isMySQLConnected()) {
      await serviceRepo.delete(id);
      await portfolioRepo.save('kma_portfolio_main', portfolio);
    }

    if (isMongoConnected) {
      await PortfolioModel.findOneAndUpdate(
        { docId: 'kma_portfolio_main' },
        { data: portfolio, updatedAt: new Date() },
        { upsert: true }
      );
    }

    return res.json({ success: true, message: 'Service package deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================================
// 12. EVENT BOOKINGS ROUTES
// ========================================================
// GET /api/bookings -> Get all visitor bookings (REQUIRES ADMIN AUTH)
app.get('/api/bookings', requireAdminAuth, async (req, res) => {
  try {
    if (isMySQLConnected()) {
      const list = await bookingRepo.listAll();
      return res.json({ success: true, bookings: list, source: 'mysql' });
    }
    if (isMongoConnected) {
      const list = await BookingModel.find({}).sort({ createdAt: -1 });
      return res.json({ success: true, bookings: list, source: 'mongodb' });
    }
    return res.json({ success: true, bookings: memoryBookings, source: 'file-memory' });
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bookings -> Submit new inquiry (PUBLIC with Rate Limiting & Validation)
app.post('/api/bookings', bookingLimiter, async (req, res) => {
  try {
    const { name, phone, email, eventType, eventDate, location, message } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Your name is required.' });
    }
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const now = new Date().toISOString();
    const newBooking = {
      id: `book-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      name: name.trim().slice(0, 100),
      phone: phone.trim().slice(0, 50),
      email: (email || '').trim().slice(0, 100),
      eventType: (eventType || 'wedding').slice(0, 50),
      eventDate: (eventDate || '').slice(0, 50),
      location: (location || '').trim().slice(0, 150),
      message: (message || '').trim().slice(0, 2000),
      status: 'new',
      createdAt: now,
      updatedAt: now
    };

    // Sync memory cache; MySQL handles persistence
    memoryBookings = [newBooking, ...memoryBookings];

    if (isMySQLConnected()) {
      await bookingRepo.create(newBooking);
    }

    if (isMongoConnected) {
      await BookingModel.create(newBooking);
    }

    return res.status(201).json({
      success: true,
      booking: newBooking,
      message: 'Booking inquiry submitted successfully.'
    });
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/bookings/:id/status -> Update status (REQUIRES ADMIN AUTH)
app.patch('/api/bookings/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['new', 'contacted', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid booking status.' });
    }

    const now = new Date().toISOString();
    // Sync memory cache; MySQL handles persistence
    memoryBookings = memoryBookings.map((b) =>
      b.id === id ? { ...b, status, updatedAt: now } : b
    );

    if (isMySQLConnected()) {
      await bookingRepo.updateStatus(id, status);
    }

    if (isMongoConnected) {
      await BookingModel.findOneAndUpdate({ id }, { status, updatedAt: now });
    }

    return res.json({ success: true, message: 'Booking status updated.' });
  } catch (err) {
    console.error('Error updating booking:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/bookings/:id -> Backward-compatible status updater (REQUIRES ADMIN AUTH)
app.patch('/api/bookings/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const now = new Date().toISOString();

    // Sync memory cache; MySQL handles persistence
    memoryBookings = memoryBookings.map((b) =>
      b.id === id ? { ...b, status, updatedAt: now } : b
    );

    if (isMySQLConnected()) {
      await bookingRepo.updateStatus(id, status);
    }

    if (isMongoConnected) {
      await BookingModel.findOneAndUpdate({ id }, { status, updatedAt: now });
    }

    return res.json({ success: true, message: 'Booking updated.' });
  } catch (err) {
    console.error('Error updating booking:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/bookings/:id -> Remove booking (REQUIRES ADMIN AUTH)
app.delete('/api/bookings/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // Sync memory cache; MySQL handles permanent deletion
    memoryBookings = memoryBookings.filter((b) => b.id !== id);

    if (isMySQLConnected()) {
      await bookingRepo.delete(id);
    }

    if (isMongoConnected) {
      await BookingModel.deleteOne({ id });
    }

    return res.json({ success: true, message: 'Booking inquiry deleted.' });
  } catch (err) {
    console.error('Error deleting booking:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export default for Vercel Serverless Function & Node server
export default app;
