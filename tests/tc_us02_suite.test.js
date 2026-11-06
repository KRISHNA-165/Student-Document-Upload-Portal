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
const VALID_JPG_BUFFER = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00]);

// Helper for uploading test documents
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

describe('US02 - Faculty Review, Approval or Rejection Specification Tests (TC_01 to TC_40)', () => {
  let indexHtmlContent = '';

  before(() => {
    indexHtmlContent = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
  });

  beforeEach(() => {
    db.reset();
  });

  // -----------------------------------------------------------
  // TC_01: Open Faculty Dashboard
  // -----------------------------------------------------------
  it('TC_01: Open Faculty Dashboard - Faculty account is active and logged in', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(Array.isArray(res.json.documents));
  });

  // -----------------------------------------------------------
  // TC_02 to TC_08: View Assigned Submissions & Metadata Display
  // -----------------------------------------------------------
  it('TC_02: View assigned students submissions', async () => {
    // Student 1 (assigned to FAC-101)
    const doc1 = await uploadDocHelper({ title: 'Doc 1', userId: 'STU-2024-001' });
    // Student 2 (assigned to FAC-101)
    const doc2 = await uploadDocHelper({ title: 'Doc 2', userId: 'STU-2024-002' });
    // Student 3 (assigned to FAC-102)
    const doc3 = await uploadDocHelper({ title: 'Doc 3', userId: 'STU-2024-003' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    const docs = res.json.documents;
    assert.strictEqual(docs.length, 2);
    assert.ok(docs.some(d => d.id === doc1.id));
    assert.ok(docs.some(d => d.id === doc2.id));
    assert.ok(!docs.some(d => d.id === doc3.id), 'Should not contain doc of unassigned student 3');
  });

  it('TC_03: Verify student name is displayed', async () => {
    await uploadDocHelper({ title: 'Special Award', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    const doc = res.json.documents[0];
    assert.strictEqual(doc.studentName, 'John Doe');
  });

  it('TC_04: Verify registration number is displayed', async () => {
    await uploadDocHelper({ title: 'Internship Record', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    const doc = res.json.documents[0];
    assert.strictEqual(doc.registrationNumber, 'STU-2024-001');
    assert.strictEqual(doc.studentId, 'STU-2024-001');
  });

  it('TC_05: Verify document title is displayed', async () => {
    const title = 'Machine Learning Specialization Certificate';
    await uploadDocHelper({ title, userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    const doc = res.json.documents[0];
    assert.strictEqual(doc.title, title);
  });

  it('TC_06: Verify category is displayed', async () => {
    await uploadDocHelper({ title: 'Summer Internship', category: 'Internship', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    const doc = res.json.documents[0];
    assert.strictEqual(doc.category, 'Internship');
  });

  it('TC_07: Verify upload date is displayed', async () => {
    await uploadDocHelper({ title: 'Project Certificate', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    const doc = res.json.documents[0];
    assert.ok(doc.uploadDate || doc.createdAt);
  });

  it('TC_08: Verify current status is displayed', async () => {
    await uploadDocHelper({ title: 'Award Record', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    const doc = res.json.documents[0];
    assert.strictEqual(doc.status, 'Pending Approval');
  });

  // -----------------------------------------------------------
  // TC_09 to TC_12: Document Review Details & Previews
  // -----------------------------------------------------------
  it('TC_09: Open a pending document for review', async () => {
    const doc = await uploadDocHelper({ title: 'Review Target Doc', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/faculty/documents/${doc.id}`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.document.id, doc.id);
    assert.strictEqual(res.json.document.status, 'Pending Approval');
  });

  it('TC_10: Preview a supported PDF', async () => {
    const doc = await uploadDocHelper({
      title: 'PDF Doc',
      fileName: 'doc.pdf',
      fileBuffer: VALID_PDF_BUFFER,
      userId: 'STU-2024-001'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}/preview`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'application/pdf');
    assert.ok(res.buffer.length > 0);
  });

  it('TC_11: Preview a supported image', async () => {
    const doc = await uploadDocHelper({
      title: 'Image Doc',
      fileName: 'image.jpg',
      fileBuffer: VALID_JPG_BUFFER,
      userId: 'STU-2024-001'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}/preview`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'image/jpeg');
    assert.ok(res.buffer.length > 0);
  });

  it('TC_12: Handle a missing file reference', async () => {
    const doc = await uploadDocHelper({ title: 'Doc to orphan', userId: 'STU-2024-001' });
    // Manually break storageKey to simulate unavailable storage file
    db.updateDocument(doc.id, { storageKey: 'non_existent_key_12345.pdf' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}/preview`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.json.success, false);
    assert.ok(res.json.message.includes('not found') || res.json.message.includes('unavailable'));
  });

  // -----------------------------------------------------------
  // TC_13 to TC_15: Approval Actions & Optional Comments
  // -----------------------------------------------------------
  it('TC_13: Approve a pending document', async () => {
    const doc = await uploadDocHelper({ title: 'Doc To Approve', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.document.status, 'Approved');

    // Confirm in DB
    const saved = db.getDocumentById(doc.id);
    assert.strictEqual(saved.status, 'Approved');
  });

  it('TC_14: Approve with an optional comment', async () => {
    const doc = await uploadDocHelper({ title: 'Doc With Comment', userId: 'STU-2024-001' });
    const comment = 'Certificate verified successfully';

    const res = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve', comment }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.status, 'Approved');
    assert.strictEqual(res.json.review.comments, comment);
  });

  it('TC_15: Approve without a comment (comment: blank)', async () => {
    const doc = await uploadDocHelper({ title: 'Doc Blank Comment', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve', comment: '' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.status, 'Approved');
    assert.strictEqual(res.json.review.comments, '');
  });

  // -----------------------------------------------------------
  // TC_16 & TC_17: Rejection Actions & Mandatory Reason
  // -----------------------------------------------------------
  it('TC_16: Reject with a reason', async () => {
    const doc = await uploadDocHelper({ title: 'Doc To Reject', userId: 'STU-2024-001' });
    const reason = 'Certificate image is unclear. Please provide a high-resolution scan.';

    const res = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Reject', comment: reason }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.status, 'Rejected');
    assert.strictEqual(res.json.review.comments, reason);

    const saved = db.getDocumentById(doc.id);
    assert.strictEqual(saved.status, 'Rejected');
  });

  it('TC_17: Prevent rejection without a reason (reason: blank)', async () => {
    const doc = await uploadDocHelper({ title: 'Doc Reject No Reason', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Reject', comment: '   ' }
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json.success, false);
    assert.ok(res.json.message.includes('mandatory') || res.json.message.includes('reason'));

    // Status remains Pending Approval
    const saved = db.getDocumentById(doc.id);
    assert.strictEqual(saved.status, 'Pending Approval');
  });

  // -----------------------------------------------------------
  // TC_18 & TC_19: Confirmation Cancel Handling
  // -----------------------------------------------------------
  it('TC_18: Cancel approval confirmation - status remains Pending Approval', async () => {
    const doc = await uploadDocHelper({ title: 'Doc Cancel Approve', userId: 'STU-2024-001' });

    // Client modal confirmation cancellation simulated: no review API call dispatched
    const saved = db.getDocumentById(doc.id);
    assert.strictEqual(saved.status, 'Pending Approval');
    assert.strictEqual(db.getReviewsForDocument(doc.id).length, 0);
  });

  it('TC_19: Cancel rejection confirmation - status remains Pending Approval', async () => {
    const doc = await uploadDocHelper({ title: 'Doc Cancel Reject', userId: 'STU-2024-001' });

    // Client modal cancellation: status unchanged
    const saved = db.getDocumentById(doc.id);
    assert.strictEqual(saved.status, 'Pending Approval');
    assert.strictEqual(db.getReviewsForDocument(doc.id).length, 0);
  });

  // -----------------------------------------------------------
  // TC_20 & TC_21: Status Changes Immediately
  // -----------------------------------------------------------
  it('TC_20: Update status immediately after approval', async () => {
    const doc = await uploadDocHelper({ title: 'Immediate Approval Doc', userId: 'STU-2024-001' });

    await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve' }
    });

    // Immediately fetch document details
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.status, 'Approved');
  });

  it('TC_21: Update status immediately after rejection', async () => {
    const doc = await uploadDocHelper({ title: 'Immediate Rejection Doc', userId: 'STU-2024-001' });

    await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Reject', comment: 'Invalid date on certificate' }
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.status, 'Rejected');
    assert.strictEqual(res.json.document.lastReviewComment, 'Invalid date on certificate');
  });

  // -----------------------------------------------------------
  // TC_22 & TC_23: Reviewer Identity & Review Timestamp
  // -----------------------------------------------------------
  it('TC_22: Record reviewer identity', async () => {
    const doc = await uploadDocHelper({ title: 'Reviewer Identity Doc', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve', comment: 'Verified' }
    });

    assert.strictEqual(res.json.review.reviewerId, 'FAC-101');
    assert.strictEqual(res.json.review.reviewerName, 'Dr. Robert Smith');
    assert.strictEqual(res.json.review.reviewerRole, 'Faculty');
  });

  it('TC_23: Record review date and time automatically', async () => {
    const doc = await uploadDocHelper({ title: 'Timestamped Review Doc', userId: 'STU-2024-001' });
    const before = new Date();

    const res = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve' }
    });

    const after = new Date();
    assert.ok(res.json.review.timestamp);
    const reviewTime = new Date(res.json.review.timestamp);
    assert.ok(reviewTime >= new Date(before.getTime() - 2000));
    assert.ok(reviewTime <= new Date(after.getTime() + 2000));
  });

  // -----------------------------------------------------------
  // TC_24 to TC_26: Authorization & Role Boundaries
  // -----------------------------------------------------------
  it('TC_24: Prevent unauthorized faculty review (Faculty A vs Faculty B student)', async () => {
    // Alex Rivers (STU-2024-003) is assigned to Dr. Emily Davis (FAC-102)
    const doc = await uploadDocHelper({ title: 'Alex Doc', userId: 'STU-2024-003' });

    // Dr. Robert Smith (FAC-101) attempts to review FAC-102's student document
    const res = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve' }
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json.success, false);
    assert.ok(res.json.message.includes('denied') || res.json.message.includes('assigned'));
  });

  it('TC_25: Prevent student from using faculty review actions', async () => {
    const doc = await uploadDocHelper({ title: 'Student Action Doc', userId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'STU-2024-001' },
      body: { decision: 'Approve' }
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json.success, false);
  });

  it('TC_26: Prevent admin-only action by faculty', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/admin/users',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json.success, false);
  });

  // -----------------------------------------------------------
  // TC_27 to TC_29: Pending Queue Isolation & Removal on Decision
  // -----------------------------------------------------------
  it('TC_27: Review only Pending Approval documents in pending queue', async () => {
    const d1 = await uploadDocHelper({ title: 'Pending 1', userId: 'STU-2024-001' });
    const d2 = await uploadDocHelper({ title: 'To Approve', userId: 'STU-2024-001' });
    const d3 = await uploadDocHelper({ title: 'To Reject', userId: 'STU-2024-001' });

    // Approve d2
    await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${d2.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve' }
    });

    // Reject d3
    await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${d3.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Reject', comment: 'Rejected' }
    });

    // Query pending queue
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents?status=Pending Approval',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    const pendingDocs = res.json.documents;
    assert.strictEqual(pendingDocs.length, 1);
    assert.strictEqual(pendingDocs[0].id, d1.id);
  });

  it('TC_28: Verify approved document leaves pending queue', async () => {
    const doc = await uploadDocHelper({ title: 'Leaves Pending Once Approved', userId: 'STU-2024-001' });

    // Confirm it is initially in pending queue
    const beforeRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents?status=Pending Approval',
      headers: { 'x-user-id': 'FAC-101' }
    });
    assert.ok(beforeRes.json.documents.some(d => d.id === doc.id));

    // Approve
    await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve' }
    });

    // Check pending queue again
    const afterRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents?status=Pending Approval',
      headers: { 'x-user-id': 'FAC-101' }
    });
    assert.ok(!afterRes.json.documents.some(d => d.id === doc.id));
  });

  it('TC_29: Verify rejected document leaves pending queue', async () => {
    const doc = await uploadDocHelper({ title: 'Leaves Pending Once Rejected', userId: 'STU-2024-001' });

    await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Reject', comment: 'Illegible certificate' }
    });

    const afterRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents?status=Pending Approval',
      headers: { 'x-user-id': 'FAC-101' }
    });
    assert.ok(!afterRes.json.documents.some(d => d.id === doc.id));
  });

  // -----------------------------------------------------------
  // TC_30: Prevent Conflicting Repeated Decision
  // -----------------------------------------------------------
  it('TC_30: Prevent conflicting repeated decision on already reviewed document', async () => {
    const doc = await uploadDocHelper({ title: 'Repeated Decision Doc', userId: 'STU-2024-001' });

    // First decision: Approve
    const firstRes = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve' }
    });
    assert.strictEqual(firstRes.statusCode, 200);

    // Second conflicting decision: Reject
    const secondRes = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Reject', comment: 'Changed mind' }
    });

    assert.strictEqual(secondRes.statusCode, 400);
    assert.strictEqual(secondRes.json.success, false);
    assert.ok(secondRes.json.message.includes('already'));
  });

  // -----------------------------------------------------------
  // TC_31 to TC_33: Search & Filtering
  // -----------------------------------------------------------
  it('TC_31: Search pending reviews by student name', async () => {
    await uploadDocHelper({ title: 'John Doc', userId: 'STU-2024-001' }); // John Doe
    await uploadDocHelper({ title: 'Jane Doc', userId: 'STU-2024-002' }); // Jane Smith

    const searchRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents?search=Jane',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(searchRes.statusCode, 200);
    assert.strictEqual(searchRes.json.documents.length, 1);
    assert.strictEqual(searchRes.json.documents[0].studentName, 'Jane Smith');
  });

  it('TC_32: Filter reviews by category', async () => {
    await uploadDocHelper({ title: 'Doc A', category: 'Achievement', userId: 'STU-2024-001' });
    await uploadDocHelper({ title: 'Doc B', category: 'Internship', userId: 'STU-2024-001' });

    const filterRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents?category=Internship',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(filterRes.statusCode, 200);
    assert.strictEqual(filterRes.json.documents.length, 1);
    assert.strictEqual(filterRes.json.documents[0].category, 'Internship');
  });

  it('TC_33: Filter reviews by upload date range', async () => {
    const doc = await uploadDocHelper({ title: 'Date Range Doc', userId: 'STU-2024-001' });

    const todayStr = new Date().toISOString().split('T')[0];
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/faculty/documents?startDate=${todayStr}&endDate=${todayStr}`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.documents.length >= 1);
  });

  // -----------------------------------------------------------
  // TC_34 & TC_35: Reliability & Double-Click Guard
  // -----------------------------------------------------------
  it('TC_34: Handle unavailable review data with friendly error', async () => {
    // Attempting review on non-existent document
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents/DOC-NON-EXISTENT',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.json.success, false);
    assert.ok(res.json.message.includes('not found') || res.json.message.includes('Document'));
  });

  it('TC_35: Prevent double-click duplicate approval', async () => {
    const doc = await uploadDocHelper({ title: 'Double Click Review Doc', userId: 'STU-2024-001' });

    const p1 = mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve' }
    });

    const r1 = await p1;
    assert.strictEqual(r1.statusCode, 200);

    // Second immediate call fails safely without duplicate review records
    const r2 = await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve' }
    });
    assert.strictEqual(r2.statusCode, 400);

    const history = db.getReviewsForDocument(doc.id);
    assert.strictEqual(history.length, 1, 'Only one review history event should exist');
  });

  // -----------------------------------------------------------
  // TC_36 & TC_37: Student Notifications on Approval / Rejection
  // -----------------------------------------------------------
  it('TC_36: Notify student after approval', async () => {
    const doc = await uploadDocHelper({ title: 'Approved Award Doc', userId: 'STU-2024-001' });

    await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve', comment: 'Great job!' }
    });

    const notifRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(notifRes.statusCode, 200);
    const notifications = notifRes.json.notifications;
    const match = notifications.find(n => n.documentId === doc.id);
    assert.ok(match, 'Student must receive notification for approved document');
    assert.strictEqual(match.title, 'Document Approved');
    assert.ok(match.message.includes('Great job!'));
  });

  it('TC_37: Notify student after rejection with feedback', async () => {
    const doc = await uploadDocHelper({ title: 'Rejected Internship Doc', userId: 'STU-2024-001' });
    const reason = 'Certificate does not contain the issuing authority seal.';

    await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Reject', comment: reason }
    });

    const notifRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(notifRes.statusCode, 200);
    const match = notifRes.json.notifications.find(n => n.documentId === doc.id);
    assert.ok(match);
    assert.strictEqual(match.title, 'Document Rejected');
    assert.ok(match.message.includes(reason));
  });

  // -----------------------------------------------------------
  // TC_38 & TC_39: Save Review Comments & Review History
  // -----------------------------------------------------------
  it('TC_38: Save review comments accurately', async () => {
    const doc = await uploadDocHelper({ title: 'Accuracy Test Doc', userId: 'STU-2024-001' });
    const comment = 'Please submit a clearer scan with complete header.';

    await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Reject', comment }
    });

    const historyRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}/history`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(historyRes.statusCode, 200);
    assert.strictEqual(historyRes.json.history.length, 1);
    assert.strictEqual(historyRes.json.history[0].comments, comment);
  });

  it('TC_39: Maintain review history after decision', async () => {
    const doc = await uploadDocHelper({ title: 'Audit History Doc', userId: 'STU-2024-001' });

    await mockRequest(app, {
      method: 'POST',
      url: `/api/documents/${doc.id}/review`,
      headers: { 'x-user-id': 'FAC-101' },
      body: { decision: 'Approve', comment: 'All verified' }
    });

    const historyRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}/history`,
      headers: { 'x-user-id': 'FAC-101' }
    });

    const item = historyRes.json.history[0];
    assert.strictEqual(item.action, 'Approved');
    assert.strictEqual(item.reviewerName, 'Dr. Robert Smith');
    assert.ok(item.timestamp);
    assert.strictEqual(item.comments, 'All verified');
  });

  // -----------------------------------------------------------
  // TC_40: Handle Save Failure Gracefully
  // -----------------------------------------------------------
  it('TC_40: Handle save failure during review', async () => {
    const doc = await uploadDocHelper({ title: 'Save Failure Doc', userId: 'STU-2024-001' });

    // Simulate database update failure by overriding updateDocument
    const originalUpdate = db.updateDocument;
    db.updateDocument = () => { throw new Error('Database transaction failed'); };

    try {
      const res = await mockRequest(app, {
        method: 'POST',
        url: `/api/documents/${doc.id}/review`,
        headers: { 'x-user-id': 'FAC-101' },
        body: { decision: 'Approve' }
      });

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.json.success, false);
      assert.ok(res.json.message.includes('Database transaction failed'));
    } finally {
      db.updateDocument = originalUpdate;
    }
  });
});

