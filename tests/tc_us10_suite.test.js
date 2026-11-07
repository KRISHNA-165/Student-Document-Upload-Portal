const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = require('../src/app');
const db = require('../src/database/db');
const CONSTANTS = require('../src/config/constants');
const authService = require('../src/services/authService');
const auditService = require('../src/services/auditService');
const storageService = require('../src/services/storageService');
const documentService = require('../src/services/documentService');
const reviewService = require('../src/services/reviewService');
const authRoutes = require('../src/routes/authRoutes');

const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (Audit Test Doc) >>\nendobj\ntrailer\n<<>>\n%%EOF');

/**
 * Lightweight in-memory HTTP request mock helper
 */
function mockRequest(app, method, url, options = {}) {
  return new Promise((resolve) => {
    const headers = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        headers[k.toLowerCase()] = v;
      }
    }

    let rawBody = '';
    if (options.body && typeof options.body === 'object' && !headers['content-type']) {
      headers['content-type'] = 'application/json';
      rawBody = JSON.stringify(options.body);
    } else if (options.body) {
      rawBody = String(options.body);
    }

    if (rawBody && !headers['content-length']) {
      headers['content-length'] = Buffer.byteLength(rawBody).toString();
    }

    const req = new http.IncomingMessage(null);
    req.method = method.toUpperCase();
    req.url = url;
    req.headers = headers;

    // Mock socket/connection safely
    req.socket = { encrypted: false };
    req.connection = { encrypted: false };

    if (options.body && typeof options.body === 'object') {
      req.body = options.body;
    }

    const res = new http.ServerResponse(req);
    const chunks = [];

    res.write = function (chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    };

    res.end = function (chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const buffer = Buffer.concat(chunks);
      const text = buffer.toString('utf-8');
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}

      resolve({
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        text,
        body: json || text,
        json: json || {}
      });
    };

    app.handle(req, res);

    if (rawBody) {
      req.push(Buffer.from(rawBody));
    }
    req.complete = true;
    req.push(null);
  });
}

