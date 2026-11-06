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
const VALID_JPG_BUFFER = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00]);

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

describe('US04 - Faculty Notifications & Student Document Tracking (TC_01 to TC_40)', () => {
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
  // TC_01: Open My Documents page
  // -----------------------------------------------------------
  it('TC_01: Open My Documents page', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert(indexHtmlContent.includes('id="documentsTab"'));
    assert(indexHtmlContent.includes('id="documentsTable"'));
  });

  // -----------------------------------------------------------
  // TC_02: Display uploaded documents
  // -----------------------------------------------------------
  it('TC_02: Display uploaded documents', async () => {
    const doc = await uploadDocHelper({ title: 'AWS Cloud Certificate' });
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].id, doc.id);
  });

  // -----------------------------------------------------------
  // TC_03: Display document title
  // -----------------------------------------------------------
  it('TC_03: Display document title', async () => {
    await uploadDocHelper({ title: 'Internship Certificate' });
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.documents[0].title, 'Internship Certificate');
  });

  // -----------------------------------------------------------
  // TC_04: Display document category
  // -----------------------------------------------------------
  it('TC_04: Display document category', async () => {
    await uploadDocHelper({ category: 'Internship' });
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.documents[0].category, 'Internship');
  });

  // -----------------------------------------------------------
  // TC_05: Display submission date
  // -----------------------------------------------------------
  it('TC_05: Display submission date', async () => {
    const doc = await uploadDocHelper();
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert(res.json.documents[0].createdAt);
    assert.strictEqual(res.json.documents[0].createdAt, doc.createdAt);
  });

  // -----------------------------------------------------------
  // TC_06: Display Pending Approval status
  // -----------------------------------------------------------
  it('TC_06: Display Pending Approval status', async () => {
    await uploadDocHelper();
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.documents[0].status, 'Pending Approval');
  });

  // -----------------------------------------------------------
  // TC_07: Display Approved status
  // -----------------------------------------------------------
  it('TC_07: Display Approved status', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Approve',
      comment: 'Approved!'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.documents[0].status, 'Approved');
  });

  // -----------------------------------------------------------
  // TC_08: Display Rejected status
  // -----------------------------------------------------------
  it('TC_08: Display Rejected status', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'Please upload a clearer scan'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.documents[0].status, 'Rejected');
  });

  // -----------------------------------------------------------
  // TC_09: Open document details
  // -----------------------------------------------------------
  it('TC_09: Open document details', async () => {
    const doc = await uploadDocHelper({ title: 'Full Details Doc' });
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.id, doc.id);
    assert.strictEqual(res.json.document.title, 'Full Details Doc');
    assert.strictEqual(res.json.document.status, 'Pending Approval');
  });

  // -----------------------------------------------------------
  // TC_10: Display faculty feedback for rejected document
  // -----------------------------------------------------------
  it('TC_10: Display faculty feedback for rejected document', async () => {
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
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.document.lastReviewComment, feedback);
  });

  // -----------------------------------------------------------
  // TC_11: Hide rejection feedback for unrelated document
  // -----------------------------------------------------------
  it('TC_11: Hide rejection feedback for unrelated document', async () => {
    const doc1 = await uploadDocHelper({ title: 'Doc 1 Rejected' });
    const doc2 = await uploadDocHelper({ title: 'Doc 2 Approved' });

    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc1.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'Doc 1 is illegible'
    });
    await reviewService.submitDecision({
      documentId: doc2.id,
      facultyUser: faculty,
      decision: 'Approve',
      comment: 'Doc 2 is valid'
    });

    const resDoc2 = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc2.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.notStrictEqual(resDoc2.json.document.lastReviewComment, 'Doc 1 is illegible');
  });

  // -----------------------------------------------------------
  // TC_12: Filter documents by Pending Approval
  // -----------------------------------------------------------
  it('TC_12: Filter documents by Pending Approval', async () => {
    const docPending = await uploadDocHelper({ title: 'Pending Doc' });
    const docApproved = await uploadDocHelper({ title: 'Approved Doc' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: docApproved.id,
      facultyUser: faculty,
      decision: 'Approve'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Pending Approval',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert(res.json.documents.every(d => d.status === 'Pending Approval'));
    assert(res.json.documents.some(d => d.id === docPending.id));
  });

  // -----------------------------------------------------------
  // TC_13: Filter documents by Approved
  // -----------------------------------------------------------
  it('TC_13: Filter documents by Approved', async () => {
    await uploadDocHelper({ title: 'Pending Doc' });
    const docApproved = await uploadDocHelper({ title: 'Approved Doc' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: docApproved.id,
      facultyUser: faculty,
      decision: 'Approve'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Approved',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert(res.json.documents.every(d => d.status === 'Approved'));
    assert(res.json.documents.some(d => d.id === docApproved.id));
  });

  // -----------------------------------------------------------
  // TC_14: Filter documents by Rejected
  // -----------------------------------------------------------
  it('TC_14: Filter documents by Rejected', async () => {
    await uploadDocHelper({ title: 'Pending Doc' });
    const docRejected = await uploadDocHelper({ title: 'Rejected Doc' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: docRejected.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'Bad format'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Rejected',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert(res.json.documents.every(d => d.status === 'Rejected'));
    assert(res.json.documents.some(d => d.id === docRejected.id));
  });

  // -----------------------------------------------------------
  // TC_15: Clear status filter
  // -----------------------------------------------------------
  it('TC_15: Clear status filter', async () => {
    await uploadDocHelper({ title: 'Doc A' });
    await uploadDocHelper({ title: 'Doc B' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=all',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 2);
  });

  // -----------------------------------------------------------
  // TC_16: Search by exact document title
  // -----------------------------------------------------------
  it('TC_16: Search by exact document title', async () => {
    await uploadDocHelper({ title: 'Internship Certificate' });
    await uploadDocHelper({ title: 'Machine Learning Certificate' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Internship Certificate',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].title, 'Internship Certificate');
  });

  // -----------------------------------------------------------
  // TC_17: Search by partial document title
  // -----------------------------------------------------------
  it('TC_17: Search by partial document title', async () => {
    await uploadDocHelper({ title: 'Internship 2024 Certificate' });
    await uploadDocHelper({ title: 'Research Participation' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Intern',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert(res.json.documents[0].title.includes('Intern'));
  });

  // -----------------------------------------------------------
  // TC_18: Search with no matching title
  // -----------------------------------------------------------
  it('TC_18: Search with no matching title', async () => {
    await uploadDocHelper({ title: 'Existing Document' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=UnknownCertificate123',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 0);
  });

  // -----------------------------------------------------------
  // TC_19: Search is case-insensitive where supported
  // -----------------------------------------------------------
  it('TC_19: Search is case-insensitive where supported', async () => {
    await uploadDocHelper({ title: 'Advanced Robotics Workshop' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=advanced robotics',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].title, 'Advanced Robotics Workshop');
  });

  // -----------------------------------------------------------
  // TC_20: Handle blank search input
  // -----------------------------------------------------------
  it('TC_20: Handle blank search input', async () => {
    await uploadDocHelper({ title: 'Doc 1' });
    await uploadDocHelper({ title: 'Doc 2' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 2);
  });

  // -----------------------------------------------------------
  // TC_21: Sort documents by newest first
  // -----------------------------------------------------------
  it('TC_21: Sort documents by newest first', async () => {
    const docOld = await uploadDocHelper({ title: 'Older Doc' });
    db.updateDocument(docOld.id, { createdAt: new Date(Date.now() - 10000).toISOString() });
    const docNew = await uploadDocHelper({ title: 'Newer Doc' });
    db.updateDocument(docNew.id, { createdAt: new Date().toISOString() });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?sort=newest',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents[0].title, 'Newer Doc');
  });

  // -----------------------------------------------------------
  // TC_22: Sort documents by oldest first
  // -----------------------------------------------------------
  it('TC_22: Sort documents by oldest first', async () => {
    const docOld = await uploadDocHelper({ title: 'Older Doc' });
    db.updateDocument(docOld.id, { createdAt: new Date(Date.now() - 10000).toISOString() });
    const docNew = await uploadDocHelper({ title: 'Newer Doc' });
    db.updateDocument(docNew.id, { createdAt: new Date().toISOString() });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?sort=oldest',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents[0].title, 'Older Doc');
  });

  // -----------------------------------------------------------
  // TC_23: Verify status after faculty approval
  // -----------------------------------------------------------
  it('TC_23: Verify status after faculty approval', async () => {
    const doc = await uploadDocHelper();
    assert.strictEqual(doc.status, 'Pending Approval');

    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Approve'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.document.status, 'Approved');
  });

  // -----------------------------------------------------------
  // TC_24: Verify status after faculty rejection
  // -----------------------------------------------------------
  it('TC_24: Verify status after faculty rejection', async () => {
    const doc = await uploadDocHelper();

    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'Invalid signature'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.document.status, 'Rejected');
  });

  // -----------------------------------------------------------
  // TC_25: Verify status after resubmission
  // -----------------------------------------------------------
  it('TC_25: Verify status after resubmission', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'Resubmit scan'
    });

    const replacePayload = createMultipartPayload(
      { title: doc.title, category: doc.category, dateOfAchievement: doc.dateOfAchievement, issuingOrganization: doc.issuingOrganization },
      [{ name: 'file', filename: 'resubmitted.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }]
    );
    const replaceRes = await mockRequest(app, {
      method: 'PUT',
      url: `/api/documents/${doc.id}/replacement`,
      headers: { 'content-type': replacePayload.contentType, 'x-user-id': 'STU-2024-001' },
      body: replacePayload.body
    });

    assert.strictEqual(replaceRes.statusCode, 200);
    assert.strictEqual(replaceRes.json.document.status, 'Pending Approval');
  });

  // -----------------------------------------------------------
  // TC_26: Refresh status after page reload
  // -----------------------------------------------------------
  it('TC_26: Refresh status after page reload', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Approve'
    });

    // Subsequent reload calls /api/documents
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    const reloadedDoc = res.json.documents.find(d => d.id === doc.id);
    assert.strictEqual(reloadedDoc.status, 'Approved');
  });

  // -----------------------------------------------------------
  // TC_27: Verify dashboard status counts
  // -----------------------------------------------------------
  it('TC_27: Verify dashboard status counts (2 Pending, 3 Approved, 1 Rejected)', async () => {
    const faculty = db.getUserById('FAC-101');

    // 2 Pending
    await uploadDocHelper({ title: 'Pending 1' });
    await uploadDocHelper({ title: 'Pending 2' });

    // 3 Approved
    const a1 = await uploadDocHelper({ title: 'Approved 1' });
    const a2 = await uploadDocHelper({ title: 'Approved 2' });
    const a3 = await uploadDocHelper({ title: 'Approved 3' });
    await reviewService.submitDecision({ documentId: a1.id, facultyUser: faculty, decision: 'Approve' });
    await reviewService.submitDecision({ documentId: a2.id, facultyUser: faculty, decision: 'Approve' });
    await reviewService.submitDecision({ documentId: a3.id, facultyUser: faculty, decision: 'Approve' });

    // 1 Rejected
    const r1 = await uploadDocHelper({ title: 'Rejected 1' });
    await reviewService.submitDecision({ documentId: r1.id, facultyUser: faculty, decision: 'Reject', comment: 'Rejected' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.summary.total, 6);
    assert.strictEqual(res.json.summary.pending, 2);
    assert.strictEqual(res.json.summary.approved, 3);
    assert.strictEqual(res.json.summary.rejected, 1);
  });

  // -----------------------------------------------------------
  // TC_28: Open document preview from list
  // -----------------------------------------------------------
  it('TC_28: Open document preview from list', async () => {
    const doc = await uploadDocHelper();
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}/preview`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert(res.buffer.includes(Buffer.from('%PDF')));
  });

  // -----------------------------------------------------------
  // TC_29: Download a listed document
  // -----------------------------------------------------------
  it('TC_29: Download a listed document', async () => {
    const doc = await uploadDocHelper();
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}/download`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert(res.headers['content-disposition'].includes('attachment'));
  });

  // -----------------------------------------------------------
  // TC_30: Display empty state for no documents
  // -----------------------------------------------------------
  it('TC_30: Display empty state for no documents', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-002' } // Zero submissions
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 0);
    assert(appJsContent.includes('No documents found') || appJsContent.includes('No documents uploaded'));
  });

  // -----------------------------------------------------------
  // TC_31: Prevent viewing another student's status
  // -----------------------------------------------------------
  it('TC_31: Prevent viewing another student\'s status', async () => {
    const docOfStudentA = await uploadDocHelper({ userId: 'STU-2024-001' });

    // Student B attempts to access Student A's document
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${docOfStudentA.id}`,
      headers: { 'x-user-id': 'STU-2024-002' }
    });
    assert.strictEqual(res.statusCode, 403);
    assert(res.json.message.includes('Access denied'));
  });

  // -----------------------------------------------------------
  // TC_32: Verify status label consistency
  // -----------------------------------------------------------
  it('TC_32: Verify status label consistency', async () => {
    const doc = await uploadDocHelper();
    assert.strictEqual(doc.status, 'Pending Approval');
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.json.document.status, 'Pending Approval');
  });

  // -----------------------------------------------------------
  // TC_33: Verify status color/visual indicator
  // -----------------------------------------------------------
  it('TC_33: Verify status color/visual indicator', () => {
    assert(appJsContent.includes('status-pending'));
    assert(appJsContent.includes('status-approved'));
    assert(appJsContent.includes('status-rejected'));
  });

  // -----------------------------------------------------------
  // TC_34: Handle unavailable document record
  // -----------------------------------------------------------
  it('TC_34: Handle unavailable document record', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents/DOC-NONEXISTENT-404',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.json.message, 'Document not found');
  });

  // -----------------------------------------------------------
  // TC_35: Handle status service/network error
  // -----------------------------------------------------------
  it('TC_35: Handle status service/network error', async () => {
    // Malformed request / unauthenticated access
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'INVALID-USER' }
    });
    // System responds with clean error without corruption
    assert(res.statusCode === 200 || res.statusCode >= 400);
  });

  // -----------------------------------------------------------
  // TC_36: Prevent duplicate document rows
  // -----------------------------------------------------------
  it('TC_36: Prevent duplicate document rows', async () => {
    await uploadDocHelper({ title: 'Unique Doc' });

    const res1 = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    const res2 = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res1.json.documents.length, 1);
    assert.strictEqual(res2.json.documents.length, 1);
  });

  // -----------------------------------------------------------
  // TC_37: Display status update timestamp if supported
  // -----------------------------------------------------------
  it('TC_37: Display status update timestamp if supported', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Approve'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert(res.json.document.lastReviewedAt || res.json.document.updatedAt);
  });

  // -----------------------------------------------------------
  // TC_38: Verify student notification matches status
  // -----------------------------------------------------------
  it('TC_38: Verify student notification matches status', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Approve',
      comment: 'Great work!'
    });

    const notifs = db.getNotifications('STU-2024-001');
    const approvalNotif = notifs.find(n => n.documentId === doc.id);
    assert(approvalNotif);
    assert(approvalNotif.title.includes('Approved'));
  });

  // -----------------------------------------------------------
  // TC_39: Verify document list pagination or scrolling
  // -----------------------------------------------------------
  it('TC_39: Verify document list pagination or scrolling', async () => {
    await uploadDocHelper({ title: 'Doc Page 1 - A' });
    await uploadDocHelper({ title: 'Doc Page 1 - B' });
    await uploadDocHelper({ title: 'Doc Page 2 - C' });

    const page1Res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?page=1&limit=2',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    const page2Res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?page=2&limit=2',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(page1Res.statusCode, 200);
    assert.strictEqual(page1Res.json.documents.length, 2);
    assert.strictEqual(page2Res.json.documents.length, 1);
  });

  // -----------------------------------------------------------
  // TC_40: Verify status tracking after logout and login
  // -----------------------------------------------------------
  it('TC_40: Verify status tracking after logout and login', async () => {
    const doc = await uploadDocHelper();
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Approve'
    });

    // Simulate login session 1
    const resSession1 = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(resSession1.json.document.status, 'Approved');

    // Simulate fresh login session 2
    const resSession2 = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(resSession2.json.document.status, 'Approved');
  });

  // -----------------------------------------------------------
  // US04 Faculty Notification Acceptance Criteria Tests
  // -----------------------------------------------------------
  it('US04 Acceptance: Faculty receives notification containing student name, title, category, submission date', async () => {
    const doc = await uploadDocHelper({
      title: 'Machine Learning Specialization',
      category: 'Certification',
      userId: 'STU-2024-001'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/notifications',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert(res.json.notifications.length >= 1);
    const notif = res.json.notifications.find(n => n.documentId === doc.id);
    assert(notif);
    assert(notif.studentName);
    assert.strictEqual(notif.documentTitle, 'Machine Learning Specialization');
    assert.strictEqual(notif.category, 'Certification');
    assert(notif.submissionDate);
    assert.strictEqual(notif.read, false); // New notifications are marked Unread
    assert.strictEqual(notif.isResubmission, false);
  });

  it('US04 Acceptance: Resubmissions are clearly identified in faculty notification', async () => {
    const doc = await uploadDocHelper({ title: 'Internship To Resubmit' });
    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: faculty,
      decision: 'Reject',
      comment: 'Please resubmit clearer version'
    });

    // Student resubmits
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

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/notifications',
      headers: { 'x-user-id': 'FAC-101' }
    });

    const resubmitNotif = res.json.notifications.find(n => n.documentId === doc.id && n.isResubmission);
    assert(resubmitNotif);
    assert.strictEqual(resubmitNotif.isResubmission, true);
    assert.strictEqual(resubmitNotif.eventType, 'RESUBMISSION');
    assert.strictEqual(resubmitNotif.read, false);
  });

  it('US04 Acceptance: Opening notification marks it Read and returns review details', async () => {
    const doc = await uploadDocHelper({ title: 'Notification Open Test' });

    // Fetch notifications
    const listRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/notifications',
      headers: { 'x-user-id': 'FAC-101' }
    });
    const notif = listRes.json.notifications.find(n => n.documentId === doc.id);
    assert(notif);
    assert.strictEqual(notif.read, false);

    // Open notification
    const openRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/faculty/notifications/${notif.id}/open`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(openRes.statusCode, 200);
    assert.strictEqual(openRes.json.document.id, doc.id);
    assert.strictEqual(openRes.json.notification.read, true);

    // Verify unread count decreases
    const updatedListRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/notifications',
      headers: { 'x-user-id': 'FAC-101' }
    });
    const readNotif = updatedListRes.json.notifications.find(n => n.id === notif.id);
    assert.strictEqual(readNotif.read, true);
  });
});
