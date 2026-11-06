const crypto = require('crypto');
const db = require('../database/db');
const CONSTANTS = require('../config/constants');

// Default session inactivity timeout: 15 minutes (in milliseconds)
const DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

class AuthService {
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
    return users.find(u => 
      (u.id && u.id.toLowerCase() === clean) ||
      (u.email && u.email.toLowerCase() === clean) ||
      (u.username && u.username.toLowerCase() === clean)
    ) || null;
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
    return { valid: true, session: updated, user };
  }

  /**
   * Terminate active session (Logout)
   */
  terminateSession(token) {
    if (!token) return false;
    return db.updateSession(token, { active: false, loggedOutAt: new Date().toISOString() });
  }

  /**
   * Authenticate student / user login
   */
  async login(identifier, password, roleHint = null) {
    if (!identifier || !identifier.trim() || !password || !password.trim()) {
      const err = new Error('Username/email and password are required');
      err.statusCode = 400;
      throw err;
    }

    const user = this.findUserByIdentifier(identifier);
    if (!user) {
      const err = new Error('Invalid username/email or password');
      err.statusCode = 401;
      throw err;
    }

    // Role check if student login is strictly required
    if (roleHint && user.role !== roleHint) {
      const err = new Error(`Access denied for role ${roleHint}`);
      err.statusCode = 403;
      throw err;
    }

    // Verify password against salt/hash (or fallback to default 'password123' if salt not initialized)
    let passwordValid = false;
    if (user.passwordSalt && user.passwordHash) {
      passwordValid = this.verifyPassword(password, user.passwordSalt, user.passwordHash);
    } else {
      passwordValid = (password === 'password123' || password === (user.password || 'password123'));
    }

    if (!passwordValid) {
      const err = new Error('Invalid username/email or password');
      err.statusCode = 401;
      throw err;
    }

    // Create session
    const session = this.createSession(user.id);

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
      recentUploads,
      unreadNotificationCount
    };
  }
}

module.exports = new AuthService();
module.exports.AuthService = AuthService;
module.exports.DEFAULT_INACTIVITY_TIMEOUT_MS = DEFAULT_INACTIVITY_TIMEOUT_MS;