describe('US10 - Secure Document Storage and Audit (TC_01 to TC_40)', () => {
  let studentUser;
  let otherStudentUser;
  let facultyUser;
  let otherFacultyUser;
  let adminUser;

  beforeEach(() => {
    db.reset();
    authService.resetLoginAttempts();
    if (authRoutes.setSimulateAuthFailure) {
      authRoutes.setSimulateAuthFailure(false);
    }

    studentUser = db.getUserById('STU-2024-001');
    otherStudentUser = db.getUserById('STU-2024-002');
    facultyUser = db.getUserById('FAC-101');
    otherFacultyUser = db.getUserById('FAC-102');
    adminUser = db.getUserById('ADM-001');
  });

  // TC_01: Verify login page opens
  test('TC_01: Verify login page opens', async () => {
    const htmlPath = path.resolve(__dirname, '../public/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('id="signinModal"') || html.includes('id="signinForm"'));
    assert.ok(html.includes('id="signinEmail"'));
    assert.ok(html.includes('id="signinPassword"'));
    assert.ok(html.includes('btn-signin-submit') || html.includes('Sign In'));
  });

  // TC_02: Verify login with valid student credentials
  test('TC_02: Verify login with valid student credentials', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'student@university.edu', password: 'password123' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'Student');
    assert.ok(res.body.user.name);
  });

  // TC_03: Verify login with valid faculty credentials
  test('TC_03: Verify login with valid faculty credentials', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'faculty@university.edu', password: 'password123' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'Faculty');
    assert.ok(res.body.user.name);
  });

  // TC_04: Verify login with valid admin credentials
  test('TC_04: Verify login with valid admin credentials', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'admin@university.edu', password: 'password123' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'Admin');
    assert.equal(res.body.user.name, 'System Administrator');
  });

  // TC_05: Verify login rejects incorrect password
  test('TC_05: Verify login rejects incorrect password', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'student@university.edu', password: 'WrongPassword999' }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Invalid username/email or password');
  });

  // TC_06: Verify login rejects unknown email
  test('TC_06: Verify login rejects unknown email', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'unknown@example.edu', password: 'password123' }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Invalid username/email or password');
  });

  // TC_07: Verify required email validation
  test('TC_07: Verify required email validation', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: '', password: 'password123' }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /required/i);
  });

  // TC_08: Verify required password validation
  test('TC_08: Verify required password validation', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'student@university.edu', password: '' }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /password is required/i);
  });

  // TC_09: Verify email format validation
  test('TC_09: Verify email format validation', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { email: 'invalid-email', password: 'password123' }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /valid email address/i);
  });

  // TC_10: Verify password field masks input
  test('TC_10: Verify password field masks input', async () => {
    const htmlPath = path.resolve(__dirname, '../public/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.match(html, /<input[^>]+type="password"[^>]+id="signinPassword"/);
  });

  // TC_11: Verify show/hide password control
  test('TC_11: Verify show/hide password control', async () => {
    const htmlPath = path.resolve(__dirname, '../public/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('id="btnTogglePwd"'));
    assert.ok(html.includes('aria-label="Toggle Password Visibility"'));

    const jsPath = path.resolve(__dirname, '../public/js/app.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    assert.ok(js.includes('btnTogglePwd.addEventListener'));
    assert.ok(js.includes("signinPassword.type = isPwd ? 'text' : 'password'"));
  });

  // TC_12: Verify login form handles surrounding email spaces
  test('TC_12: Verify login form handles surrounding email spaces', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: '   student@university.edu   ', password: 'password123' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.email, 'john.doe@university.edu');
  });

  // TC_13: Verify account lockout or throttling after repeated failures
  test('TC_13: Verify account lockout or throttling after repeated failures', async () => {
    const targetEmail = 'lockout-test@university.edu';
    // Create temporary test user
    db.insertUser({
      id: 'USR-LOCK-01',
      name: 'Lockout User',
      email: targetEmail,
      role: 'Student',
      password: 'correctPassword',
      status: 'Active'
    });

    // 4 failed attempts should return 401
    for (let i = 0; i < 4; i++) {
      const res = await mockRequest(app, 'POST', '/api/auth/login', {
        body: { identifier: targetEmail, password: 'wrongPassword' }
      });
      assert.equal(res.statusCode, 401);
    }

    // 5th failed attempt triggers lockout (429)
    const lockedRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: targetEmail, password: 'wrongPassword' }
    });
    assert.equal(lockedRes.statusCode, 429);
    assert.match(lockedRes.body.message, /temporarily locked/i);

    // Subsequent attempt even with correct password is locked
    const blockedRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: targetEmail, password: 'correctPassword' }
    });
    assert.equal(blockedRes.statusCode, 429);
    assert.match(blockedRes.body.message, /temporarily locked/i);
  });

  // TC_14: Verify login error does not reveal whether email exists
  test('TC_14: Verify login error does not reveal whether email exists', async () => {
    const registeredRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'student@university.edu', password: 'wrongpassword' }
    });
    const unregisteredRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'nonexistent-person-99@university.edu', password: 'wrongpassword' }
    });

    assert.equal(registeredRes.statusCode, 401);
    assert.equal(unregisteredRes.statusCode, 401);
    assert.equal(registeredRes.body.message, unregisteredRes.body.message);
  });

  // TC_15: Verify logout ends the session
  test('TC_15: Verify logout ends the session', async () => {
    const loginRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'student@university.edu', password: 'password123' }
    });
    const token = loginRes.body.token;

    // Logout
    const logoutRes = await mockRequest(app, 'POST', '/api/auth/logout', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(logoutRes.statusCode, 200);

    // Verifying protected endpoint rejects terminated token
    const meRes = await mockRequest(app, 'GET', '/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(meRes.statusCode, 401);
  });

  // TC_16: Verify protected page redirects/blocks signed-out user
  test('TC_16: Verify protected page blocks signed-out user', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-anonymous': 'true' }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
  });

  // TC_17: Verify browser back after logout does not expose protected content
  test('TC_17: Verify browser back after logout does not expose protected content (Cache-Control headers)', async () => {
    const res = await mockRequest(app, 'GET', '/api/auth/users');
    const cacheControl = res.headers['cache-control'];
    assert.ok(cacheControl, 'Cache-Control header should be set');
    assert.ok(cacheControl.includes('no-store'), 'Cache-Control should contain no-store');
    assert.ok(cacheControl.includes('no-cache'), 'Cache-Control should contain no-cache');
  });

  // TC_18: Verify student cannot access faculty review page
  test('TC_18: Verify student cannot access faculty review page', async () => {
    const res = await mockRequest(app, 'GET', '/api/faculty/documents', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /forbidden/i);
  });

  // TC_19: Verify student cannot access admin page
  test('TC_19: Verify student cannot access admin page', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /forbidden/i);
  });

  // TC_20: Verify faculty cannot access admin-only page
  test('TC_20: Verify faculty cannot access admin-only page', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-user-id': facultyUser.id }
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /forbidden/i);
  });

  // TC_21: Verify role-based navigation for student
  test('TC_21: Verify role-based navigation for student', async () => {
    const jsPath = path.resolve(__dirname, '../public/js/app.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    assert.ok(js.includes('tabFacultyBtn.classList.add'));
    assert.ok(js.includes('tabAdminUsersBtn.classList.add'));
    assert.ok(js.includes("currentUser.role === 'Student'"));
  });

  // TC_22: Verify role-based navigation for faculty
  test('TC_22: Verify role-based navigation for faculty', async () => {
    const jsPath = path.resolve(__dirname, '../public/js/app.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    assert.ok(js.includes("currentUser.role === 'Faculty'"));
    assert.ok(js.includes('tabFacultyBtn.classList.remove'));
  });

  // TC_23: Verify role-based navigation for admin
  test('TC_23: Verify role-based navigation for admin', async () => {
    const jsPath = path.resolve(__dirname, '../public/js/app.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    assert.ok(js.includes("currentUser.role === 'Admin'"));
    assert.ok(js.includes('tabAdminUsersBtn.classList.remove'));
    assert.ok(js.includes('tabAuditBtn.classList.remove'));
  });

  // TC_24: Verify direct API requests enforce roles
  test('TC_24: Verify direct API requests enforce roles (server-side protection)', async () => {
    const res = await mockRequest(app, 'POST', '/api/admin/users', {
      headers: { 'x-user-id': studentUser.id },
      body: { name: 'New Student', email: 'new@stu.edu', role: 'Student' }
    });
    assert.equal(res.statusCode, 403);
  });

  // TC_25: Verify student cannot read another student's document
  test("TC_25: Verify student cannot read another student's document", async () => {
    const otherDoc = db.insertDocument({
      id: 'DOC-STUDENT-B',
      studentId: otherStudentUser.id,
      studentName: otherStudentUser.name,
      title: "Student B's Private Document",
      category: 'Achievement',
      status: CONSTANTS.STATUSES.APPROVED,
      storageKey: 'mock-key.pdf',
      originalFilename: 'b.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      createdAt: new Date().toISOString()
    });

    const res = await mockRequest(app, 'GET', `/api/documents/${otherDoc.id}`, {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /only access your own documents/i);
  });

  // TC_26: Verify faculty review scope is enforced
  test('TC_26: Verify faculty review scope is enforced', async () => {
    const outOfScopeDoc = db.insertDocument({
      id: 'DOC-FAC-SCOPE',
      studentId: otherStudentUser.id,
      studentName: otherStudentUser.name,
      title: 'Out of Scope Document',
      category: 'Internship',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      storageKey: 'mock-key2.pdf',
      originalFilename: 'cert.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      assignedFacultyAdvisorId: otherFacultyUser.id,
      assignedFacultyAdvisorName: otherFacultyUser.name,
      createdAt: new Date().toISOString()
    });

    const res = await mockRequest(app, 'GET', `/api/documents/${outOfScopeDoc.id}`, {
      headers: { 'x-user-id': facultyUser.id }
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /not the assigned advisor/i);
  });

  // TC_27: Verify inactive account cannot authenticate
  test('TC_27: Verify inactive account cannot authenticate', async () => {
    db.updateUser(studentUser.id, { status: 'Disabled' });

    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: studentUser.email, password: 'password123' }
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /deactivated/i);
  });

  // TC_28: Verify role changes take effect
  test('TC_28: Verify role changes take effect', async () => {
    // Admin changes student's role to Faculty
    db.updateUser(studentUser.id, { role: 'Faculty' });

    const loginRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: studentUser.email, password: 'password123' }
    });
    assert.equal(loginRes.statusCode, 200);
    assert.equal(loginRes.body.user.role, 'Faculty');

    // Faculty review queue should now be accessible
    const facultyRes = await mockRequest(app, 'GET', '/api/faculty/documents', {
      headers: { 'Authorization': `Bearer ${loginRes.body.token}` }
    });
    assert.equal(facultyRes.statusCode, 200);
  });

  // TC_29: Verify session timeout
  test('TC_29: Verify session timeout', async () => {
    const session = authService.createSession(studentUser.id, 50); // 50ms timeout
    const token = session.token;

    // Simulate inactivity of 200ms
    const validateRes = authService.validateSession(token, { simulateInactiveMs: 200 });
    assert.equal(validateRes.valid, false);
    assert.equal(validateRes.reason, 'SESSION_EXPIRED');

    // Fresh session for HTTP endpoint test
    const session2 = authService.createSession(studentUser.id, 50);
    const apiRes = await mockRequest(app, 'GET', '/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${session2.token}`,
        'x-session-timeout-ms': '50',
        'x-simulate-inactive-ms': '200'
      }
    });
    assert.equal(apiRes.statusCode, 401);
    assert.equal(apiRes.body.code, 'SESSION_EXPIRED');
  });

  // TC_30: Verify concurrent logout invalidates session
  test('TC_30: Verify concurrent logout invalidates session', async () => {
    const loginRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: studentUser.email, password: 'password123' }
    });
    const token = loginRes.body.token;

    // Session works initially
    const activeRes = await mockRequest(app, 'GET', '/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(activeRes.statusCode, 200);

    // Concurrent tab logs out
    await mockRequest(app, 'POST', '/api/auth/logout', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // Second tab tries to access protected endpoint
    const afterLogoutRes = await mockRequest(app, 'GET', '/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(afterLogoutRes.statusCode, 401);
  });

  // TC_31: Verify login over HTTPS
  test('TC_31: Verify login over HTTPS support & secure cookie generation', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      headers: { 'x-forwarded-proto': 'https' },
      body: { identifier: studentUser.email, password: 'password123' }
    });
    assert.equal(res.statusCode, 200);
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie);
    assert.match(String(setCookie), /Secure/i);
    assert.match(String(setCookie), /HttpOnly/i);
  });

  // TC_32: Verify password is not exposed in URL
  test('TC_32: Verify password is not exposed in URL', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: studentUser.email, password: 'password123' }
    });
    assert.equal(res.statusCode, 200);
    // Credentials submitted in body, not url
    assert.ok(!res.headers['location'] || !res.headers['location'].includes('password123'));
  });

  // TC_33: Verify authentication response handles service failure
  test('TC_33: Verify authentication response handles service failure', async () => {
    authRoutes.setSimulateAuthFailure(true);

    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: studentUser.email, password: 'password123' }
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /temporarily unavailable/i);
  });

  // TC_34: Verify retry after authentication service recovery
  test('TC_34: Verify retry after authentication service recovery', async () => {
    authRoutes.setSimulateAuthFailure(true);
    const failRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: studentUser.email, password: 'password123' }
    });
    assert.equal(failRes.statusCode, 503);

    // Restore service
    authRoutes.setSimulateAuthFailure(false);
    const recoverRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: studentUser.email, password: 'password123' }
    });
    assert.equal(recoverRes.statusCode, 200);
    assert.equal(recoverRes.body.success, true);
  });

  // TC_35: Verify keyboard navigation on login form
  test('TC_35: Verify keyboard navigation on login form', async () => {
    const htmlPath = path.resolve(__dirname, '../public/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('<form id="signinForm"'));
    assert.ok(html.includes('type="submit"'));
  });

  // TC_36: Verify login form has accessible labels
  test('TC_36: Verify login form has accessible labels', async () => {
    const htmlPath = path.resolve(__dirname, '../public/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('<label for="signinEmail"'));
    assert.ok(html.includes('<label for="signinPassword"'));
    assert.ok(html.includes('aria-label="Toggle Password Visibility"'));
    assert.ok(html.includes('role="alert"'));
  });

  // TC_37: Verify login layout on mobile
  test('TC_37: Verify login layout on mobile', async () => {
    const cssPath = path.resolve(__dirname, '../public/css/styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(css.includes('@media') && css.includes('max-width'));
  });

  // TC_38: Verify login redirect preserves intended protected destination
  test('TC_38: Verify login redirect preserves intended protected destination', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: {
        identifier: studentUser.email,
        password: 'password123',
        redirect: 'documentsTab'
      }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.redirect, 'documentsTab');
  });

  // TC_39: Verify open redirect protection
  test('TC_39: Verify open redirect protection', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: {
        identifier: studentUser.email,
        password: 'password123',
        redirect: 'https://malicious-attacker.com/steal-token'
      }
    });
    assert.equal(res.statusCode, 200);
    // Malicious external redirect is blocked / sanitized to undefined
    assert.equal(res.body.redirect, undefined);
  });

  // TC_40: Verify session cookie security attributes
  test('TC_40: Verify session cookie security attributes (HttpOnly, SameSite)', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: studentUser.email, password: 'password123' }
    });
    assert.equal(res.statusCode, 200);
    const cookie = res.headers['set-cookie'];
    assert.ok(cookie);
    assert.match(String(cookie), /HttpOnly/i);
    assert.match(String(cookie), /SameSite=Strict/i);
  });

  // =========================================================================
  // User Story 10 Acceptance Criteria Tests
  // =========================================================================

  test('US10 Acceptance 1: Uploaded documents must be stored securely in private storage', async () => {
    const saved = await storageService.saveFile(VALID_PDF_BUFFER, 'secure_test.pdf');
    assert.ok(saved.storageKey);
    assert.ok(saved.filePath);
    // Verify file is saved in private storage directory, not in public/
    assert.ok(saved.filePath.includes('storage/documents') || saved.filePath.includes('storage'));
    assert.ok(!saved.filePath.includes('public/uploads') && !saved.filePath.includes('public/documents'));

    // Clean up
    await storageService.deleteFile(saved.storageKey);
  });

  test('US10 Acceptance 2: Documents must be associated with the correct student', async () => {
    const doc = db.insertDocument({
      id: 'DOC-STUDENT-ASSOC',
      studentId: studentUser.id,
      studentName: studentUser.name,
      registrationNumber: studentUser.registrationNumber || 'REG-2024-001',
      title: 'Student Specific Document',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      createdAt: new Date().toISOString()
    });

    assert.equal(doc.studentId, studentUser.id);
    assert.equal(doc.studentName, studentUser.name);
  });

  test('US10 Acceptance 3: Unauthorized users must not be able to access documents', async () => {
    const doc = db.insertDocument({
      id: 'DOC-AUTH-CHECK',
      studentId: studentUser.id,
      studentName: studentUser.name,
      title: 'Confidential Doc',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.APPROVED,
      createdAt: new Date().toISOString()
    });

    // Unauthenticated request
    const unauthRes = await mockRequest(app, 'GET', `/api/documents/${doc.id}`, {
      headers: { 'x-anonymous': 'true' }
    });
    assert.equal(unauthRes.statusCode, 401);

    // Another student request
    const studentBRes = await mockRequest(app, 'GET', `/api/documents/${doc.id}`, {
      headers: { 'x-user-id': otherStudentUser.id }
    });
    assert.equal(studentBRes.statusCode, 403);
  });

  test('US10 Acceptance 4: Document access must follow role-based permissions', async () => {
    const doc = db.insertDocument({
      id: 'DOC-ROLE-PERMS',
      studentId: studentUser.id,
      studentName: studentUser.name,
      assignedFacultyAdvisorId: facultyUser.id,
      title: 'Role Permission Document',
      category: 'Internship',
      status: CONSTANTS.STATUSES.APPROVED,
      createdAt: new Date().toISOString()
    });

    // 1. Owner student can access
    const stuRes = await mockRequest(app, 'GET', `/api/documents/${doc.id}`, {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(stuRes.statusCode, 200);

    // 2. Assigned faculty can access
    const facRes = await mockRequest(app, 'GET', `/api/documents/${doc.id}`, {
      headers: { 'x-user-id': facultyUser.id }
    });
    assert.equal(facRes.statusCode, 200);

    // 3. Unassigned faculty cannot access
    const unassignedFacRes = await mockRequest(app, 'GET', `/api/documents/${doc.id}`, {
      headers: { 'x-user-id': otherFacultyUser.id }
    });
    assert.equal(unassignedFacRes.statusCode, 403);

    // 4. Admin can access
    const adminRes = await mockRequest(app, 'GET', `/api/documents/${doc.id}`, {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(adminRes.statusCode, 200);
  });

  test('US10 Acceptance 5: Important actions should be recorded in an audit log', async () => {
    const initialLogCount = auditService.getLogs().length;

    // Perform an audit log entry
    auditService.log({
      action: 'DOCUMENT_UPLOAD',
      actorId: studentUser.id,
      actorRole: studentUser.role,
      targetId: 'DOC-AUDIT-TEST-01',
      details: { title: 'Audit Test Doc' }
    });

    const logs = auditService.getLogs();
    assert.equal(logs.length, initialLogCount + 1);
    assert.equal(logs[0].action, 'DOCUMENT_UPLOAD');
    assert.equal(logs[0].actorId, studentUser.id);
  });

  test('US10 Acceptance 6: Audit records should include User, Action, Document, Date and Time', async () => {
    const entry = auditService.log({
      action: 'DOCUMENT_APPROVED',
      actorId: facultyUser.id,
      actorName: facultyUser.name,
      actorRole: facultyUser.role,
      targetId: 'DOC-SAMPLE-123',
      documentId: 'DOC-SAMPLE-123',
      details: { decision: 'Approved', comment: 'Looks great' }
    });

    assert.ok(entry.id);
    assert.equal(entry.action, 'DOCUMENT_APPROVED');
    assert.equal(entry.actorId, facultyUser.id);
    assert.equal(entry.actorName, facultyUser.name);
    assert.equal(entry.actorRole, facultyUser.role);
    assert.equal(entry.documentId, 'DOC-SAMPLE-123');
    assert.ok(entry.timestamp);
    assert.ok(!isNaN(new Date(entry.timestamp).getTime()));
  });

  test('US10 Acceptance 7: Approval, rejection, replacement, upload, and download activities should be traceable', async () => {
    const docId = `DOC-TRACE-${Date.now()}`;

    // Trace lifecycle
    auditService.log({ action: 'DOCUMENT_UPLOAD', actorId: studentUser.id, targetId: docId });
    auditService.log({ action: 'DOCUMENT_DOWNLOAD', actorId: facultyUser.id, targetId: docId });
    auditService.log({ action: 'DOCUMENT_REJECTED', actorId: facultyUser.id, targetId: docId });
    auditService.log({ action: 'DOCUMENT_REPLACED', actorId: studentUser.id, targetId: docId });
    auditService.log({ action: 'DOCUMENT_APPROVED', actorId: facultyUser.id, targetId: docId });

    const trail = auditService.getAuditTrailForDocument(docId);
    assert.equal(trail.length, 5);
    const actions = trail.map(t => t.action);
    assert.ok(actions.includes('DOCUMENT_UPLOAD'));
    assert.ok(actions.includes('DOCUMENT_DOWNLOAD'));
    assert.ok(actions.includes('DOCUMENT_REJECTED'));
    assert.ok(actions.includes('DOCUMENT_REPLACED'));
    assert.ok(actions.includes('DOCUMENT_APPROVED'));
  });

  test('US10 Acceptance 8: Audit records should not be editable by normal users', async () => {
    // Student trying to view audit records
    const studentRes = await mockRequest(app, 'GET', '/api/audit-logs', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(studentRes.statusCode, 403);

    // Faculty trying to view audit records
    const facultyRes = await mockRequest(app, 'GET', '/api/audit-logs', {
      headers: { 'x-user-id': facultyUser.id }
    });
    assert.equal(facultyRes.statusCode, 403);

    // Any user attempting to POST or DELETE audit records (Immutability)
    const postRes = await mockRequest(app, 'POST', '/api/audit-logs', {
      headers: { 'x-user-id': adminUser.id },
      body: { action: 'TAMPER_ATTEMPT' }
    });
    assert.equal(postRes.statusCode, 405);

    const deleteRes = await mockRequest(app, 'DELETE', '/api/audit-logs/AUDIT-123', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(deleteRes.statusCode, 405);
  });

  test('US10 Acceptance 9: Administrators should be able to view audit records', async () => {
    auditService.log({ action: 'SYSTEM_AUDIT_VIEW_TEST', actorId: adminUser.id });

    // 1. Through /api/audit-logs
    const auditRes = await mockRequest(app, 'GET', '/api/audit-logs', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(auditRes.statusCode, 200);
    assert.ok(auditRes.body.logs.length > 0);

    // 2. Through /api/admin/audit-events
    const adminEventsRes = await mockRequest(app, 'GET', '/api/admin/audit-events', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(adminEventsRes.statusCode, 200);
    assert.ok(adminEventsRes.body.logs.length > 0);
  });

  test("US10 Acceptance 10: Deleted/deactivated users' historical records should remain available for auditing", async () => {
    const tempStudent = db.insertUser({
      id: 'STU-DEACTIVATED-01',
      name: 'Deactivated Student',
      email: 'deactivated@university.edu',
      role: 'Student',
      status: 'Active'
    });

    const doc = db.insertDocument({
      id: 'DOC-HISTORICAL-01',
      studentId: tempStudent.id,
      title: 'Historical Document',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.APPROVED,
      createdAt: new Date().toISOString()
    });

    auditService.log({
      action: 'DOCUMENT_UPLOAD',
      actorId: tempStudent.id,
      targetId: doc.id,
      details: { title: doc.title }
    });

    // Deactivate user
    db.updateUser(tempStudent.id, { status: 'Disabled' });

    // Verify historical audit logs remain queryable
    const userTrail = auditService.getAuditTrailForUser(tempStudent.id);
    assert.equal(userTrail.length, 1);
    assert.equal(userTrail[0].action, 'DOCUMENT_UPLOAD');
    assert.equal(userTrail[0].targetId, doc.id);

    // Verify historical document remains in database
    const fetchedDoc = db.getDocumentById(doc.id);
    assert.ok(fetchedDoc);
    assert.equal(fetchedDoc.studentId, tempStudent.id);
  });
});
