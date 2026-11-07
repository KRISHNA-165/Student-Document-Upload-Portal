const crypto = require('crypto');
const db = require('../database/db');
const CONSTANTS = require('../config/constants');
const auditService = require('./auditService');

// Default session inactivity timeout: 15 minutes (in milliseconds)
const DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

class AuthService {
  constructor() {
    this.failedAttempts = new Map();
  }

  /**
   * Reset failed login attempts
   */
  resetLoginAttempts(identifier = null) {
    if (identifier) {
      this.failedAttempts.delete(String(identifier).trim().toLowerCase());
    } else {
      this.failedAttempts.clear();
    }
  }

  /**
   * Get login attempt status for an identifier
   */
  getLoginAttempts(identifier) {
    if (!identifier) return { count: 0, lockedUntil: null, isLocked: false };
    const clean = String(identifier).trim().toLowerCase();
    const entry = this.failedAttempts.get(clean);
    if (!entry) return { count: 0, lockedUntil: null, isLocked: false };
    const isLocked = entry.lockedUntil && entry.lockedUntil > Date.now();
    return {
      count: entry.count,
      lockedUntil: entry.lockedUntil,
      isLocked: Boolean(isLocked)
    };
  }

  /**
   * Validate destination redirect target against open-redirect attacks (TC_38, TC_39)
   */
  validateRedirectUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    // Block URL schemes, scheme-relative slashes, backslashes, CRLF
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith('//') || trimmed.includes('\\') || /[\r\n]/.test(trimmed)) {
      return null;
    }
    // Must start with '/' or '#' or be a known internal tab/route identifier
    if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
      return trimmed;
    }
    const recognizedDestinations = [
      'dashboardTab', 'uploadTab', 'documentsTab', 'facultyTab', 'adminTab', 'auditTab', 'reportsTab',
      'my-documents', 'dashboard', 'upload', 'faculty', 'admin', 'audit'
    ];
    if (recognizedDestinations.includes(trimmed)) {
      return trimmed;
    }
    return null;
  }

  /**
   * Generate secure salt and hash using PBKDF2
   */
  hashPassword(password, existingSalt = null) {
    const salt = existingSalt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return { salt, hash };
  }

  /**
   * Verify password against salt and hash using timing-safe comparison
   */
  verifyPassword(password, salt, hash) {
    if (!password || !salt || !hash) return false;
    const computedHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');
    const targetBuffer = Buffer.from(hash, 'hex');
    if (computedBuffer.length !== targetBuffer.length) return false;
    return crypto.timingSafeEqual(computedBuffer, targetBuffer);
  }

  /**
   * Find user by username, email, or registration ID (case-insensitive)
   */
  findUserByIdentifier(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();
    const users = db.getAllUsers();
    const match = users.find(u => 
      (u.id && u.id.toLowerCase() === clean) ||
      (u.email && u.email.toLowerCase() === clean) ||
      (u.username && u.username.toLowerCase() === clean)
    );
    if (match) return match;

    // Friendly demo aliases
    if (clean === 'student@university.edu') {
      return users.find(u => u.role === 'Student') || null;
    }
    if (clean === 'faculty@university.edu') {
      return users.find(u => u.role === 'Faculty') || null;
    }
    if (clean === 'admin@university.edu') {
      return users.find(u => u.role === 'Admin') || null;
    }
    return null;
  }

  /**
   * Create a new authenticated session
   */
  createSession(userId, customTimeoutMs = null) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const timeoutMs = customTimeoutMs || DEFAULT_INACTIVITY_TIMEOUT_MS;
    const expiresAt = new Date(now.getTime() + timeoutMs);

    const session = {
      id: token,
      token,
      userId,
      createdAt: now.toISOString(),
      lastActivity: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      timeoutMs,
      active: true
    };

    db.insertSession(session);
    return session;
  }

  /**
   * Validate session token and check inactivity timeout
   */
  validateSession(token, options = {}) {
    if (!token) return { valid: false, reason: 'NO_TOKEN' };

    const session = db.getSession(token);
    if (!session || !session.active) {
      return { valid: false, reason: 'INVALID_SESSION' };
    }

    const nowTime = options.now ? new Date(options.now).getTime() : Date.now();
    const lastActivityTime = new Date(session.lastActivity).getTime();
    const timeoutMs = options.timeoutMs || session.timeoutMs || DEFAULT_INACTIVITY_TIMEOUT_MS;

    // Simulate inactivity offset for tests if requested
    const effectiveInactivityMs = options.simulateInactiveMs 
      ? (nowTime - lastActivityTime) + options.simulateInactiveMs 
      : (nowTime - lastActivityTime);

    if (effectiveInactivityMs > timeoutMs) {
      // Invalidate session
      db.updateSession(token, { active: false, expiredAt: new Date(nowTime).toISOString() });
      return { valid: false, reason: 'SESSION_EXPIRED', session };
    }

    // Update last activity
    const updated = db.updateSession(token, {
      lastActivity: new Date(nowTime).toISOString(),
      expiresAt: new Date(nowTime + timeoutMs).toISOString()
    });

    const user = db.getUserById(session.userId);
    if (!user || user.status === 'Disabled') {
      db.updateSession(token, { active: false, disabledAt: new Date(nowTime).toISOString() });
      return { valid: false, reason: 'ACCOUNT_DISABLED', session };
    }
    return { valid: true, session: updated, user };
  }

  /**
   * Terminate active session (Logout)
   */
  terminateSession(token) {
    if (!token) return false;
    const session = db.getSession(token);
    const user = session ? db.getUserById(session.userId) : null;

    const result = db.updateSession(token, { active: false, loggedOutAt: new Date().toISOString() });

    try {
      auditService.log({
        action: 'USER_LOGOUT',
        actorId: user ? user.id : 'ANONYMOUS',
        actorName: user ? user.name : 'User',
        actorRole: user ? user.role : 'User',
        targetId: user ? user.id : null,
        details: {
          sessionToken: token.slice(0, 8) + '...'
        }
      });
    } catch (auditErr) {
      console.warn('Audit log error on logout:', auditErr.message);
    }

    return result;
  }

  /**
   * Authenticate student / user login with lockout & audit logging (TC_02 - TC_14, US10 AC 5)
   */
  async login(identifier, password, roleHint = null) {
    if (!identifier || !identifier.trim()) {
      const err = new Error('Username/email is required');
      err.statusCode = 400;
      throw err;
    }

    if (!password || !password.trim()) {
      const err = new Error('Password is required');
      err.statusCode = 400;
      throw err;
    }

    const cleanIdentifier = identifier.trim().toLowerCase();

    // 1. Check account lockout / throttling (TC_13)
    const failureRecord = this.failedAttempts.get(cleanIdentifier);
    const now = Date.now();
    if (failureRecord && failureRecord.lockedUntil && failureRecord.lockedUntil > now) {
      const remainingSec = Math.ceil((failureRecord.lockedUntil - now) / 1000);
      const err = new Error(`Account is temporarily locked due to repeated failed login attempts. Please try again in ${remainingSec} seconds.`);
      err.statusCode = 429;
      err.code = 'ACCOUNT_LOCKED';
      throw err;
    }

    const user = this.findUserByIdentifier(identifier);
    if (!user) {
      // Record failed attempt
      this._recordFailedAttempt(cleanIdentifier);
      try {
        auditService.log({
          action: 'LOGIN_FAILED',
          actorId: 'UNKNOWN',
          actorName: 'Unregistered User',
          actorRole: 'Guest',
          targetId: cleanIdentifier,
          details: { identifier: cleanIdentifier, reason: 'ACCOUNT_NOT_FOUND' }
        });
      } catch {}

      const err = new Error('Invalid username/email or password');
      err.statusCode = 401;
      throw err;
    }

    // Account activation / deactivation check (US07, US10 AC 10 & TC_27)
    if (user.status === 'Disabled' || user.active === false) {
      try {
        auditService.log({
          action: 'LOGIN_BLOCKED_DISABLED',
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          targetId: user.id,
          details: { identifier: cleanIdentifier, reason: 'ACCOUNT_DEACTIVATED' }
        });
      } catch {}

      const err = new Error('Account is deactivated. Please contact the administrator.');
      err.statusCode = 403;
      throw err;
    }

    // Role check if role hint is provided
    if (roleHint && user.role !== roleHint) {
      const err = new Error(`Access denied for role ${roleHint}`);
      err.statusCode = 403;
      throw err;
    }

    // Verify password against salt/hash (or fallback for demo accounts)
    let passwordValid = false;
    if (user.passwordSalt && user.passwordHash) {
      passwordValid = this.verifyPassword(password, user.passwordSalt, user.passwordHash);
    } else {
      passwordValid = (password === 'password123' || password === (user.password || 'password123'));
    }

    if (!passwordValid) {
      const isNowLocked = this._recordFailedAttempt(cleanIdentifier);
      try {
        auditService.log({
          action: 'LOGIN_FAILED',
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          targetId: user.id,
          details: { identifier: cleanIdentifier, reason: 'INVALID_PASSWORD' }
        });
      } catch {}

      if (isNowLocked) {
        const err = new Error('Account is temporarily locked due to repeated failed login attempts. Please try again later.');
        err.statusCode = 429;
        err.code = 'ACCOUNT_LOCKED';
        throw err;
      }

      const err = new Error('Invalid username/email or password');
      err.statusCode = 401;
      throw err;
    }

    // Password is valid - reset failed attempts
    this.failedAttempts.delete(cleanIdentifier);

    // Create session
    const session = this.createSession(user.id);

    // Record successful login in audit log (US10 AC 5)
    try {
      auditService.log({
        action: 'USER_LOGIN',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetId: user.id,
        details: {
          method: 'PASSWORD',
          identifier: cleanIdentifier
        }
      });
    } catch (auditErr) {
      console.warn('Audit log error on login:', auditErr.message);
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        semester: user.semester,
        assignedFacultyAdvisorId: user.assignedFacultyAdvisorId,
        assignedFacultyAdvisorName: user.assignedFacultyAdvisorName
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt
      },
      token: session.token
    };
  }

  _recordFailedAttempt(cleanIdentifier) {
    const current = this.failedAttempts.get(cleanIdentifier) || { count: 0, lockedUntil: null };
    current.count += 1;
    let isLocked = false;
    if (current.count >= MAX_FAILED_ATTEMPTS) {
      current.lockedUntil = Date.now() + LOCKOUT_MS;
      isLocked = true;
    }
    this.failedAttempts.set(cleanIdentifier, current);
    return isLocked;
  }

  /**
   * Get Student Dashboard Summary Data (TC_01 to TC_40)
   */
  getStudentDashboardData(studentId) {
    const student = db.getUserById(studentId);
    if (!student) {
      const err = new Error('Student record not found');
      err.statusCode = 404;
      throw err;
    }

    // Student's documents only (Data Isolation TC_20, TC_21)
    const docs = db.getDocuments({ studentId });

    // Status counts (TC_03, TC_04, TC_05, TC_06, TC_07, TC_29)
    const total = docs.length;
    const pending = docs.filter(d => d.status === CONSTANTS.STATUSES.PENDING_APPROVAL).length;
    const approved = docs.filter(d => d.status === CONSTANTS.STATUSES.APPROVED).length;
    const rejected = docs.filter(d => d.status === CONSTANTS.STATUSES.REJECTED).length;

    // Recent uploads: sorted newest first (TC_09, TC_10, TC_11, TC_12)
    const sortedDocs = [...docs].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.submissionDate || 0).getTime();
      const timeB = new Date(b.createdAt || b.submissionDate || 0).getTime();
      if (timeA !== timeB) return timeB - timeA;
      return b.id.localeCompare(a.id);
    });

    const recentUploads = sortedDocs.slice(0, 10).map(d => ({
      id: d.id,
      title: d.title,
      category: d.category,
      status: d.status,
      dateOfAchievement: d.dateOfAchievement,
      issuingOrganization: d.issuingOrganization,
      uploadDate: d.uploadDate || d.createdAt || d.submissionDate,
      formattedDate: d.formattedDate || new Date(d.createdAt || d.submissionDate || Date.now()).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      comments: d.comments || d.facultyComments || null
    }));

    // Unread notification count for this student (TC_18, TC_19)
    const studentNotifs = db.getNotifications(studentId) || [];
    const unreadNotificationCount = studentNotifs.filter(n => !n.read).length;

    return {
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        role: student.role,
        department: student.department,
        semester: student.semester,
        assignedFacultyAdvisorId: student.assignedFacultyAdvisorId,
        assignedFacultyAdvisorName: student.assignedFacultyAdvisorName
      },
      counts: {
        total,
        pending,
        approved,
        rejected
      },
      metrics: {
        totalDocuments: total,
        pendingApproval: pending,
        approved,
        rejected
      },
      recentUploads,
      unreadNotificationCount
    };
  }
}

module.exports = new AuthService();
module.exports.AuthService = AuthService;
module.exports.DEFAULT_INACTIVITY_TIMEOUT_MS = DEFAULT_INACTIVITY_TIMEOUT_MS;
module.exports.MAX_FAILED_ATTEMPTS = MAX_FAILED_ATTEMPTS;
module.exports.LOCKOUT_MS = LOCKOUT_MS;
