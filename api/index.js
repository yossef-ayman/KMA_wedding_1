import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'fs';
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
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:5000',
      'http://127.0.0.1:5000'
    ];

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
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many booking inquiries submitted. Please try again later.' }
});

// ========================================================
// 3. STATIC UPLOADS DIRECTORY (media files only — no JSON data)
// ========================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded media statically
app.use('/uploads', express.static(UPLOADS_DIR));

// ========================================================
// 4. MYSQL — SINGLE SOURCE OF TRUTH
// Middleware ensures MySQL connection is attempted on every request.
// ========================================================
app.use(async (req, res, next) => {
  await initMySQL();
  next();
});

/**
 * Returns 503 JSON if MySQL is not connected.
 * Use inside route handlers that require database access.
 */
function requireMySQL(res) {
  if (!isMySQLConnected()) {
    res.status(503).json({
      success: false,
      error: 'Database unavailable. MySQL is not connected. Please check your server configuration.'
    });
    return false;
  }
  return true;
}

// ========================================================
// 5. SESSION & AUTHENTICATION MECHANISM
// ========================================================
const COOKIE_NAME = 'kma_admin_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'kma-secure-session-salt-2026';
const activeSessions = new Map(); // sessionId -> { createdAt, expiresAt, user }

function createSessionToken(user) {
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
  if (!session || session.expiresAt < Date.now()) return false;
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

// ── verifyAdminCredentials ───────────────────────────────────────────────────
// MySQL is the ONLY persistence layer. If MySQL is offline, returns null.
// Falls back to the hardcoded default admin only when MySQL has no record yet.
async function verifyAdminCredentials(email, password) {
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return null;
  }
  const cleanEmail = email.trim().toLowerCase();

  if (!isMySQLConnected()) {
    console.warn('[Auth] MySQL not connected — cannot verify credentials.');
    return null;
  }

  try {
    const row = await adminRepo.findByEmail(cleanEmail);
    if (row && row.password_hash) {
      const matches = await bcrypt.compare(password, row.password_hash);
      if (matches) {
        return { id: row.id, email: row.email, name: row.name || 'Admin', role: row.role || 'admin' };
      }
      return null; // wrong password — do NOT fall through to default
    }
  } catch (e) {
    console.error('[Auth] MySQL admin lookup error:', e.message);
    return null;
  }

  // No record in MySQL yet — check if this is the bootstrapped default admin
  const defaultPass = process.env.ADMIN_PASSWORD || 'kma2026';
  if (cleanEmail === 'admin@kma.com' && password === defaultPass) {
    const hash = await bcrypt.hash(defaultPass, 10);
    const defaultAdmin = {
      id: 'admin_default',
      email: 'admin@kma.com',
      password_hash: hash,
      name: 'KMA Admin',
      role: 'admin'
    };
    try {
      await adminRepo.upsertAdmin(defaultAdmin);
    } catch (e) {
      console.error('[Auth] Failed to persist default admin to MySQL:', e.message);
    }
    return { id: defaultAdmin.id, email: defaultAdmin.email, name: defaultAdmin.name, role: defaultAdmin.role };
  }

  return null;
}

// Server-side Authorization Middleware
function requireAdminAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || !verifySessionToken(token)) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Valid Admin session required.' });
  }
  next();
}

