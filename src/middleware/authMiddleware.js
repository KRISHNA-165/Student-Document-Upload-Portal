const db = require('../database/db');
const CONSTANTS = require('../config/constants');
const authService = require('../services/authService');

// Current simulated session user (for demo persona switcher & backward compatibility with earlier tests)
let currentSessionUserId = CONSTANTS.DEFAULT_STUDENT.id;

function setSessionUser(userId) {
  const user = db.getUserById(userId);
  if (user) {
    currentSessionUserId = userId;
    return user;
  }
  return null;
}

function getSessionUser() {
  return db.getUserById(currentSessionUserId) || CONSTANTS.DEFAULT_STUDENT;
}

function authMiddleware(req, res, next) {
  // 1. Extract session token from Authorization header or custom header
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'];
  } else if (req.cookies && req.cookies['af_session']) {
    token = req.cookies['af_session'];
  }

  // Support test headers for simulating custom timeout or inactivity
  const timeoutMs = req.headers['x-session-timeout-ms'] ? parseInt(req.headers['x-session-timeout-ms'], 10) : null;
  const simulateInactiveMs = req.headers['x-simulate-inactive-ms'] ? parseInt(req.headers['x-simulate-inactive-ms'], 10) : null;

  if (token) {
    const sessionResult = authService.validateSession(token, { timeoutMs, simulateInactiveMs });
    if (sessionResult.valid) {
      req.user = sessionResult.user;
      req.session = sessionResult.session;
      req.token = token;
      return next();
    } else {
      req.sessionExpired = (sessionResult.reason === 'SESSION_EXPIRED');
      req.sessionInvalid = true;
      // Do not attach user if token was explicitly provided but invalid/expired
      req.user = null;
      return next();
    }
  }

  // 2. Fallback for testing/compatibility: Check explicit x-user-id header
  const userIdHeader = req.headers['x-user-id'];
  if (userIdHeader) {
    req.user = db.getUserById(userIdHeader) || null;
    return next();
  }

  // 3. Fallback for unauthenticated requests with explicit anonymous flag
  if (req.headers['x-anonymous'] === 'true' || req.headers['x-no-auth'] === 'true') {
    req.user = null;
    return next();
  }

  // 4. Default to current session user for backwards compatibility with US01-US05 tests
  req.user = db.getUserById(currentSessionUserId) || {
    ...CONSTANTS.DEFAULT_STUDENT,
    role: 'Student'
  };

  next();
}

/**
 * Strict authentication guard
 */
function requireAuth(req, res, next) {
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
      message: 'Authentication required. Please log in.',
      code: 'UNAUTHORIZED'
    });
  }

  next();
}

/**
 * Role guard
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req, res, next) => {
    if (req.sessionExpired) {
      return res.status(401).json({
        success: false,
        message: 'Session expired due to inactivity. Please log in again.',
        code: 'SESSION_EXPIRED'
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Requires one of [${roles.join(', ')}] role`
      });
    }
    next();
  };
}

module.exports = {
  authMiddleware,
  requireAuth,
  requireRole,
  setSessionUser,
  getSessionUser
};
