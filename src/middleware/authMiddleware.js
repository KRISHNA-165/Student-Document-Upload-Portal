const db = require('../database/db');
const CONSTANTS = require('../config/constants');

// Current simulated session user (can be changed dynamically via /api/auth/switch-user)
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
  // Support explicit header for testing/API clients or use current session user
  const userIdHeader = req.headers['x-user-id'];
  let user = null;

  if (userIdHeader) {
    user = db.getUserById(userIdHeader);
  }

  if (!user) {
    user = db.getUserById(currentSessionUserId);
  }

  if (!user) {
    user = {
      ...CONSTANTS.DEFAULT_STUDENT,
      role: 'Student'
    };
  }

  req.user = user;
  next();
}

function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
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
  requireRole,
  setSessionUser,
  getSessionUser
};

