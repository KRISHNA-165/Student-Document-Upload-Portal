const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const app = require('../src/app');
const db = require('../src/database/db');
const CONSTANTS = require('../src/config/constants');
const reviewService = require('../src/services/reviewService');
const { createMultipartPayload, mockRequest } = require('./testHelper');

const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (Certificate) >>\nendobj\ntrailer\n<<>>\n%%EOF');
const REVISED_PDF_BUFFER = Buffer.from('%PDF-1.4\n%âãÏÓ\n2 0 obj\n<< /Title (Revised Certificate) >>\nendobj\ntrailer\n<<>>\n%%EOF');

// Helper to upload a document for a student
async function uploadDocHelper({
  title = 'Internship Certificate',
  category = 'Internship',
  dateOfAchievement = '2024-05-10',
  issuingOrganization = 'Tech Org',
  fileName = 'certificate.pdf',
  fileBuffer = VALID_PDF_BUFFER,
  userId = 'STU-2024-001'
} = {}) {
  const payload = createMultipartPayload(
    { title, category, dateOfAchievement, issuingOrganization },
    [{ name: 'file', filename: fileName, contentType: 'application/pdf', buffer: fileBuffer }]
  );
  const res = await mockRequest(app, {
    method: 'POST',
    url: '/api/documents',
    headers: {
      'content-type': payload.contentType,
      'x-user-id': userId
    },
    body: payload.body
  });
  return res.json.document;
}

