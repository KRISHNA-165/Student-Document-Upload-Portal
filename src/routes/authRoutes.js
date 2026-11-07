const express = require('express');
const db = require('../database/db');
const authService = require('../services/authService');
const { getSessionUser, setSessionUser, requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

function isHttpsRequest(req) {
  try {
    return Boolean(
      (req.socket && req.socket.encrypted) ||
      (req.connection && req.connection.encrypted) ||
      (req.headers && req.headers['x-forwarded-proto'] === 'https') ||
      process.env.NODE_ENV === 'production'
    );
  } catch {
    return false;
  }
}

// Allow test hook for simulating auth service outage (TC_33, TC_34)
let simulateAuthServiceFailure = false;

/**
 * POST /api/auth/login
 * US06 & US10: Validate credentials, rate limit / lockout, email validation, cookies & audit
 */
router.post('/login', async (req, res) => {
  try {
    // 1. Simulate authentication service failure if test flag set (TC_33)
    if (simulateAuthServiceFailure || req.headers['x-simulate-service-failure'] === 'true') {
      return res.status(503).json({
        success: false,
        message: 'Authentication service temporarily unavailable. Please retry shortly.',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const { username, email, identifier, password, role, redirect, returnUrl } = req.body;
    let loginId = identifier !== undefined ? identifier : (email !== undefined ? email : username);

    // 2. Required field validation (TC_07, TC_08)
    if (loginId === undefined || loginId === null || String(loginId).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Username/email is required'
      });
    }

    if (password === undefined || password === null || String(password).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    const trimmedLoginId = String(loginId).trim();

    // 3. Email format validation (TC_09)
    // If input explicitly provided as 'email' or contains '@' and looks like an email attempt
    if (email !== undefined || (trimmedLoginId.includes('@') && !trimmedLoginId.startsWith('STU-') && !trimmedLoginId.startsWith('FAC-') && !trimmedLoginId.startsWith('ADM-'))) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedLoginId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email address format'
        });
      }
    }

    // 4. Authenticate via AuthService (handles trimming, rate-limiting lockout TC_13, and audit logging)
    const result = await authService.login(trimmedLoginId, password, role || null);

    // 5. Open redirect protection & preservation (TC_38, TC_39)
    const requestedRedirect = redirect || returnUrl || req.query.redirect || req.query.returnUrl;
    const validatedRedirect = authService.validateRedirectUrl(requestedRedirect);

    // 6. Set session cookie with security attributes (TC_40)
    const isHttps = isHttpsRequest(req);
    const cookieHeader = `af_session=${result.token}; Path=/; HttpOnly; SameSite=Strict${isHttps ? '; Secure' : ''}; Max-Age=900`;
    res.setHeader('Set-Cookie', cookieHeader);

    // Update active session user for backwards compatibility with earlier tests
    setSessionUser(result.user.id);

    return res.status(200).json({
      success: true,
      message: 'Login successful. Redirecting to landing page...',
      token: result.token,
      session: result.session,
      user: result.user,
      redirect: validatedRedirect || undefined
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Login failed',
      code: err.code || undefined
    });
  }
});

/**
 * POST /api/auth/logout
 * US06 & US10: Terminate active session & clear session cookies
 */
router.post('/logout', (req, res) => {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'];
  } else if (req.cookies && req.cookies['af_session']) {
    token = req.cookies['af_session'];
  } else if (req.token) {
    token = req.token;
  }

  if (token) {
    authService.terminateSession(token);
  }

  // Clear cookie
  const isHttps = isHttpsRequest(req);
  res.setHeader('Set-Cookie', `af_session=; Path=/; HttpOnly; SameSite=Strict${isHttps ? '; Secure' : ''}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);

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

// Test helpers to set failure simulation
router.setSimulateAuthFailure = (val) => {
  simulateAuthServiceFailure = Boolean(val);
};

module.exports = router;
