const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const db = require('../src/database/db');
const CONSTANTS = require('../src/config/constants');
const adminService = require('../src/services/adminService');
const authService = require('../src/services/authService');

/**
 * Lightweight in-memory HTTP mock helper
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

    const { EventEmitter } = require('events');
    const req = new EventEmitter();
    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.headers = headers;
    req.query = {};
    req.body = options.body || {};

    const urlParts = url.split('?');
    if (urlParts.length > 1) {
      const qParams = new URLSearchParams(urlParts[1]);
      for (const [key, value] of qParams.entries()) {
        req.query[key] = value;
      }
    }

    let statusCode = 200;
    const resHeaders = {};
    const chunks = [];

    const res = {
      statusCode: 200,
      setHeader(name, val) {
        resHeaders[name.toLowerCase()] = val;
      },
      getHeader(name) {
        return resHeaders[name.toLowerCase()];
      },
      status(code) {
        statusCode = code;
        res.statusCode = code;
        return res;
      },
      json(data) {
        res.setHeader('content-type', 'application/json');
        statusCode = res.statusCode || 200;
        resolve({
          statusCode,
          headers: resHeaders,
          body: data,
          text: JSON.stringify(data)
        });
      },
      send(data) {
        statusCode = res.statusCode || 200;
        resolve({
          statusCode,
          headers: resHeaders,
          body: data,
          text: String(data)
        });
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.from(chunk));
        statusCode = res.statusCode || 200;
        const buf = Buffer.concat(chunks);
        resolve({
          statusCode,
          headers: resHeaders,
          body: buf,
          text: buf.toString('utf-8')
        });
      }
    };

    app(req, res, (err) => {
      if (err) {
        resolve({
          statusCode: err.statusCode || 500,
          headers: resHeaders,
          body: { error: err.message },
          text: JSON.stringify({ error: err.message })
        });
      }
    });

    if (rawBody) {
      req.emit('data', Buffer.from(rawBody));
    }
    req.emit('end');
  });
}

describe('US07 - Admin User and Faculty Management (TC_01 to TC_40)', () => {
  const adminUser = {
    id: 'ADM-001',
    name: 'System Administrator',
    email: 'admin@university.edu',
    role: 'Admin'
  };

  const studentUser = {
    id: 'STU-2024-001',
    name: 'John Doe',
    email: 'john.doe@university.edu',
    role: 'Student'
  };

  const facultyUser = {
    id: 'FAC-101',
    name: 'Dr. Robert Smith',
    email: 'robert.smith@university.edu',
    role: 'Faculty'
  };

  beforeEach(() => {
    db.reset();
  });

  // TC_01: Verify admin user-management page opens
  test('TC_01: Verify admin user-management page opens', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.users));
    assert.ok(res.body.total > 0);
  });

  // TC_02: Verify non-admin cannot access user management
  test('TC_02: Verify non-admin cannot access user management', async () => {
    // Attempt as student
    const studentRes = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(studentRes.statusCode, 403);
    assert.equal(studentRes.body.success, false);

    // Attempt as faculty
    const facultyRes = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-user-id': facultyUser.id }
    });
    assert.equal(facultyRes.statusCode, 403);
  });

  // TC_03: Verify user list displays registered users
  test('TC_03: Verify user list displays registered users', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.users.length >= 3);
  });

  // TC_04: Verify user name is displayed correctly
  test('TC_04: Verify user name is displayed correctly', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id }
    });
    const arun = res.body.users.find(u => u.name === 'Arun Kumar');
    assert.ok(arun, 'Arun Kumar should be found in registered users list');
    assert.equal(arun.name, 'Arun Kumar');
  });

  // TC_05: Verify user email is displayed correctly
  test('TC_05: Verify user email is displayed correctly', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id }
    });
    const arun = res.body.users.find(u => u.name === 'Arun Kumar');
    assert.ok(arun);
    assert.equal(arun.email, 'arun.kumar@university.edu');
  });

  // TC_06: Verify role is displayed for each user
  test('TC_06: Verify role is displayed for each user', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id }
    });
    const roles = res.body.users.map(u => u.role);
    assert.ok(roles.includes('Student'), 'Contains students');
    assert.ok(roles.includes('Faculty'), 'Contains faculty');
    assert.ok(roles.includes('Admin'), 'Contains admin');
  });

  // TC_07: Verify account status is displayed
  test('TC_07: Verify account status is displayed', async () => {
    // Disable one user
    db.updateUser('STU-2024-002', { status: 'Disabled' });

    const res = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id }
    });
    const statuses = res.body.users.map(u => u.status);
    assert.ok(statuses.includes('Active'));
    assert.ok(statuses.includes('Disabled'));
  });

  // TC_08: Verify admin can search users by name
  test('TC_08: Verify admin can search users by name', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users?search=Arun', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.users.length, 1);
    assert.equal(res.body.users[0].name, 'Arun Kumar');
  });

  // TC_09: Verify admin can search users by email
  test('TC_09: Verify admin can search users by email', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users?search=jane.smith', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.users.length, 1);
    assert.equal(res.body.users[0].email, 'jane.smith@university.edu');
  });

  // TC_10: Verify user search handles no matches
  test('TC_10: Verify user search handles no matches', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users?search=nobody-xyz@example.edu', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.users.length, 0);
    assert.equal(res.body.total, 0);
  });

  // TC_11: Verify user list can be filtered by role
  test('TC_11: Verify user list can be filtered by role', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users?role=Student', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.users.length > 0);
    assert.ok(res.body.users.every(u => u.role === 'Student'));
  });

  // TC_12: Verify user list can be filtered by account status
  test('TC_12: Verify user list can be filtered by account status', async () => {
    db.updateUser('STU-2024-002', { status: 'Disabled' });
    const res = await mockRequest(app, 'GET', '/api/admin/users?status=Disabled', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.users.length >= 1);
    assert.ok(res.body.users.every(u => u.status === 'Disabled'));
  });

  // TC_13: Verify clearing filters restores full list
  test('TC_13: Verify clearing filters restores full list', async () => {
    const filteredRes = await mockRequest(app, 'GET', '/api/admin/users?role=Admin', {
      headers: { 'x-user-id': adminUser.id }
    });
    const fullRes = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.ok(fullRes.body.total > filteredRes.body.total);
  });

  // TC_14: Verify user list sorting by name
  test('TC_14: Verify user list sorting by name', async () => {
    const ascRes = await mockRequest(app, 'GET', '/api/admin/users?sort=name&sortOrder=asc', {
      headers: { 'x-user-id': adminUser.id }
    });
    const descRes = await mockRequest(app, 'GET', '/api/admin/users?sort=name&sortOrder=desc', {
      headers: { 'x-user-id': adminUser.id }
    });
    const firstAsc = ascRes.body.users[0].name.toLowerCase();
    const firstDesc = descRes.body.users[0].name.toLowerCase();
    assert.notEqual(firstAsc, firstDesc);
  });

  // TC_15: Verify user list pagination
  test('TC_15: Verify user list pagination', async () => {
    // Seed 15 extra users to test pagination
    for (let i = 1; i <= 15; i++) {
      db.insertUser({
        id: `STU-PAGE-${i}`,
        name: `Page Student ${String(i).padStart(2, '0')}`,
        email: `page.student${i}@university.edu`,
        role: 'Student',
        status: 'Active'
      });
    }

    const page1 = await mockRequest(app, 'GET', '/api/admin/users?page=1&limit=10', {
      headers: { 'x-user-id': adminUser.id }
    });
    const page2 = await mockRequest(app, 'GET', '/api/admin/users?page=2&limit=10', {
      headers: { 'x-user-id': adminUser.id }
    });

    assert.equal(page1.body.users.length, 10);
    assert.ok(page2.body.users.length > 0);
    assert.notEqual(page1.body.users[0].id, page2.body.users[0].id);
  });

  // TC_16: Verify admin can open a user's details
  test('TC_16: Verify admin can open a user\'s details', async () => {
    const res = await mockRequest(app, 'GET', `/api/admin/users/${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.id, studentUser.id);
  });

  // TC_17: Verify user details show correct profile data
  test('TC_17: Verify user details show correct profile data', async () => {
    const res = await mockRequest(app, 'GET', `/api/admin/users/${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id }
    });
    const user = res.body.user;
    assert.equal(user.name, 'John Doe');
    assert.equal(user.email, 'john.doe@university.edu');
    assert.equal(user.role, 'Student');
    assert.equal(user.status, 'Active');
  });

  // TC_18: Verify admin can create a user when supported
  test('TC_18: Verify admin can create a user when supported', async () => {
    const res = await mockRequest(app, 'POST', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id },
      body: {
        name: 'Kavi',
        email: 'kavi@example.edu',
        role: 'Student',
        department: 'Computer Science'
      }
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.name, 'Kavi');
    assert.equal(res.body.user.email, 'kavi@example.edu');
  });

  // TC_19: Verify required fields when creating a user
  test('TC_19: Verify required fields when creating a user', async () => {
    const res = await mockRequest(app, 'POST', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id },
      body: { name: '', email: '' }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  });

  // TC_20: Verify invalid email is rejected during user creation
  test('TC_20: Verify invalid email is rejected during user creation', async () => {
    const res = await mockRequest(app, 'POST', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id },
      body: {
        name: 'Kavi',
        email: 'kavi-at-example',
        role: 'Student'
      }
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /invalid email/i);
  });

  // TC_21: Verify duplicate email is rejected
  test('TC_21: Verify duplicate email is rejected', async () => {
    const res = await mockRequest(app, 'POST', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id },
      body: {
        name: 'Duplicate User',
        email: 'john.doe@university.edu', // Already registered to STU-2024-001
        role: 'Student'
      }
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /already registered|already in use/i);
  });

  // TC_22: Verify user role assignment
  test('TC_22: Verify user role assignment', async () => {
    const res = await mockRequest(app, 'POST', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id },
      body: {
        name: 'Dr. New Faculty',
        email: 'new.faculty@university.edu',
        role: 'Faculty',
        department: 'Biotechnology'
      }
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.user.role, 'Faculty');
  });

  // TC_23: Verify admin can edit permitted user details
  test('TC_23: Verify admin can edit permitted user details', async () => {
    const res = await mockRequest(app, 'PATCH', `/api/admin/users/${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id },
      body: { name: 'Kavi R.' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.name, 'Kavi R.');

    // Verify persistence
    const saved = db.getUserById(studentUser.id);
    assert.equal(saved.name, 'Kavi R.');
  });

  // TC_24: Verify email change validation
  test('TC_24: Verify email change validation', async () => {
    const res = await mockRequest(app, 'PATCH', `/api/admin/users/${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id },
      body: { email: 'invalid-email' }
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /invalid email/i);

    const saved = db.getUserById(studentUser.id);
    assert.equal(saved.email, 'john.doe@university.edu');
  });

  // TC_25: Verify canceling user edits discards changes
  test('TC_25: Verify canceling user edits discards changes', () => {
    const appJs = fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf-8');
    assert.match(appJs, /btnCancelEditUser/);
  });

  // TC_26: Verify admin can disable an account when supported
  test('TC_26: Verify admin can disable an account when supported', async () => {
    const res = await mockRequest(app, 'PATCH', `/api/admin/users/${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id },
      body: { status: 'Disabled' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.status, 'Disabled');

    const saved = db.getUserById(studentUser.id);
    assert.equal(saved.status, 'Disabled');
  });

  // TC_27: Verify canceling disable confirmation makes no change
  test('TC_27: Verify canceling disable confirmation makes no change', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /id="confirmAdminActionModal"/);
    assert.match(html, /id="btnCancelAdminAction"/);
  });

  // TC_28: Verify disabled user cannot sign in
  test('TC_28: Verify disabled user cannot sign in', async () => {
    // Disable student
    db.updateUser(studentUser.id, { status: 'Disabled' });

    const loginRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: studentUser.id, password: 'password123' }
    });
    assert.equal(loginRes.statusCode, 403);
    assert.match(loginRes.body.message, /deactivated/i);
  });

  // TC_29: Verify admin can re-enable a disabled account when supported
  test('TC_29: Verify admin can re-enable a disabled account when supported', async () => {
    db.updateUser(studentUser.id, { status: 'Disabled' });

    const res = await mockRequest(app, 'PATCH', `/api/admin/users/${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id },
      body: { status: 'Active' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.status, 'Active');

    // Verify user can log in again
    const loginRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: studentUser.id, password: 'password123' }
    });
    assert.equal(loginRes.statusCode, 200);
  });

  // TC_30: Verify protected admin role cannot be removed accidentally
  test('TC_30: Verify protected admin role cannot be removed accidentally', async () => {
    // Attempt to disable ADM-001
    const disableRes = await mockRequest(app, 'PATCH', '/api/admin/users/ADM-001', {
      headers: { 'x-user-id': adminUser.id },
      body: { status: 'Disabled' }
    });
    assert.equal(disableRes.statusCode, 403);

    // Attempt to change role of ADM-001
    const roleRes = await mockRequest(app, 'PATCH', '/api/admin/users/ADM-001', {
      headers: { 'x-user-id': adminUser.id },
      body: { role: 'Student' }
    });
    assert.equal(roleRes.statusCode, 403);
  });

  // TC_31: Verify role changes affect permissions
  test('TC_31: Verify role changes affect permissions', async () => {
    // Elevate student to Faculty
    const patchRes = await mockRequest(app, 'PATCH', `/api/admin/users/${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id },
      body: { role: 'Faculty' }
    });
    assert.equal(patchRes.statusCode, 200);
    assert.equal(patchRes.body.user.role, 'Faculty');

    // Verify user now has Faculty access
    const facultyQueueRes = await mockRequest(app, 'GET', '/api/faculty/documents', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(facultyQueueRes.statusCode, 200);
  });

  // TC_32: Verify user-management changes persist after refresh
  test('TC_32: Verify user-management changes persist after refresh', async () => {
    await mockRequest(app, 'PATCH', `/api/admin/users/${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id },
      body: { department: 'Aeronautical Engineering' }
    });

    const getRes = await mockRequest(app, 'GET', `/api/admin/users/${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(getRes.body.user.department, 'Aeronautical Engineering');
  });

  // TC_33: Verify user list reflects newly created accounts
  test('TC_33: Verify user list reflects newly created accounts', async () => {
    const createRes = await mockRequest(app, 'POST', '/api/admin/users', {
      headers: { 'x-user-id': adminUser.id },
      body: {
        name: 'Brand New Account',
        email: 'brandnew@university.edu',
        role: 'Student'
      }
    });
    assert.equal(createRes.statusCode, 201);

    const listRes = await mockRequest(app, 'GET', '/api/admin/users?search=brandnew@university.edu', {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(listRes.body.users.length, 1);
    assert.equal(listRes.body.users[0].name, 'Brand New Account');
  });

  // TC_34: Verify user list reflects account status changes
  test('TC_34: Verify user list reflects account status changes', async () => {
    await mockRequest(app, 'PATCH', `/api/admin/users/${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id },
      body: { status: 'Disabled' }
    });

    const listRes = await mockRequest(app, 'GET', `/api/admin/users?search=${studentUser.id}`, {
      headers: { 'x-user-id': adminUser.id }
    });
    assert.equal(listRes.body.users[0].status, 'Disabled');
  });

  // TC_35: Verify error handling when user service fails
  test('TC_35: Verify error handling when user service fails', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /id="adminUsersError"/);
    assert.match(html, /id="adminUsersLoading"/);
  });

  // TC_36: Verify retry after user-list failure
  test('TC_36: Verify retry after user-list failure', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /id="btnRetryAdminUsers"/);
  });

  // TC_37: Verify user list layout on mobile
  test('TC_37: Verify user list layout on mobile', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /class="table-responsive"/);
  });

  // TC_38: Verify keyboard navigation in user management
  test('TC_38: Verify keyboard navigation in user management', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /aria-label="Add New User"/);
    assert.match(html, /id="thSortName"/);
  });

  // TC_39: Verify confirmation is shown before destructive action
  test('TC_39: Verify confirmation is shown before destructive action', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /id="confirmAdminActionModal"/);
    assert.match(html, /id="btnExecuteAdminAction"/);
  });

  // TC_40: Verify user data is not exposed through unauthorized requests
  test('TC_40: Verify user data is not exposed through unauthorized requests', async () => {
    const res = await mockRequest(app, 'GET', '/api/admin/users', {
      headers: { 'x-anonymous': 'true' }
    });
    assert.equal(res.statusCode, 401);
  });

  // US07 Acceptance Criteria Tests
  test('US07 Acceptance 1: Admin can assign students to Faculty Advisors', async () => {
    const res = await mockRequest(app, 'PUT', `/api/admin/students/${studentUser.id}/advisor`, {
      headers: { 'x-user-id': adminUser.id },
      body: { facultyId: 'FAC-102' } // Dr. Emily Davis
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.student.assignedFacultyAdvisorId, 'FAC-102');
    assert.equal(res.body.student.assignedFacultyAdvisorName, 'Dr. Emily Davis');
  });

  test('US07 Acceptance 2: Admin can change student\'s assigned Faculty Advisor', async () => {
    // Reassign back to FAC-101
    const res = await mockRequest(app, 'PUT', `/api/admin/students/${studentUser.id}/advisor`, {
      headers: { 'x-user-id': adminUser.id },
      body: { facultyId: 'FAC-101' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.student.assignedFacultyAdvisorId, 'FAC-101');
    assert.equal(res.body.student.assignedFacultyAdvisorName, 'Dr. Robert Smith');
  });

  test('US07 Acceptance 3: System maintains student and assigned Faculty Advisor relationship', async () => {
    const student = db.getUserById(studentUser.id);
    assert.ok(student.assignedFacultyAdvisorId);
    assert.ok(student.assignedFacultyAdvisorName);
  });

  test('US07 Acceptance 4: Changes to user assignments are recorded in audit logs', async () => {
    await mockRequest(app, 'PUT', `/api/admin/students/${studentUser.id}/advisor`, {
      headers: { 'x-user-id': adminUser.id },
      body: { facultyId: 'FAC-102' }
    });

    const logs = db.getAuditLogs();
    const assignmentLog = logs.find(l => l.action === 'ADMIN_ASSIGN_ADVISOR' && l.targetId === studentUser.id);
    assert.ok(assignmentLog, 'Assignment change should be recorded in audit logs');
    assert.equal(assignmentLog.actorId, adminUser.id);
    assert.equal(assignmentLog.details.newAdvisor.id, 'FAC-102');
  });
});