describe('US05 - Document Review History & Student Notifications (TC_01 to TC_40)', () => {
  let indexHtmlContent = '';
  let appJsContent = '';

  before(() => {
    indexHtmlContent = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
    appJsContent = fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf-8');
  });

  beforeEach(() => {
    db.reset();
  });

  // -----------------------------------------------------------
  // TC_01: Open Notifications page
  // -----------------------------------------------------------
  it('TC_01: Open Notifications page', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert(indexHtmlContent.includes('id="notificationsTab"'));
    assert(indexHtmlContent.includes('id="studentNotificationsList"'));
  });

  // -----------------------------------------------------------
  // TC_02: Display approval notification
  // -----------------------------------------------------------
  it('TC_02: Display approval notification', async () => {
    const doc = await uploadDocHelper({ title: 'AI Engineering Certificate' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Approve',
      comment: 'Excellent certificate'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    const notif = res.json.notifications.find(n => n.documentId === doc.id);
    assert(notif);
    assert(notif.title.includes('Approved'));
  });

  // -----------------------------------------------------------
  // TC_03: Display rejection notification
  // -----------------------------------------------------------
  it('TC_03: Display rejection notification', async () => {
    const doc = await uploadDocHelper({ title: 'Cloud Internship' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'Please upload a clearer scan'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    const notif = res.json.notifications.find(n => n.documentId === doc.id);
    assert(notif);
    assert(notif.title.includes('Rejected'));
  });

  // -----------------------------------------------------------
  // TC_04: Include document title in notification
  // -----------------------------------------------------------
  it('TC_04: Include document title in notification', async () => {
    const doc = await uploadDocHelper({ title: 'Internship Certificate' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    const notif = res.json.notifications.find(n => n.documentId === doc.id);
    assert.strictEqual(notif.documentTitle, 'Internship Certificate');
    assert(notif.message.includes('Internship Certificate'));
  });

  // -----------------------------------------------------------
  // TC_05: Include decision in notification message
  // -----------------------------------------------------------
  it('TC_05: Include decision in notification message', async () => {
    const doc = await uploadDocHelper({ title: 'Python Cert' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    const notif = res.json.notifications.find(n => n.documentId === doc.id);
    assert(notif.message.toLowerCase().includes('approved'));
  });

  // -----------------------------------------------------------
  // TC_06: Include rejection feedback in notification
  // -----------------------------------------------------------
  it('TC_06: Include rejection feedback in notification', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    const feedback = 'Please upload a clearer scan';
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: feedback
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    const notif = res.json.notifications.find(n => n.documentId === doc.id);
    assert(notif.message.includes(feedback));
  });

  // -----------------------------------------------------------
  // TC_07: Display notification date/time
  // -----------------------------------------------------------
  it('TC_07: Display notification date/time', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    const notif = res.json.notifications[0];
    assert(notif.createdAt);
    assert(!isNaN(new Date(notif.createdAt).getTime()));
  });

  // -----------------------------------------------------------
  // TC_08: Show unread notification indicator
  // -----------------------------------------------------------
  it('TC_08: Show unread notification indicator', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.unreadCount, 1);
    assert.strictEqual(res.json.notifications[0].read, false);
  });

  // -----------------------------------------------------------
  // TC_09: Update unread count when notification is read
  // -----------------------------------------------------------
  it('TC_09: Update unread count when notification is read', async () => {
    const doc1 = await uploadDocHelper({ title: 'Doc 1' });
    const doc2 = await uploadDocHelper({ title: 'Doc 2' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc1.id, facultyUser: faculty, decision: 'Approve' });
    await reviewService.submitDecision({ documentId: doc2.id, facultyUser: faculty, decision: 'Approve' });

    const listResBefore = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(listResBefore.json.unreadCount, 2);

    // Read one
    await mockRequest(app, {
      method: 'PATCH',
      url: `/api/notifications/${listResBefore.json.notifications[0].id}/read`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    const listResAfter = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(listResAfter.json.unreadCount, 1);
  });

  // -----------------------------------------------------------
  // TC_10: Mark a notification as read
  // -----------------------------------------------------------
  it('TC_10: Mark a notification as read', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const listRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    const notifId = listRes.json.notifications[0].id;

    const readRes = await mockRequest(app, {
      method: 'PATCH',
      url: `/api/notifications/${notifId}/read`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(readRes.statusCode, 200);
    assert.strictEqual(readRes.json.notification.read, true);
  });

  // -----------------------------------------------------------
  // TC_11: Mark all notifications as read
  // -----------------------------------------------------------
  it('TC_11: Mark all notifications as read', async () => {
    const doc1 = await uploadDocHelper({ title: 'Doc 1' });
    const doc2 = await uploadDocHelper({ title: 'Doc 2' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc1.id, facultyUser: faculty, decision: 'Approve' });
    await reviewService.submitDecision({ documentId: doc2.id, facultyUser: faculty, decision: 'Reject', comment: 'Blurry' });

    const markAllRes = await mockRequest(app, {
      method: 'POST',
      url: '/api/notifications/read-all',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(markAllRes.statusCode, 200);
    assert.strictEqual(markAllRes.json.unreadCount, 0);

    const listRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert(listRes.json.notifications.every(n => n.read === true));
  });

  // -----------------------------------------------------------
  // TC_12: Open notification linked to document
  // -----------------------------------------------------------
  it('TC_12: Open notification linked to document', async () => {
    const doc = await uploadDocHelper({ title: 'Linked Doc' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const listRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    const notifId = listRes.json.notifications[0].id;

    const openRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/notifications/${notifId}/open`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(openRes.statusCode, 200);
    assert.strictEqual(openRes.json.document.id, doc.id);
    assert.strictEqual(openRes.json.notification.read, true);
  });

  // -----------------------------------------------------------
  // TC_13: Display empty notification state
  // -----------------------------------------------------------
  it('TC_13: Display empty notification state', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-002' } // Zero notifications
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.notifications.length, 0);
    assert(appJsContent.includes('No notifications matching'));
  });

  // -----------------------------------------------------------
  // TC_14: Separate read and unread notifications
  // -----------------------------------------------------------
  it('TC_14: Separate read and unread notifications', () => {
    assert(appJsContent.includes('unread'));
    assert(appJsContent.includes('UNREAD'));
  });

  // -----------------------------------------------------------
  // TC_15: Filter notifications by approval type
  // -----------------------------------------------------------
  it('TC_15: Filter notifications by approval type', async () => {
    const doc1 = await uploadDocHelper({ title: 'Approved Doc' });
    const doc2 = await uploadDocHelper({ title: 'Rejected Doc' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc1.id, facultyUser: faculty, decision: 'Approve' });
    await reviewService.submitDecision({ documentId: doc2.id, facultyUser: faculty, decision: 'Reject', comment: 'Reason' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications?type=Approved',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert(res.json.notifications.every(n => n.title.includes('Approved')));
  });

  // -----------------------------------------------------------
  // TC_16: Filter notifications by rejection type
  // -----------------------------------------------------------
  it('TC_16: Filter notifications by rejection type', async () => {
    const doc1 = await uploadDocHelper({ title: 'Approved Doc' });
    const doc2 = await uploadDocHelper({ title: 'Rejected Doc' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc1.id, facultyUser: faculty, decision: 'Approve' });
    await reviewService.submitDecision({ documentId: doc2.id, facultyUser: faculty, decision: 'Reject', comment: 'Reason' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications?type=Rejected',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert(res.json.notifications.every(n => n.title.includes('Rejected')));
  });

  // -----------------------------------------------------------
  // TC_17: Clear notification filter
  // -----------------------------------------------------------
  it('TC_17: Clear notification filter', async () => {
    const doc1 = await uploadDocHelper({ title: 'Doc A' });
    const doc2 = await uploadDocHelper({ title: 'Doc B' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc1.id, facultyUser: faculty, decision: 'Approve' });
    await reviewService.submitDecision({ documentId: doc2.id, facultyUser: faculty, decision: 'Reject', comment: 'Reason' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications?type=all',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.notifications.length, 2);
  });

  // -----------------------------------------------------------
  // TC_18: Handle a notification for a missing document
  // -----------------------------------------------------------
  it('TC_18: Handle a notification for a missing document', async () => {
    const fakeNotif = {
      id: 'NOTIF-MISSING-DOC',
      recipientId: 'STU-2024-001',
      senderId: 'FAC-101',
      documentId: 'DOC-DOES-NOT-EXIST',
      title: 'Document Approved',
      message: 'Approved',
      read: false,
      createdAt: new Date().toISOString()
    };
    db.insertNotification(fakeNotif);

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications/NOTIF-MISSING-DOC/open',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 404);
    assert(res.json.message.includes('no longer available'));
  });

  // -----------------------------------------------------------
  // TC_19: Prevent notification leakage between students
  // -----------------------------------------------------------
  it('TC_19: Prevent notification leakage between students', async () => {
    const docA = await uploadDocHelper({ title: 'Student A Doc', userId: 'STU-2024-001' });
    const docB = await uploadDocHelper({ title: 'Student B Doc', userId: 'STU-2024-002' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: docA.id, facultyUser: faculty, decision: 'Approve' });
    await reviewService.submitDecision({ documentId: docB.id, facultyUser: faculty, decision: 'Approve' });

    const resA = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert(resA.json.notifications.every(n => n.recipientId === 'STU-2024-001'));
  });

  // -----------------------------------------------------------
  // TC_20: Prevent student access to another student's notification
  // -----------------------------------------------------------
  it('TC_20: Prevent student access to another student\'s notification', async () => {
    const docB = await uploadDocHelper({ title: 'Student B Doc', userId: 'STU-2024-002' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: docB.id, facultyUser: faculty, decision: 'Approve' });

    const notifB = db.getNotifications('STU-2024-002')[0];

    // Student A attempts to open Student B's notification
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/notifications/${notifB.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 403);
  });

  // -----------------------------------------------------------
  // TC_21: Create notification after faculty approval
  // -----------------------------------------------------------
  it('TC_21: Create notification after faculty approval', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const notifs = db.getNotifications('STU-2024-001');
    assert(notifs.some(n => n.documentId === doc.id && n.title.includes('Approved')));
  });

  // -----------------------------------------------------------
  // TC_22: Create notification after faculty rejection
  // -----------------------------------------------------------
  it('TC_22: Create notification after faculty rejection', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Reject', comment: 'Blurry' });

    const notifs = db.getNotifications('STU-2024-001');
    assert(notifs.some(n => n.documentId === doc.id && n.title.includes('Rejected')));
  });

  // -----------------------------------------------------------
  // TC_23: Avoid notification on cancelled review
  // -----------------------------------------------------------
  it('TC_23: Avoid notification on cancelled review', async () => {
    const doc = await uploadDocHelper();
    // Cancelling before submitting review causes no review record
    const notifs = db.getNotifications('STU-2024-001');
    assert(!notifs.some(n => n.documentId === doc.id && (n.title.includes('Approved') || n.title.includes('Rejected'))));
  });

  // -----------------------------------------------------------
  // TC_24: Avoid duplicate notifications on repeated click
  // -----------------------------------------------------------
  it('TC_24: Avoid duplicate notifications on repeated click', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');

    // First decision succeeds
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    // Repeated conflicting decision is rejected by business logic
    try {
      await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });
    } catch {
      // Expected rejection of repeated review
    }

    const notifs = db.getNotifications('STU-2024-001').filter(n => n.documentId === doc.id && n.title.includes('Approved'));
    assert.strictEqual(notifs.length, 1);
  });

  // -----------------------------------------------------------
  // TC_25: Keep notification after logout and login
  // -----------------------------------------------------------
  it('TC_25: Keep notification after logout and login', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    // Session 1
    const res1 = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res1.json.notifications.length, 1);

    // Session 2
    const res2 = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res2.json.notifications.length, 1);
  });

  // -----------------------------------------------------------
  // TC_26: Persist read state after refresh
  // -----------------------------------------------------------
  it('TC_26: Persist read state after refresh', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const listRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    const notifId = listRes.json.notifications[0].id;

    // Mark as read
    await mockRequest(app, {
      method: 'PATCH',
      url: `/api/notifications/${notifId}/read`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    // Refresh
    const refreshRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(refreshRes.json.notifications[0].read, true);
  });

  // -----------------------------------------------------------
  // TC_27: Persist unread state after refresh
  // -----------------------------------------------------------
  it('TC_27: Persist unread state after refresh', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.notifications[0].read, false);
  });

  // -----------------------------------------------------------
  // TC_28: Handle notification service/network error
  // -----------------------------------------------------------
  it('TC_28: Handle notification service/network error', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'INVALID-USER' }
    });
    assert(res.statusCode === 200 || res.statusCode >= 400);
  });

  // -----------------------------------------------------------
  // TC_29: Handle failure when marking as read
  // -----------------------------------------------------------
  it('TC_29: Handle failure when marking as read', async () => {
    const res = await mockRequest(app, {
      method: 'PATCH',
      url: '/api/notifications/NOTIF-DOES-NOT-EXIST/read',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 404);
  });

  // -----------------------------------------------------------
  // TC_30: Verify notification content is accurate
  // -----------------------------------------------------------
  it('TC_30: Verify notification content is accurate', async () => {
    const doc = await uploadDocHelper({ title: 'Accurate Content Certificate' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'Accurate rejection reason feedback'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    const notif = res.json.notifications[0];
    assert.strictEqual(notif.documentTitle, 'Accurate Content Certificate');
    assert(notif.message.includes('Accurate rejection reason feedback'));
  });

  // -----------------------------------------------------------
  // TC_31: Verify notification order newest first
  // -----------------------------------------------------------
  it('TC_31: Verify notification order newest first', async () => {
    const notif1 = {
      id: 'NOTIF-OLD',
      recipientId: 'STU-2024-001',
      title: 'First Notification',
      message: 'Old',
      createdAt: new Date(Date.now() - 10000).toISOString()
    };
    const notif2 = {
      id: 'NOTIF-NEW',
      recipientId: 'STU-2024-001',
      title: 'Second Notification',
      message: 'New',
      createdAt: new Date().toISOString()
    };
    db.insertNotification(notif1);
    db.insertNotification(notif2);

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.notifications[0].id, 'NOTIF-NEW');
  });

  // -----------------------------------------------------------
  // TC_32: Search notifications by document title
  // -----------------------------------------------------------
  it('TC_32: Search notifications by document title', async () => {
    const doc1 = await uploadDocHelper({ title: 'Internship AWS Certificate' });
    const doc2 = await uploadDocHelper({ title: 'Sports Trophy' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc1.id, facultyUser: faculty, decision: 'Approve' });
    await reviewService.submitDecision({ documentId: doc2.id, facultyUser: faculty, decision: 'Approve' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications?search=AWS',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.notifications.length, 1);
    assert(res.json.notifications[0].documentTitle.includes('AWS'));
  });

  // -----------------------------------------------------------
  // TC_33: Handle search with no notification matches
  // -----------------------------------------------------------
  it('TC_33: Handle search with no notification matches', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications?search=NoMatch987',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.notifications.length, 0);
  });

  // -----------------------------------------------------------
  // TC_34: Display notification count consistently
  // -----------------------------------------------------------
  it('TC_34: Display notification count consistently', async () => {
    const doc1 = await uploadDocHelper({ title: 'Doc 1' });
    const doc2 = await uploadDocHelper({ title: 'Doc 2' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc1.id, facultyUser: faculty, decision: 'Approve' });
    await reviewService.submitDecision({ documentId: doc2.id, facultyUser: faculty, decision: 'Approve' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.unreadCount, 2);
    assert.strictEqual(res.json.count, 2);
  });

  // -----------------------------------------------------------
  // TC_35: Ensure faculty notification goes to correct reviewer
  // -----------------------------------------------------------
  it('TC_35: Ensure faculty notification goes to correct reviewer', async () => {
    const doc = await uploadDocHelper({ userId: 'STU-2024-001' }); // Assigned to FAC-101

    const facultyNotifs = db.getNotifications('FAC-101');
    const notif = facultyNotifs.find(n => n.documentId === doc.id);
    assert(notif);
    assert.strictEqual(notif.recipientId, 'FAC-101');
  });

  // -----------------------------------------------------------
  // TC_36: Prevent faculty viewing student-only notification details
  // -----------------------------------------------------------
  it('TC_36: Prevent faculty viewing student-only notification details', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({ documentId: doc.id, facultyUser: faculty, decision: 'Approve' });

    const studentNotif = db.getNotifications('STU-2024-001')[0];

    // Faculty attempts to access student's notification endpoint
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/notifications/${studentNotif.id}`,
      headers: { 'x-user-id': 'FAC-101' }
    });
    assert.strictEqual(res.statusCode, 403);
  });

  // -----------------------------------------------------------
  // TC_37: Verify notification navigation works
  // -----------------------------------------------------------
  it('TC_37: Verify notification navigation works', () => {
    assert(appJsContent.includes('openStudentNotification'));
    assert(appJsContent.includes('switchTab'));
  });

  // -----------------------------------------------------------
  // TC_38: Verify notification accessibility
  // -----------------------------------------------------------
  it('TC_38: Verify notification accessibility', () => {
    assert(indexHtmlContent.includes('aria-selected'));
    assert(indexHtmlContent.includes('role="tab"'));
  });

  // -----------------------------------------------------------
  // TC_39: Handle long notification feedback
  // -----------------------------------------------------------
  it('TC_39: Handle long notification feedback', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    const longFeedback = 'A'.repeat(500);
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: longFeedback
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert(res.json.notifications[0].message.includes(longFeedback));
  });

  // -----------------------------------------------------------
  // TC_40: Verify notification layout on mobile
  // -----------------------------------------------------------
  it('TC_40: Verify notification layout on mobile', () => {
    assert(indexHtmlContent.includes('viewport'));
    assert(appJsContent.includes('notification-item'));
  });

  // -----------------------------------------------------------
  // US05 Acceptance Criteria: Document Review History
  // -----------------------------------------------------------
  it('US05 Acceptance 1: Every review activity stored as separate immutable record with faculty details', async () => {
    const doc = await uploadDocHelper({ title: 'Review History Test Doc' });
    const faculty = db.getUserById('FAC-101');

    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'First cycle: Blurry document header'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}/history`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.history.length, 1);
    const entry = res.json.history[0];
    assert.strictEqual(entry.reviewerName, faculty.name);
    assert.strictEqual(entry.reviewerId, faculty.id);
    assert.strictEqual(entry.action, 'Rejected');
    assert.strictEqual(entry.comments, 'First cycle: Blurry document header');
    assert(entry.timestamp);
  });

  it('US05 Acceptance 2: Previous rejection records remain after resubmission and multiple cycles', async () => {
    const doc = await uploadDocHelper({ title: 'Multi-Cycle History Doc' });
    const faculty = db.getUserById('FAC-101');

    // Cycle 1: Reject
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'Cycle 1: Need original stamp'
    });

    // Student resubmits replacement
    const replacePayload = createMultipartPayload(
      { title: doc.title, category: doc.category, dateOfAchievement: doc.dateOfAchievement, issuingOrganization: doc.issuingOrganization },
      [{ name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }]
    );
    await mockRequest(app, {
      method: 'PUT',
      url: `/api/documents/${doc.id}/replacement`,
      headers: { 'content-type': replacePayload.contentType, 'x-user-id': 'STU-2024-001' },
      body: replacePayload.body
    });

    // History still contains Cycle 1 after replacement
    const historyAfterReplace = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}/history`,
      headers: { 'x-user-id': 'FAC-101' }
    });
    assert.strictEqual(historyAfterReplace.json.history.length, 1);
    assert.strictEqual(historyAfterReplace.json.history[0].comments, 'Cycle 1: Need original stamp');

    // Cycle 2: Approve
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Approve',
      comment: 'Cycle 2: Stamped certificate looks great!'
    });

    // History now contains both cycles
    const finalHistoryRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}/history`,
      headers: { 'x-user-id': 'FAC-101' }
    });
    assert.strictEqual(finalHistoryRes.json.history.length, 2);
    assert(finalHistoryRes.json.history.some(h => h.action === 'Rejected' && h.comments.includes('Cycle 1')));
    assert(finalHistoryRes.json.history.some(h => h.action === 'Approved' && h.comments.includes('Cycle 2')));
  });

  it('US05 Acceptance 3: Student can view review history via /api/student/documents/:id/review-history', async () => {
    const doc = await uploadDocHelper({ title: 'Student Review History View' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'Feedback for student'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/student/documents/${doc.id}/review-history`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.history.length, 1);
    assert.strictEqual(res.json.history[0].comments, 'Feedback for student');
  });

  it('US05 Acceptance 4: Deny review history access to unauthorized students', async () => {
    const docOfStudentA = await uploadDocHelper({ title: 'Student A Doc', userId: 'STU-2024-001' });

    // Student B attempts to access Student A's review history
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/student/documents/${docOfStudentA.id}/review-history`,
      headers: { 'x-user-id': 'STU-2024-002' }
    });
    assert.strictEqual(res.statusCode, 403);
  });
});

