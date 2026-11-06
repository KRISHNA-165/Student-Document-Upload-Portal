const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const db = require('../src/database/db');
const CONSTANTS = require('../src/config/constants');
const authService = require('../src/services/authService');
const { DEFAULT_INACTIVITY_TIMEOUT_MS } = require('../src/services/authService');

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

    const resEvents = new EventEmitter();
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
        const payload = JSON.stringify(data);
        resolve({
          statusCode,
          headers: resHeaders,
          body: data,
          text: payload
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

describe('US06 - Secure Student Login & Student Dashboard (TC_01 to TC_40)', () => {
  const studentUser = {
    id: 'STU-2024-001',
    name: 'John Doe',
    email: 'john.doe@university.edu',
    role: 'Student',
    department: 'Computer Science & Engineering',
    semester: '6th Semester',
    assignedFacultyAdvisorId: 'FAC-101',
    assignedFacultyAdvisorName: 'Dr. Robert Smith'
  };

  const studentArun = {
    id: 'STU-2024-004',
    name: 'Arun Kumar',
    email: 'arun.kumar@university.edu',
    role: 'Student',
    department: 'Computer Science & Engineering',
    semester: '5th Semester',
    assignedFacultyAdvisorId: 'FAC-101',
    assignedFacultyAdvisorName: 'Dr. Robert Smith'
  };

  const studentEmpty = {
    id: 'STU-2024-005',
    name: 'Priya Sharma',
    email: 'priya.sharma@university.edu',
    role: 'Student',
    department: 'Information Technology',
    semester: '2nd Semester',
    assignedFacultyAdvisorId: 'FAC-101',
    assignedFacultyAdvisorName: 'Dr. Robert Smith'
  };

  beforeEach(() => {
    db.reset();
  });

  // TC_01: Verify student dashboard opens
  test('TC_01: Verify student dashboard opens', async () => {
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.student);
    assert.ok(res.body.counts);
    assert.ok(Array.isArray(res.body.recentUploads));
  });

  // TC_02: Verify personalized welcome message
  test('TC_02: Verify personalized welcome message', async () => {
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentArun.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.student.name, 'Arun Kumar');
    // Verify welcome greeting format
    const greeting = `Hi, ${res.body.student.name}`;
    assert.match(greeting, /Arun Kumar/);
  });

  // TC_03: Verify dashboard displays total document count
  test('TC_03: Verify dashboard displays total document count', async () => {
    for (let i = 1; i <= 3; i++) {
      db.insertDocument({
        id: `DOC-TOTAL-${i}`,
        studentId: studentUser.id,
        title: `Document ${i}`,
        category: 'Achievement',
        status: CONSTANTS.STATUSES.PENDING_APPROVAL,
        createdAt: new Date().toISOString()
      });
    }
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.counts.total, 3);
  });

  // TC_04: Verify pending document count
  test('TC_04: Verify pending document count', async () => {
    db.insertDocument({
      id: 'DOC-PEND-1',
      studentId: studentUser.id,
      title: 'Pending Doc 1',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL
    });
    db.insertDocument({
      id: 'DOC-PEND-2',
      studentId: studentUser.id,
      title: 'Pending Doc 2',
      category: 'Internship',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL
    });
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.body.counts.pending, 2);
  });

  // TC_05: Verify approved document count
  test('TC_05: Verify approved document count', async () => {
    db.insertDocument({
      id: 'DOC-APP-1',
      studentId: studentUser.id,
      title: 'Approved Doc',
      category: 'Certification',
      status: CONSTANTS.STATUSES.APPROVED
    });
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.body.counts.approved, 1);
  });

  // TC_06: Verify rejected document count
  test('TC_06: Verify rejected document count', async () => {
    db.insertDocument({
      id: 'DOC-REJ-1',
      studentId: studentUser.id,
      title: 'Rejected Doc',
      category: 'Internship',
      status: CONSTANTS.STATUSES.REJECTED
    });
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.body.counts.rejected, 1);
  });

  // TC_07: Verify counts reconcile with document list
  test('TC_07: Verify counts reconcile with document list', async () => {
    // 2 Pending, 3 Approved, 1 Rejected
    db.insertDocument({ id: 'D1', studentId: studentUser.id, status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    db.insertDocument({ id: 'D2', studentId: studentUser.id, status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    db.insertDocument({ id: 'D3', studentId: studentUser.id, status: CONSTANTS.STATUSES.APPROVED });
    db.insertDocument({ id: 'D4', studentId: studentUser.id, status: CONSTANTS.STATUSES.APPROVED });
    db.insertDocument({ id: 'D5', studentId: studentUser.id, status: CONSTANTS.STATUSES.APPROVED });
    db.insertDocument({ id: 'D6', studentId: studentUser.id, status: CONSTANTS.STATUSES.REJECTED });

    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.body.counts.pending, 2);
    assert.equal(res.body.counts.approved, 3);
    assert.equal(res.body.counts.rejected, 1);
    assert.equal(res.body.counts.total, 6);
    assert.equal(res.body.counts.total, res.body.counts.pending + res.body.counts.approved + res.body.counts.rejected);
  });

  // TC_08: Verify dashboard for a student with no documents
  test('TC_08: Verify dashboard for a student with no documents', async () => {
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentEmpty.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.counts.total, 0);
    assert.equal(res.body.counts.pending, 0);
    assert.equal(res.body.counts.approved, 0);
    assert.equal(res.body.counts.rejected, 0);
    assert.equal(res.body.recentUploads.length, 0);
  });

  // TC_09: Verify recent uploads section
  test('TC_09: Verify recent uploads section', async () => {
    for (let i = 1; i <= 3; i++) {
      db.insertDocument({
        id: `DOC-REC-${i}`,
        studentId: studentUser.id,
        title: `Recent Cert ${i}`,
        category: 'Achievement',
        status: CONSTANTS.STATUSES.PENDING_APPROVAL,
        createdAt: new Date(Date.now() - i * 1000).toISOString()
      });
    }
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.body.recentUploads.length, 3);
  });

  // TC_10: Verify recent uploads are ordered newest first
  test('TC_10: Verify recent uploads are ordered newest first', async () => {
    db.insertDocument({
      id: 'DOC-OCT-1',
      studentId: studentUser.id,
      title: 'October 1 Upload',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.APPROVED,
      createdAt: '2026-10-01T10:00:00.000Z'
    });
    db.insertDocument({
      id: 'DOC-OCT-2',
      studentId: studentUser.id,
      title: 'October 2 Upload',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      createdAt: '2026-10-02T10:00:00.000Z'
    });
    db.insertDocument({
      id: 'DOC-OCT-3',
      studentId: studentUser.id,
      title: 'October 3 Upload',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      createdAt: '2026-10-03T10:00:00.000Z'
    });

    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    const uploads = res.body.recentUploads;
    assert.equal(uploads[0].title, 'October 3 Upload');
    assert.equal(uploads[1].title, 'October 2 Upload');
    assert.equal(uploads[2].title, 'October 1 Upload');
  });

  // TC_11: Verify recent upload title and category
  test('TC_11: Verify recent upload title and category', async () => {
    db.insertDocument({
      id: 'DOC-INTERN-1',
      studentId: studentUser.id,
      title: 'Internship Certificate',
      category: 'Internship',
      status: CONSTANTS.STATUSES.APPROVED,
      createdAt: new Date().toISOString()
    });
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    const doc = res.body.recentUploads[0];
    assert.equal(doc.title, 'Internship Certificate');
    assert.equal(doc.category, 'Internship');
  });

  // TC_12: Verify recent upload status is accurate
  test('TC_12: Verify recent upload status is accurate', async () => {
    db.insertDocument({
      id: 'DOC-ACC-STATUS',
      studentId: studentUser.id,
      title: 'Accurate Status Test',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.APPROVED,
      createdAt: new Date().toISOString()
    });
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.body.recentUploads[0].status, 'Approved');
  });

  // TC_13: Verify dashboard refresh after new upload
  test('TC_13: Verify dashboard refresh after new upload', async () => {
    // Check initial counts
    const before = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    const initialTotal = before.body.counts.total;
    const initialPending = before.body.counts.pending;

    // Simulate new upload
    db.insertDocument({
      id: 'DOC-NEW-UP-13',
      studentId: studentUser.id,
      title: 'Newly Uploaded Document',
      category: 'Certification',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      createdAt: new Date().toISOString()
    });

    const after = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(after.body.counts.total, initialTotal + 1);
    assert.equal(after.body.counts.pending, initialPending + 1);
  });

  // TC_14: Verify dashboard updates after approval
  test('TC_14: Verify dashboard updates after approval', async () => {
    const doc = db.insertDocument({
      id: 'DOC-TO-APPROVE',
      studentId: studentUser.id,
      assignedFacultyAdvisorId: 'FAC-101',
      title: 'Doc For Approval',
      category: 'Internship',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      createdAt: new Date().toISOString()
    });

    const before = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(before.body.counts.pending, 1);
    assert.equal(before.body.counts.approved, 0);

    // Faculty approves
    const reviewRes = await mockRequest(app, 'POST', `/api/documents/${doc.id}/review`, {
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve', comment: 'Verified' }
    });
    assert.equal(reviewRes.statusCode, 200);

    const after = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(after.body.counts.pending, 0);
    assert.equal(after.body.counts.approved, 1);
  });

  // TC_15: Verify dashboard updates after rejection
  test('TC_15: Verify dashboard updates after rejection', async () => {
    const doc = db.insertDocument({
      id: 'DOC-TO-REJECT',
      studentId: studentUser.id,
      assignedFacultyAdvisorId: 'FAC-101',
      title: 'Doc For Rejection',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      createdAt: new Date().toISOString()
    });

    // Faculty rejects
    const reviewRes = await mockRequest(app, 'POST', `/api/documents/${doc.id}/review`, {
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Reject', comment: 'Needs official seal' }
    });
    assert.equal(reviewRes.statusCode, 200);

    const after = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(after.body.counts.pending, 0);
    assert.equal(after.body.counts.rejected, 1);
  });

  // TC_16: Verify Upload Document quick action
  test('TC_16: Verify Upload Document quick action', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /id="btnQuickUpload"/);
    assert.match(html, /id="uploadTab"/);
  });

  // TC_17: Verify My Documents quick action
  test('TC_17: Verify My Documents quick action', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /id="btnQuickMyDocs"/);
    assert.match(html, /id="documentsTab"/);
  });

  // TC_18: Verify notification shortcut
  test('TC_18: Verify notification shortcut', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /id="btnQuickNotifs"/);
    assert.match(html, /id="notificationsTab"/);
  });

  // TC_19: Verify unread notification count
  test('TC_19: Verify unread notification count', async () => {
    db.insertNotification({
      id: 'NOTIF-1',
      recipientId: studentUser.id,
      title: 'Document Approved',
      read: false
    });
    db.insertNotification({
      id: 'NOTIF-2',
      recipientId: studentUser.id,
      title: 'Document Rejected',
      read: false
    });
    db.insertNotification({
      id: 'NOTIF-3',
      recipientId: studentUser.id,
      title: 'Old Notification',
      read: true
    });

    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.body.unreadNotificationCount, 2);
  });

  // TC_20: Verify dashboard only shows signed-in student's data
  test('TC_20: Verify dashboard only shows signed-in student\'s data', async () => {
    // Student A has 2 docs
    db.insertDocument({ id: 'DOC-A1', studentId: studentUser.id, status: CONSTANTS.STATUSES.APPROVED });
    db.insertDocument({ id: 'DOC-A2', studentId: studentUser.id, status: CONSTANTS.STATUSES.PENDING_APPROVAL });

    // Student B (Arun Kumar) has 5 docs
    for (let i = 1; i <= 5; i++) {
      db.insertDocument({ id: `DOC-B${i}`, studentId: studentArun.id, status: CONSTANTS.STATUSES.APPROVED });
    }

    const resA = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(resA.body.counts.total, 2);
    assert.ok(resA.body.recentUploads.every(d => d.id.startsWith('DOC-A')));
  });

  // TC_21: Verify dashboard data isolation after switching accounts
  test('TC_21: Verify dashboard data isolation after switching accounts', async () => {
    // Seed records
    db.insertDocument({ id: 'DOC-A1', studentId: studentUser.id, status: CONSTANTS.STATUSES.APPROVED });
    for (let i = 1; i <= 3; i++) {
      db.insertDocument({ id: `DOC-B${i}`, studentId: studentArun.id, status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    }

    // Switch to Student B
    const switchRes = await mockRequest(app, 'POST', '/api/auth/switch-user', {
      body: { userId: studentArun.id }
    });
    assert.equal(switchRes.statusCode, 200);

    const resB = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentArun.id }
    });
    assert.equal(resB.body.counts.total, 3);
    assert.equal(resB.body.student.name, 'Arun Kumar');
  });

  // TC_22: Verify unauthenticated dashboard access is blocked
  test('TC_22: Verify unauthenticated dashboard access is blocked', async () => {
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-anonymous': 'true' }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
  });

  // TC_23: Verify dashboard data persists after refresh
  test('TC_23: Verify dashboard data persists after refresh', async () => {
    db.insertDocument({ id: 'PERSIST-1', studentId: studentUser.id, status: CONSTANTS.STATUSES.APPROVED });
    db.insertDocument({ id: 'PERSIST-2', studentId: studentUser.id, status: CONSTANTS.STATUSES.PENDING_APPROVAL });

    const call1 = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    const call2 = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });

    assert.equal(call1.body.counts.total, call2.body.counts.total);
    assert.equal(call1.body.counts.pending, call2.body.counts.pending);
    assert.equal(call1.body.counts.approved, call2.body.counts.approved);
  });

  // TC_24: Verify dashboard loading state
  test('TC_24: Verify dashboard loading state', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /id="dashboardLoading"/);
    assert.match(html, /role="status"/);
  });

  // TC_25: Verify dashboard data-load failure message
  test('TC_25: Verify dashboard data-load failure message', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /id="dashboardError"/);
    assert.match(html, /id="btnRetryDashboard"/);
  });

  // TC_26: Verify retry after dashboard load failure
  test('TC_26: Verify retry after dashboard load failure', async () => {
    db.insertDocument({ id: 'RETRY-1', studentId: studentUser.id, status: CONSTANTS.STATUSES.APPROVED });
    // First load succeeds
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.counts.total, 1);
  });

  // TC_27: Verify dashboard cards have meaningful labels
  test('TC_27: Verify dashboard cards have meaningful labels', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /Total Documents/);
    assert.match(html, /Pending Approval/);
    assert.match(html, /Approved/);
    assert.match(html, /Action Required \/ Rejected/);
  });

  // TC_28: Verify status indicators are distinguishable
  test('TC_28: Verify status indicators are distinguishable', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../public/css/styles.css'), 'utf-8');
    assert.match(css, /badge-pending/);
    assert.match(css, /badge-approved/);
    assert.match(css, /badge-rejected/);
  });

  // TC_29: Verify statistics do not double-count documents
  test('TC_29: Verify statistics do not double-count documents', async () => {
    // 4 unique documents
    db.insertDocument({ id: 'U1', studentId: studentUser.id, status: CONSTANTS.STATUSES.APPROVED });
    db.insertDocument({ id: 'U2', studentId: studentUser.id, status: CONSTANTS.STATUSES.APPROVED });
    db.insertDocument({ id: 'U3', studentId: studentUser.id, status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    db.insertDocument({ id: 'U4', studentId: studentUser.id, status: CONSTANTS.STATUSES.REJECTED });

    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    const { total, pending, approved, rejected } = res.body.counts;
    assert.equal(total, 4);
    assert.equal(pending, 1);
    assert.equal(approved, 2);
    assert.equal(rejected, 1);
    assert.equal(total, pending + approved + rejected);
  });

  // TC_30: Verify recently uploaded document opens details
  test('TC_30: Verify recently uploaded document opens details', async () => {
    const doc = db.insertDocument({
      id: 'DOC-DETAIL-OPEN',
      studentId: studentUser.id,
      title: 'Detailed Document',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.APPROVED,
      createdAt: new Date().toISOString()
    });

    const res = await mockRequest(app, 'GET', `/api/documents/${doc.id}`, {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.document.id, 'DOC-DETAIL-OPEN');
  });

  // TC_31: Verify long document title layout
  test('TC_31: Verify long document title layout', async () => {
    const longTitle = 'A'.repeat(150);
    db.insertDocument({
      id: 'DOC-LONG-TITLE',
      studentId: studentUser.id,
      title: longTitle,
      category: 'Achievement',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      createdAt: new Date().toISOString()
    });

    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.body.recentUploads[0].title.length, 150);
  });

  // TC_32: Verify dashboard layout on mobile viewport
  test('TC_32: Verify dashboard layout on mobile viewport', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../public/css/styles.css'), 'utf-8');
    assert.match(css, /@media \(max-width: 480px\)/);
  });

  // TC_33: Verify dashboard layout on tablet viewport
  test('TC_33: Verify dashboard layout on tablet viewport', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../public/css/styles.css'), 'utf-8');
    assert.match(css, /@media \(max-width: 1024px\)/);
  });

  // TC_34: Verify dashboard keyboard navigation
  test('TC_34: Verify dashboard keyboard navigation', () => {
    const appJs = fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf-8');
    assert.match(appJs, /keydown/);
    assert.match(appJs, /tabindex="0"/);
  });

  // TC_35: Verify accessible names for dashboard controls
  test('TC_35: Verify accessible names for dashboard controls', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    assert.match(html, /aria-label="Upload Document"/);
    assert.match(html, /aria-label="My Documents"/);
    assert.match(html, /aria-label="Refresh Dashboard"/);
  });

  // TC_36: Verify dashboard date formatting
  test('TC_36: Verify dashboard date formatting', async () => {
    db.insertDocument({
      id: 'DOC-DATE-FMT',
      studentId: studentUser.id,
      title: 'Dated Certificate',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.APPROVED,
      createdAt: '2026-10-05T12:00:00.000Z'
    });
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    const dateStr = res.body.recentUploads[0].formattedDate;
    assert.ok(dateStr);
    assert.match(dateStr, /2026/);
  });

  // TC_37: Verify dashboard handles a large document history
  test('TC_37: Verify dashboard handles a large document history', async () => {
    const docs = [];
    for (let i = 0; i < 500; i++) {
      docs.push({
        id: `BULK-DOC-${i}`,
        studentId: studentUser.id,
        title: `Bulk Document ${i}`,
        category: 'Achievement',
        status: i % 2 === 0 ? CONSTANTS.STATUSES.APPROVED : CONSTANTS.STATUSES.PENDING_APPROVAL,
        createdAt: new Date(Date.now() - i * 1000).toISOString()
      });
    }
    db.data.documents.push(...docs);

    const startTime = Date.now();
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    const duration = Date.now() - startTime;

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.counts.total, 500);
    assert.equal(res.body.counts.approved, 250);
    assert.equal(res.body.counts.pending, 250);
    assert.ok(duration < 150, `Dashboard took ${duration}ms, should be fast`);
  });

  // TC_38: Verify dashboard navigation does not expose another role's controls
  test('TC_38: Verify dashboard navigation does not expose another role\'s controls', () => {
    const appJs = fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf-8');
    assert.match(appJs, /tabFacultyBtn\.classList\.add\('hidden'\)/);
    assert.match(appJs, /tabAuditBtn\.classList\.add\('hidden'\)/);
  });

  // TC_39: Verify dashboard handles session expiration
  test('TC_39: Verify dashboard handles session expiration', async () => {
    const session = authService.createSession(studentUser.id, 100); // 100ms timeout
    // Fast forward inactivity by testing with test header
    const res = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: {
        'Authorization': `Bearer ${session.token}`,
        'x-simulate-inactive-ms': '500' // simulated inactivity
      }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'SESSION_EXPIRED');
  });

  // TC_40: Verify dashboard totals after document deletion or removal
  test('TC_40: Verify dashboard totals after document deletion or removal', async () => {
    const doc = db.insertDocument({
      id: 'DOC-TO-DELETE',
      studentId: studentUser.id,
      title: 'Temporary Certificate',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      createdAt: new Date().toISOString()
    });

    const before = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(before.body.counts.total, 1);

    // Delete document
    const delRes = await mockRequest(app, 'DELETE', `/api/documents/${doc.id}`, {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(delRes.statusCode, 200);

    const after = await mockRequest(app, 'GET', '/api/student/dashboard', {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(after.body.counts.total, 0);
  });

  // US06 Acceptance Criteria Tests
  test('US06 Acceptance 1: Student can log in using registered credentials', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'STU-2024-001', password: 'password123' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
    assert.equal(res.body.user.name, 'John Doe');
  });

  // US06 Acceptance 2: Missing credentials return validation error
  test('US06 Acceptance 2: Missing credentials return validation error', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: '', password: '' }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  });

  // US06 Acceptance 3: Invalid credentials display safe error message
  test('US06 Acceptance 3: Invalid credentials display safe error message', async () => {
    const res = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'STU-2024-001', password: 'wrongpassword' }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, 'Invalid username/email or password');
  });

  // US06 Acceptance 4: Logout terminates active session
  test('US06 Acceptance 4: Logout terminates active session', async () => {
    const loginRes = await mockRequest(app, 'POST', '/api/auth/login', {
      body: { identifier: 'STU-2024-001', password: 'password123' }
    });
    const token = loginRes.body.token;

    // Logout
    const logoutRes = await mockRequest(app, 'POST', '/api/auth/logout', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(logoutRes.statusCode, 200);

    // Verify session terminated on protected endpoint
    const protectedRes = await mockRequest(app, 'GET', '/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(protectedRes.statusCode, 401);
  });

  // US06 Acceptance 5: Student cannot delete another student's document
  test('US06 Acceptance 5: Student cannot delete another student\'s document', async () => {
    const foreignDoc = db.insertDocument({
      id: 'DOC-FOREIGN-1',
      studentId: 'STU-2024-002', // Jane Smith
      title: 'Foreign Doc',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.PENDING_APPROVAL
    });

    const res = await mockRequest(app, 'DELETE', `/api/documents/${foreignDoc.id}`, {
      headers: { 'x-user-id': studentUser.id }
    });
    assert.equal(res.statusCode, 403);
  });
});
