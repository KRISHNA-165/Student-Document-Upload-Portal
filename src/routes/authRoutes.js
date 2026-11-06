const express = require('express');
const db = require('../database/db');
const authService = require('../services/authService');
const { getSessionUser, setSessionUser, requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * POST /api/auth/login
 * US06: Validate registered credentials, return session token & user profile
 */
router.post('/login', async (req, res) => {
  try {
    const { username, email, identifier, password, role } = req.body;
    const loginId = identifier || username || email;

    if (!loginId || !String(loginId).trim() || !password || !String(password).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Username/email and password are required'
      });
    }

    const result = await authService.login(loginId, password, role || null);

    // Also update current active session user for seamless dev switching
    setSessionUser(result.user.id);

    return res.status(200).json({
      success: true,
      message: 'Login successful. Redirecting to Student Dashboard...',
      token: result.token,
      session: result.session,
      user: result.user
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Login failed'
    });
  }
});

/**
 * POST /api/auth/logout
 * US06: Terminate active session
 */
router.post('/logout', (req, res) => {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'];
  } else if (req.token) {
    token = req.token;
  }

  if (token) {
    authService.terminateSession(token);
  }

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * GET /api/auth/me
 * US06: Get currently authenticated user and session validity
 */
router.get('/me', (req, res) => {
  if (req.sessionExpired) {
    return res.status(401).json({
      success: false,
      message: 'Session expired due to inactivity. Please log in again.',
      code: 'SESSION_EXPIRED'
    });
  }

  if (!req.user || req.sessionInvalid) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. No active session.',
      code: 'UNAUTHORIZED'
    });
  }

  return res.json({
    success: true,
    user: req.user,
    session: req.session || null
  });
});

/**
 * GET /api/auth/users
 * Demo/testing persona list
 */
router.get('/users', (req, res) => {
  return res.json({
    success: true,
    users: db.getAllUsers().map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
      assignedFacultyAdvisorName: u.assignedFacultyAdvisorName
    }))
  });
});

/**
 * POST /api/auth/switch-user
 * Quick persona switch for development
 */
router.post('/switch-user', (req, res) => {
  const { userId } = req.body;
  const user = setSessionUser(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: `User '${userId}' not found`
    });
  }

  // Create an active session for the switched user
  const session = authService.createSession(user.id);

  return res.json({
    success: true,
    message: `Switched session to ${user.name} (${user.role})`,
    user,
    token: session.token,
    session
  });
});

module.exports = router;