// ========================================================
// 6. MEDIA UPLOAD (MULTER CONFIGURATION)
// ========================================================
const allowedMimeTypes = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime'
];

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `kma-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Allowed: JPG, PNG, WebP, GIF, MP4, WebM, MOV.'));
    }
  }
});

// POST /api/media/upload
app.post('/api/media/upload', requireAdminAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

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
// 7. HEALTH CHECK (PUBLIC)
// ========================================================
app.get('/api/health', (req, res) => {
  const mysqlUp = isMySQLConnected();
  res.json({
    status: 'online',
    appName: 'KMA Wedding & Media Production API',
    mode: mysqlUp ? 'mysql' : 'degraded-no-db',
    database: { mysql: mysqlUp },
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ========================================================
// 8. ADMIN AUTHENTICATION ROUTES
// ========================================================

// POST /api/auth/login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    if (!isMySQLConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Database unavailable. Cannot authenticate at this time.'
      });
    }

    const adminUser = await verifyAdminCredentials(email, password);
    if (!adminUser) {
      return res.status(401).json({ success: false, authenticated: false, message: 'Invalid email or password.' });
    }

    const { token } = createSessionToken(adminUser);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    return res.json({ success: true, authenticated: true, user: adminUser, message: 'Admin authenticated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  const isValid = verifySessionToken(token);
  const user = isValid ? getSessionUser(token) : null;
  return res.json({ success: true, authenticated: isValid, user: user || null });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    const [sessionId] = token.split('.');
    if (sessionId) activeSessions.delete(sessionId);
  }
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', requireAdminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    const targetEmail = email.trim().toLowerCase();

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'New password must be at least 4 characters.' });
    }

    if (!requireMySQL(res)) return;

    if (currentPassword) {
      const verified = await verifyAdminCredentials(targetEmail, currentPassword);
      if (!verified) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await adminRepo.updatePassword(targetEmail, hashed);

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================================
// 9. PORTFOLIO DATA ROUTES
// ========================================================

// GET /api/data
app.get('/api/data', async (req, res) => {
  try {
    if (!requireMySQL(res)) return;
    const data = await portfolioRepo.get('kma_portfolio_main');
    if (data && typeof data === 'object') {
      return res.json({ success: true, data, source: 'mysql' });
    }
    // No data yet — return empty scaffold
    return res.json({
      success: true,
      data: { profile: {}, projects: [], services: [], practiceAreas: [], milestones: [], partners: [], skills: [] },
      source: 'mysql-empty'
    });
  } catch (err) {
    console.error('Error fetching portfolio data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/data
app.post('/api/data', requireAdminAuth, async (req, res) => {
  try {
    const incomingData = req.body;
    if (!incomingData || typeof incomingData !== 'object' || !incomingData.profile) {
      return res.status(400).json({ success: false, message: 'Invalid portfolio data payload.' });
    }

    if (!requireMySQL(res)) return;

    await portfolioRepo.save('kma_portfolio_main', incomingData);

    return res.json({
      success: true,
      message: 'Portfolio data updated successfully.',
      source: 'mysql',
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error saving portfolio data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================================
// 10. PROJECTS REST API
// ========================================================

// GET /api/projects
app.get('/api/projects', async (req, res) => {
  try {
    if (!requireMySQL(res)) return;
    const list = await projectRepo.listAll();
    return res.json({ success: true, count: list.length, data: list, source: 'mysql' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/projects/:id
app.get('/api/projects/:id', async (req, res) => {
  try {
    if (!requireMySQL(res)) return;
    const doc = await projectRepo.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Project not found.' });
    return res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects
app.post('/api/projects', requireAdminAuth, async (req, res) => {
  try {
    const raw = req.body;
    if (!raw || !raw.title || typeof raw.title !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid project title is required.' });
    }
    if (!requireMySQL(res)) return;

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

    await projectRepo.create(project);

    // Reflect in portfolio blob
    try {
      const portfolio = (await portfolioRepo.get('kma_portfolio_main')) || { profile: {}, projects: [], services: [], practiceAreas: [] };
      portfolio.projects = [project, ...(portfolio.projects || []).filter((p) => p.id !== project.id)];
      await portfolioRepo.save('kma_portfolio_main', portfolio);
    } catch (e) { /* non-fatal */ }

    return res.status(201).json({ success: true, data: project, message: 'Project created successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/projects/:id
app.put('/api/projects/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload.' });
    }
    if (!requireMySQL(res)) return;

    const existing = (await projectRepo.getById(id)) || {};
    const updated = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    await projectRepo.update(id, updated);

    // Reflect in portfolio blob
    try {
      const portfolio = (await portfolioRepo.get('kma_portfolio_main')) || { profile: {}, projects: [], services: [], practiceAreas: [] };
      const idx = (portfolio.projects || []).findIndex((p) => p.id === id);
      if (idx >= 0) portfolio.projects[idx] = updated;
      else portfolio.projects = [updated, ...(portfolio.projects || [])];
      await portfolioRepo.save('kma_portfolio_main', portfolio);
    } catch (e) { /* non-fatal */ }

    return res.json({ success: true, data: updated, message: 'Project updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/projects/:id
app.delete('/api/projects/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!requireMySQL(res)) return;

    await projectRepo.delete(id);

    // Reflect in portfolio blob
    try {
      const portfolio = await portfolioRepo.get('kma_portfolio_main');
      if (portfolio) {
        portfolio.projects = (portfolio.projects || []).filter((p) => p.id !== id);
        await portfolioRepo.save('kma_portfolio_main', portfolio);
      }
    } catch (e) { /* non-fatal */ }

    return res.json({ success: true, message: 'Project deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================================
// 11. SERVICES REST API
// ========================================================

// GET /api/services
app.get('/api/services', async (req, res) => {
  try {
    if (!requireMySQL(res)) return;
    const list = await serviceRepo.listAll();
    return res.json({ success: true, count: list.length, data: list, source: 'mysql' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/services
app.post('/api/services', requireAdminAuth, async (req, res) => {
  try {
    const raw = req.body;
    if (!raw || !raw.title || typeof raw.title !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid service title is required.' });
    }
    if (!requireMySQL(res)) return;

    const now = new Date().toISOString();
    const newService = {
      ...raw,
      title: raw.title.trim(),
      id: raw.id || `service-${Date.now()}`,
      createdAt: raw.createdAt || now,
      updatedAt: now
    };

    await serviceRepo.create(newService);

    // Reflect in portfolio blob
    try {
      const portfolio = (await portfolioRepo.get('kma_portfolio_main')) || { profile: {}, projects: [], services: [], practiceAreas: [] };
      const current = portfolio.services || portfolio.practiceAreas || [];
      portfolio.services = [...current, newService];
      portfolio.practiceAreas = portfolio.services;
      await portfolioRepo.save('kma_portfolio_main', portfolio);
    } catch (e) { /* non-fatal */ }

    return res.status(201).json({ success: true, data: newService, message: 'Service package created successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/services/:id
app.put('/api/services/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (!requireMySQL(res)) return;

    await serviceRepo.update(id, updates);

    // Reflect in portfolio blob
    try {
      const portfolio = await portfolioRepo.get('kma_portfolio_main');
      if (portfolio) {
        const current = portfolio.services || portfolio.practiceAreas || [];
        const updated = current.map((s) => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s);
        portfolio.services = updated;
        portfolio.practiceAreas = updated;
        await portfolioRepo.save('kma_portfolio_main', portfolio);
      }
    } catch (e) { /* non-fatal */ }

    return res.json({ success: true, message: 'Service package updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/services/:id
app.delete('/api/services/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!requireMySQL(res)) return;

    await serviceRepo.delete(id);

    // Reflect in portfolio blob
    try {
      const portfolio = await portfolioRepo.get('kma_portfolio_main');
      if (portfolio) {
        const current = portfolio.services || portfolio.practiceAreas || [];
        const updated = current.filter((s) => s.id !== id);
        portfolio.services = updated;
        portfolio.practiceAreas = updated;
        await portfolioRepo.save('kma_portfolio_main', portfolio);
      }
    } catch (e) { /* non-fatal */ }

    return res.json({ success: true, message: 'Service package deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================================
// 12. EVENT BOOKINGS ROUTES
// ========================================================

// GET /api/bookings
app.get('/api/bookings', requireAdminAuth, async (req, res) => {
  try {
    if (!requireMySQL(res)) return;
    const list = await bookingRepo.listAll();
    return res.json({ success: true, bookings: list, source: 'mysql' });
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bookings
app.post('/api/bookings', bookingLimiter, async (req, res) => {
  try {
    const { name, phone, email, eventType, eventDate, location, message } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Your name is required.' });
    }
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    if (!requireMySQL(res)) return;

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

    await bookingRepo.create(newBooking);
    return res.status(201).json({ success: true, booking: newBooking, message: 'Booking inquiry submitted successfully.' });
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/bookings/:id/status
app.patch('/api/bookings/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['new', 'contacted', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid booking status.' });
    }
    if (!requireMySQL(res)) return;

    await bookingRepo.updateStatus(id, status);
    return res.json({ success: true, message: 'Booking status updated.' });
  } catch (err) {
    console.error('Error updating booking status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/bookings/:id (backward-compatible)
app.patch('/api/bookings/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!requireMySQL(res)) return;

    await bookingRepo.updateStatus(id, status);
    return res.json({ success: true, message: 'Booking updated.' });
  } catch (err) {
    console.error('Error updating booking:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/bookings/:id
app.delete('/api/bookings/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!requireMySQL(res)) return;

    await bookingRepo.delete(id);
    return res.json({ success: true, message: 'Booking inquiry deleted.' });
  } catch (err) {
    console.error('Error deleting booking:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================================
// 13. SETTINGS ROUTES
// ========================================================

// GET /api/settings/:key
app.get('/api/settings/:key', requireAdminAuth, async (req, res) => {
  try {
    if (!requireMySQL(res)) return;
    const value = await settingRepo.get(req.params.key);
    return res.json({ success: true, key: req.params.key, value: value ?? null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings/:key
app.put('/api/settings/:key', requireAdminAuth, async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, message: 'value is required.' });
    }
    if (!requireMySQL(res)) return;
    await settingRepo.set(req.params.key, String(value));
    return res.json({ success: true, message: 'Setting updated.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export default for Vercel Serverless Function & Node server
export default app;
