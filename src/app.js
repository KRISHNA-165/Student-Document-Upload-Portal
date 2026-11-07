const express = require('express');
const path = require('path');
const { authMiddleware } = require('./middleware/authMiddleware');
const documentRoutes = require('./routes/documentRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const auditRoutes = require('./routes/auditRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser helper (TC_40)
app.use((req, res, next) => {
  const cookieHeader = req.headers.cookie;
  req.cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(c => {
      const parts = c.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        try {
          req.cookies[key] = decodeURIComponent(val);
        } catch {
          req.cookies[key] = val;
        }
      }
    });
  }
  next();
});

// Cache control headers preventing exposure via browser history/back (TC_17)
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve frontend static assets
app.use(express.static(path.resolve(__dirname, '../public')));

// Authentication middleware applied to all API routes
app.use('/api', authMiddleware);

// API routes
app.use('/api/student', studentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/student/documents', documentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/reports', reportRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Fallback error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

module.exports = app;
