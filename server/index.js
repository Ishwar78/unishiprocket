// server/index.js
// server/index.js
const path = require('path');

// 1) Load root .env  => /www/wwwroot/.env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
// 2) Then load server/.env as fallback (yeh existing values override NAHI karega)
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ✅ add this right after the two dotenv.config(...) lines
const fs = require('fs');

function mask(v) {
  if (!v || v.length < 6) return v ? '***' : '(empty)';
  return v.slice(0, 4) + '***' + v.slice(-2);
}

const ROOT_ENV = path.join(__dirname, '..', '.env');
const SERVER_ENV = path.join(__dirname, '.env');

console.log('[ENV PATHS]', {
  ROOT_ENV,
  SERVER_ENV,
  rootExists: fs.existsSync(ROOT_ENV),
  serverExists: fs.existsSync(SERVER_ENV),
});

console.log(
  '[ENV CHECK]',
  'KEY_ID:', mask(process.env.RAZORPAY_KEY_ID || ''),
  'KEY_SECRET:', mask(process.env.RAZORPAY_KEY_SECRET || ''),
  'CURRENCY:', process.env.RAZORPAY_CURRENCY || '(empty)'
);

console.log('[CWD]', process.cwd());






const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');


const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const ordersRoutes = require('./routes/orders');
const categoriesRoutes = require('./routes/categories');
const wishlistRoutes = require('./routes/wishlist');
const reviewsRoutes = require('./routes/reviews');
const settingsRoutes = require('./routes/settings');
const uploadsRoutes = require('./routes/uploads');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const invoicesRoutes = require('./routes/invoices');
const inquiryRoutes = require('./routes/inquiry');
const couponsRoutes = require('./routes/coupons');
const paymentRoutes = require('./routes/payment');
const trackingRoutes = require('./routes/tracking');
const shippingRoutes = require('./routes/shipping');

const app = express();
const PORT = process.env.PORT || 5055;

/* --------------------------- LOG EACH REQUEST --------------------------- */
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

/* -------------------------------- CORS --------------------------------- */
/** STRICT allowlist — prod domains + local dev */
const ALLOWED_ORIGINS = new Set([
  'https://uni10.in',
  'https://www.uni10.in',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'https://ff8d2ba85401451bad453bb609262d07-vortex-hub.projects.builder.my',
]);

if (process.env.CLIENT_URL) ALLOWED_ORIGINS.add(process.env.CLIENT_URL);

app.use(
  cors({
    origin: function (origin, cb) {
      // Same-origin or server-to-server (no Origin header)
      if (!origin) return cb(null, true);

      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);

      // Allow any subdomain of uni10.in (future admin/app subdomains)
      // Also allow fly.dev domains for deployed apps
      try {
        const u = new URL(origin);
        if (u.hostname.endsWith('.uni10.in') || u.hostname.endsWith('.fly.dev')) return cb(null, true);
      } catch (_) {
        // ignore parse error
      }

      console.warn('Blocked CORS for origin:', origin);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
  })
);


/* ---------------------------- CORE MIDDLEWARES -------------------------- */
app.use(cookieParser());
app.use(express.json());

/* ------------------------- STATIC UPLOAD DIRECTORIES -------------------- */
// Serve uploaded files from server/uploads (same as multer destination)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Also expose uploads under /api/uploads for frontends that proxy only /api
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));
// Upload routes (POST for admin)
app.use('/api/uploads', uploadsRoutes);

/* ------------------------------- HEALTH -------------------------------- */
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, message: 'API running' })
);






// Debug env endpoint (masking enabled)
app.get('/api/_debug/env', (_req, res) => {
  const mask = (v) =>
    !v || v.length < 6 ? (v ? '***' : '(empty)') : v.slice(0, 4) + '***' + v.slice(-2);

  res.json({
    ok: true,
    data: {
      RZP_KEY_ID: mask(process.env.RAZORPAY_KEY_ID || ''),
      RZP_KEY_SECRET: mask(process.env.RAZORPAY_KEY_SECRET || ''),
      RZP_CURRENCY: process.env.RAZORPAY_CURRENCY || '(empty)',
      MONGODB_URI_EXISTS: !!process.env.MONGODB_URI,
    },
  });
});















/* -------------------------------- ROUTES -------------------------------- */
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/inquiry', inquiryRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/shipping', shippingRoutes);

/* ------------------------------ START APP ------------------------------- */
async function start() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn(
      'MONGODB_URI not set; starting server without DB connection. Some API routes may be unavailable.'
    );
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log('Static uploads available at /uploads and /api/uploads');
    });
    return;
  }

  try {
    await mongoose.connect(uri, { dbName: 'UNI10' });
    console.log('Connected to MongoDB (UNI10)');

    // Seed base users (idempotent)
    try {
      const User = require('./models/User');
      const bcrypt = require('bcrypt');

      const seeds = [
        { name: 'UNI10 Admin', email: 'uni10@gmail.com', password: '12345678', role: 'admin' },
        { name: 'Sachin', email: 'sachin@gmail.com', password: '123456', role: 'user' },
        // Add another seed only if you want this account available:
        // { name: 'Sachin T', email: 'sachintakoria2204@gmail.com', password: '12345678', role: 'user' },
      ];

      for (const s of seeds) {
        const email = s.email.toLowerCase();
        const existing = await User.findOne({ email });
        if (!existing) {
          const hash = await bcrypt.hash(s.password, 10);
          await User.create({
            name: s.name,
            email,
            passwordHash: hash,
            role: s.role,
          });
          console.log(`${s.role} user created: ${email}`);
        } else {
          // ensure role correct for admin
          if (s.role === 'admin' && existing.role !== 'admin') {
            existing.role = 'admin';
            await existing.save();
            console.log(`Existing user promoted to admin: ${email}`);
          } else {
            console.log(`${s.role} user already exists: ${email}`);
          }
        }
      }
    } catch (e) {
      console.error('Failed to seed users', e);
    }

    // Ensure default feature rows exist in home settings
    try {
      const SiteSetting = require('./models/SiteSetting');
      let settings = await SiteSetting.findOne();
      if (!settings) {
        settings = await SiteSetting.create({
          home: {
            featureRows: [
              { key: 'tshirts', title: 'T-SHIRTS', link: '/collection/t-shirts', imageAlt: 'T-Shirts Collection' },
              { key: 'denims', title: 'DENIMS', link: '/collection/denims', imageAlt: 'Denims Collection' },
              { key: 'hoodies', title: 'HOODIES', link: '/collection/hoodies', imageAlt: 'Hoodies Collection' },
            ],
          },
        });
        console.log('Default feature rows created in home settings');
      } else if (!settings.home || !settings.home.featureRows || settings.home.featureRows.length === 0) {
        settings.home = settings.home || {};
        settings.home.featureRows = [
          { key: 'tshirts', title: 'T-SHIRTS', link: '/collection/t-shirts', imageAlt: 'T-Shirts Collection' },
          { key: 'denims', title: 'DENIMS', link: '/collection/denims', imageAlt: 'Denims Collection' },
          { key: 'hoodies', title: 'HOODIES', link: '/collection/hoodies', imageAlt: 'Hoodies Collection' },
        ];
        await settings.save();
        console.log('Default feature rows added to existing home settings');
      }
    } catch (e) {
      console.error('Failed to seed feature rows', e);
    }

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log('Static uploads available at /uploads and /api/uploads');
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT} (without DB)`);
      console.log('Static uploads available at /uploads and /api/uploads');
    });
  }
}

start();
