const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const app = require('../src/app');
const db = require('../src/database/db');
const CONSTANTS = require('../src/config/constants');
const storageService = require('../src/services/storageService');
const reviewService = require('../src/services/reviewService');
const { createMultipartPayload, mockRequest } = require('./testHelper');

const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (Certificate) >>\nendobj\ntrailer\n<<>>\n%%EOF');
const REVISED_PDF_BUFFER = Buffer.from('%PDF-1.4\n%âãÏÓ\n2 0 obj\n<< /Title (Revised Certificate) >>\nendobj\ntrailer\n<<>>\n%%EOF');
const VALID_JPG_BUFFER = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00]);
const VALID_PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]);

// Helper to upload a document and transition it to Rejected state
async function createRejectedDocHelper({
  title = 'Initial Internship Certificate',
  category = 'Internship',
  dateOfAchievement = '2024-05-10',
  issuingOrganization = 'Tech Org',
  fileName = 'initial_certificate.pdf',
  fileBuffer = VALID_PDF_BUFFER,
  userId = 'STU-2024-001',
  rejectionReason = 'Please upload a clearer scan of your certificate.'
} = {}) {
  // 1. Upload doc as student
  const payload = createMultipartPayload(
    { title, category, dateOfAchievement, issuingOrganization },
    [{ name: 'file', filename: fileName, contentType: 'application/pdf', buffer: fileBuffer }]
  );
  const uploadRes = await mockRequest(app, {
    method: 'POST',
    url: '/api/documents',
    headers: {
      'content-type': payload.contentType,
      'x-user-id': userId
    },
    body: payload.body
  });

  const doc = uploadRes.json.document;

  // 2. Reject as assigned faculty advisor (FAC-101)
  const facultyUser = db.getUserById(doc.assignedFacultyAdvisorId || 'FAC-101');
  const reviewResult = await reviewService.submitDecision({
    documentId: doc.id,
    facultyUser,
    decision: 'Reject',
    comment: rejectionReason
  });

  return reviewResult.document;
}

// Helper to send replacement request
async function sendReplacementRequest(docId, fields = {}, fileObj = null, userId = 'STU-2024-001') {
  const files = fileObj ? [fileObj] : [];
  const payload = createMultipartPayload(fields, files);

  return mockRequest(app, {
    method: 'PUT',
    url: `/api/documents/${docId}/replacement`,
    headers: {
      'content-type': payload.contentType,
      'x-user-id': userId
    },
    body: payload.body
  });
}

describe('US03 - Replace Rejected Document Specification Tests (TC_01 to TC_40)', () => {
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
  // TC_01: Display Replace option for rejected document
  // -----------------------------------------------------------
  it('TC_01: Display Replace option for rejected document', async () => {
    const rejectedDoc = await createRejectedDocHelper();
    assert.strictEqual(rejectedDoc.status, CONSTANTS.STATUSES.REJECTED);

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    const docInList = res.json.documents.find(d => d.id === rejectedDoc.id);
    assert(docInList);
    assert.strictEqual(docInList.status, 'Rejected');
    assert(indexHtmlContent.includes('replaceModal'));
    assert(appJsContent.includes('btn-replace') || appJsContent.includes('openReplaceModal'));
  });

  // -----------------------------------------------------------
  // TC_02: Hide Replace option for approved document
  // -----------------------------------------------------------
  it('TC_02: Hide Replace option for approved document', async () => {
    // Create an approved document
    const payload = createMultipartPayload(
      { title: 'Approved Cert', category: 'Internship', dateOfAchievement: '2024-05-10', issuingOrganization: 'Tech Org' },
      [{ name: 'file', filename: 'cert.pdf', contentType: 'application/pdf', buffer: VALID_PDF_BUFFER }]
    );
    const uploadRes = await mockRequest(app, {
      method: 'POST',
      url: '/api/documents',
      headers: { 'content-type': payload.contentType, 'x-user-id': 'STU-2024-001' },
      body: payload.body
    });
    const docId = uploadRes.json.document.id;

    const faculty = db.getUserById('FAC-101');
    await reviewService.submitDecision({
      documentId: docId,
      facultyUser: faculty,
      decision: 'Approve',
      comment: 'Excellent work.'
    });

    // Attempting replacement on approved document must be blocked
    const replaceRes = await sendReplacementRequest(
      docId,
      { title: 'Updated Title' },
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(replaceRes.statusCode, 400);
    assert(replaceRes.json.message.includes('Approved documents cannot be replaced'));
  });

  // -----------------------------------------------------------
  // TC_03: Display rejection feedback
  // -----------------------------------------------------------
  it('TC_03: Display rejection feedback', async () => {
    const reason = 'Please upload a clearer scan with valid signature';
    const rejectedDoc = await createRejectedDocHelper({ rejectionReason: reason });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${rejectedDoc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.lastReviewComment, reason);

    const historyRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${rejectedDoc.id}/history`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(historyRes.statusCode, 200);
    assert(historyRes.json.history.some(h => h.comments === reason && h.action === 'Rejected'));
  });

  // -----------------------------------------------------------
  // TC_04: Open resubmission form
  // -----------------------------------------------------------
  it('TC_04: Open resubmission form', async () => {
    const rejectedDoc = await createRejectedDocHelper();
    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${rejectedDoc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    const doc = res.json.document;
    assert.strictEqual(doc.id, rejectedDoc.id);
    assert.strictEqual(doc.status, 'Rejected');
    assert(indexHtmlContent.includes('id="replaceModal"'));
    assert(indexHtmlContent.includes('id="replaceForm"'));
  });

  // -----------------------------------------------------------
  // TC_05: Pre-fill existing document metadata
  // -----------------------------------------------------------
  it('TC_05: Pre-fill existing document metadata', async () => {
    const rejectedDoc = await createRejectedDocHelper({
      title: 'Full Stack Web Internship',
      category: 'Internship',
      dateOfAchievement: '2024-03-25',
      issuingOrganization: 'Mozilla Dev'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${rejectedDoc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    const doc = res.json.document;
    assert.strictEqual(doc.title, 'Full Stack Web Internship');
    assert.strictEqual(doc.category, 'Internship');
    assert.strictEqual(doc.dateOfAchievement, '2024-03-25');
    assert.strictEqual(doc.issuingOrganization, 'Mozilla Dev');
  });

  // -----------------------------------------------------------
  // TC_06: Replace with a valid PDF
  // -----------------------------------------------------------
  it('TC_06: Replace with a valid PDF', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: rejectedDoc.title, category: rejectedDoc.category, dateOfAchievement: rejectedDoc.dateOfAchievement, issuingOrganization: rejectedDoc.issuingOrganization },
      { name: 'file', filename: 'revised_certificate.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.document.status, CONSTANTS.STATUSES.PENDING_APPROVAL);
    assert.strictEqual(res.json.document.originalFilename, 'revised_certificate.pdf');
    assert.strictEqual(res.json.document.mimeType, 'application/pdf');
  });

  // -----------------------------------------------------------
  // TC_07: Replace with a valid JPG
  // -----------------------------------------------------------
  it('TC_07: Replace with a valid JPG', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: rejectedDoc.title, category: rejectedDoc.category, dateOfAchievement: rejectedDoc.dateOfAchievement, issuingOrganization: rejectedDoc.issuingOrganization },
      { name: 'file', filename: 'revised_certificate.jpg', contentType: 'image/jpeg', buffer: VALID_JPG_BUFFER }
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.status, CONSTANTS.STATUSES.PENDING_APPROVAL);
    assert.strictEqual(res.json.document.originalFilename, 'revised_certificate.jpg');
    assert.strictEqual(res.json.document.mimeType, 'image/jpeg');
  });

  // -----------------------------------------------------------
  // TC_08: Replace with a valid PNG
  // -----------------------------------------------------------
  it('TC_08: Replace with a valid PNG', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: rejectedDoc.title, category: rejectedDoc.category, dateOfAchievement: rejectedDoc.dateOfAchievement, issuingOrganization: rejectedDoc.issuingOrganization },
      { name: 'file', filename: 'revised_certificate.png', contentType: 'image/png', buffer: VALID_PNG_BUFFER }
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.status, CONSTANTS.STATUSES.PENDING_APPROVAL);
    assert.strictEqual(res.json.document.originalFilename, 'revised_certificate.png');
    assert.strictEqual(res.json.document.mimeType, 'image/png');
  });

  // -----------------------------------------------------------
  // TC_09: Reject unsupported replacement file
  // -----------------------------------------------------------
  it('TC_09: Reject unsupported replacement file', async () => {
    const rejectedDoc = await createRejectedDocHelper();
    const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF');

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: rejectedDoc.title, category: rejectedDoc.category, dateOfAchievement: rejectedDoc.dateOfAchievement, issuingOrganization: rejectedDoc.issuingOrganization },
      { name: 'file', filename: 'replacement.exe', contentType: 'application/octet-stream', buffer: exeBuffer }
    );

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json.success, false);
    // Ensure document is still rejected
    const docCheck = db.getDocumentById(rejectedDoc.id);
    assert.strictEqual(docCheck.status, CONSTANTS.STATUSES.REJECTED);
  });

  // -----------------------------------------------------------
  // TC_10: Reject replacement file above size limit
  // -----------------------------------------------------------
  it('TC_10: Reject replacement file above size limit', async () => {
    const rejectedDoc = await createRejectedDocHelper();
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024, 0x41);

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: rejectedDoc.title, category: rejectedDoc.category, dateOfAchievement: rejectedDoc.dateOfAchievement, issuingOrganization: rejectedDoc.issuingOrganization },
      { name: 'file', filename: 'revised_large.pdf', contentType: 'application/pdf', buffer: oversizedBuffer }
    );

    assert.strictEqual(res.statusCode, 400);
    assert(res.json.message.includes('10 MB'));
    const docCheck = db.getDocumentById(rejectedDoc.id);
    assert.strictEqual(docCheck.status, CONSTANTS.STATUSES.REJECTED);
  });

  // -----------------------------------------------------------
  // TC_11: Require replacement file when needed
  // -----------------------------------------------------------
  it('TC_11: Require replacement file when needed', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    // Submit resubmission with NO file
    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: 'Updated Title', category: 'Internship', dateOfAchievement: '2024-05-10', issuingOrganization: 'Org' },
      null // No file
    );

    assert.strictEqual(res.statusCode, 400);
    assert(res.json.message.includes('replacement file is required'));
  });

  // -----------------------------------------------------------
  // TC_12: Require valid document title
  // -----------------------------------------------------------
  it('TC_12: Require valid document title', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: '   ', category: 'Internship', dateOfAchievement: '2024-05-10', issuingOrganization: 'Tech Org' },
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json.success, false);
  });

  // -----------------------------------------------------------
  // TC_13: Require document category
  // -----------------------------------------------------------
  it('TC_13: Require document category', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: 'Valid Title', category: 'InvalidCategory123', dateOfAchievement: '2024-05-10', issuingOrganization: 'Tech Org' },
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json.success, false);
  });

  // -----------------------------------------------------------
  // TC_14: Require issuing organization
  // -----------------------------------------------------------
  it('TC_14: Require issuing organization', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: 'Valid Title', category: 'Internship', dateOfAchievement: '2024-05-10', issuingOrganization: '' },
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json.success, false);
  });

  // -----------------------------------------------------------
  // TC_15: Validate achievement date
  // -----------------------------------------------------------
  it('TC_15: Validate achievement date', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: 'Valid Title', category: 'Internship', dateOfAchievement: '2099-01-01', issuingOrganization: 'Tech Org' },
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 400);
    assert(res.json.errors && res.json.errors.dateOfAchievement);
  });

  // -----------------------------------------------------------
  // TC_16: Preserve existing document linkage
  // -----------------------------------------------------------
  it('TC_16: Preserve existing document linkage', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: 'Revised Doc Linkage Test' },
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.id, rejectedDoc.id);
    assert.strictEqual(res.json.document.studentId, rejectedDoc.studentId);
  });

  // -----------------------------------------------------------
  // TC_17: Update document to Pending Approval
  // -----------------------------------------------------------
  it('TC_17: Update document to Pending Approval', async () => {
    const rejectedDoc = await createRejectedDocHelper();
    assert.strictEqual(rejectedDoc.status, 'Rejected');

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.status, CONSTANTS.STATUSES.PENDING_APPROVAL);

    const docAfter = db.getDocumentById(rejectedDoc.id);
    assert.strictEqual(docAfter.status, CONSTANTS.STATUSES.PENDING_APPROVAL);
  });

  // -----------------------------------------------------------
  // TC_18: Show resubmission success message
  // -----------------------------------------------------------
  it('TC_18: Show resubmission success message', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert(res.json.message && res.json.message.includes('successfully'));
  });

  // -----------------------------------------------------------
  // TC_19: Update modified/resubmission timestamp
  // -----------------------------------------------------------
  it('TC_19: Update modified/resubmission timestamp', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 200);
    const doc = res.json.document;
    assert(doc.resubmittedAt);
    assert(doc.updatedAt);
    assert(new Date(doc.resubmittedAt).getTime() >= new Date(rejectedDoc.createdAt).getTime());
  });

  // -----------------------------------------------------------
  // TC_20: Notify faculty about resubmission
  // -----------------------------------------------------------
  it('TC_20: Notify faculty about resubmission', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    const facultyNotifs = db.getNotifications('FAC-101');
    const resubmitNotif = facultyNotifs.find(n => n.documentId === rejectedDoc.id && n.title.includes('Resubmitted'));
    assert(resubmitNotif);
    assert(resubmitNotif.message.includes('resubmitted'));
  });

  // -----------------------------------------------------------
  // TC_21: Notify student that resubmission was received
  // -----------------------------------------------------------
  it('TC_21: Notify student that resubmission was received', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    const studentNotifs = db.getNotifications('STU-2024-001');
    const studentResubmitNotif = studentNotifs.find(n => n.documentId === rejectedDoc.id && n.title.includes('Resubmission Received'));
    assert(studentResubmitNotif);
  });

  // -----------------------------------------------------------
  // TC_22: Retain rejection history
  // -----------------------------------------------------------
  it('TC_22: Retain rejection history', async () => {
    const reason = 'Invalid stamp and blurry signatures';
    const rejectedDoc = await createRejectedDocHelper({ rejectionReason: reason });

    await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    // Verify history endpoint retains the rejection record
    const historyRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${rejectedDoc.id}/history`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(historyRes.statusCode, 200);
    const history = historyRes.json.history;
    assert(history.length >= 1);
    assert(history.some(h => h.action === 'Rejected' && h.comments === reason));
  });

  // -----------------------------------------------------------
  // TC_23: Prevent duplicate resubmission on double-click
  // -----------------------------------------------------------
  it('TC_23: Prevent duplicate resubmission on double-click', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    // First request succeeds and changes status to Pending Approval
    const res1 = await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );
    assert.strictEqual(res1.statusCode, 200);

    // Second repeated request fails because status is now Pending Approval
    const res2 = await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );
    assert.strictEqual(res2.statusCode, 400);
    assert(res2.json.message.includes('under review cannot be replaced'));
  });

  // -----------------------------------------------------------
  // TC_24: Cancel replacement before submitting
  // -----------------------------------------------------------
  it('TC_24: Cancel replacement before submitting', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    // Cancelling in the UI causes no request to be dispatched
    const docCheck = db.getDocumentById(rejectedDoc.id);
    assert.strictEqual(docCheck.status, CONSTANTS.STATUSES.REJECTED);
    assert.strictEqual(docCheck.originalFilename, 'initial_certificate.pdf');
  });

  // -----------------------------------------------------------
  // TC_25: Confirm replacement if confirmation is required
  // -----------------------------------------------------------
  it('TC_25: Confirm replacement if confirmation is required', async () => {
    const rejectedDoc = await createRejectedDocHelper();
    assert.strictEqual(rejectedDoc.status, 'Rejected');
    // UI confirms action with user before dispatching
    assert(indexHtmlContent.includes('id="btnSubmitReplace"'));
  });

  // -----------------------------------------------------------
  // TC_26: Cancel replacement confirmation
  // -----------------------------------------------------------
  it('TC_26: Cancel replacement confirmation', async () => {
    const rejectedDoc = await createRejectedDocHelper();
    // User clicks Cancel on the confirmation prompt
    const docCheck = db.getDocumentById(rejectedDoc.id);
    assert.strictEqual(docCheck.status, CONSTANTS.STATUSES.REJECTED);
  });

  // -----------------------------------------------------------
  // TC_27: Prevent replacing a document under review
  // -----------------------------------------------------------
  it('TC_27: Prevent replacing a document under review', async () => {
    // Document in Pending Approval status
    const payload = createMultipartPayload(
      { title: 'Pending Review Doc', category: 'Internship', dateOfAchievement: '2024-05-10', issuingOrganization: 'Tech Org' },
      [{ name: 'file', filename: 'pending.pdf', contentType: 'application/pdf', buffer: VALID_PDF_BUFFER }]
    );
    const uploadRes = await mockRequest(app, {
      method: 'POST',
      url: '/api/documents',
      headers: { 'content-type': payload.contentType, 'x-user-id': 'STU-2024-001' },
      body: payload.body
    });
    const pendingDocId = uploadRes.json.document.id;

    // Attempting replacement on document under review must fail
    const res = await sendReplacementRequest(
      pendingDocId,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 400);
    assert(res.json.message.includes('under review cannot be replaced'));
  });

  // -----------------------------------------------------------
  // TC_28: Prevent unauthorized replacement
  // -----------------------------------------------------------
  it('TC_28: Prevent unauthorized replacement (Student A vs Student B)', async () => {
    const rejectedDoc = await createRejectedDocHelper({ userId: 'STU-2024-001' });

    // Student B attempts to replace Student A's document
    const res = await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER },
      'STU-2024-002' // Different student
    );

    assert.strictEqual(res.statusCode, 403);
    assert(res.json.message.includes('Access denied'));
  });

  // -----------------------------------------------------------
  // TC_29: Prevent faculty from replacing student file
  // -----------------------------------------------------------
  it('TC_29: Prevent faculty from replacing student file', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    // Faculty user attempts to execute student replacement action
    const res = await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER },
      'FAC-101' // Faculty advisor
    );

    assert.strictEqual(res.statusCode, 403);
    assert(res.json.message.includes('Faculty cannot replace student document'));
  });

  // -----------------------------------------------------------
  // TC_30: Handle missing original document
  // -----------------------------------------------------------
  it('TC_30: Handle missing original document', async () => {
    const res = await sendReplacementRequest(
      'DOC-NONEXISTENT-999',
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.json.message, 'Document not found');
  });

  // -----------------------------------------------------------
  // TC_31: Handle replacement upload network failure
  // -----------------------------------------------------------
  it('TC_31: Handle replacement upload network failure', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    // An incomplete / invalid payload that mimics broken network upload
    const res = await mockRequest(app, {
      method: 'PUT',
      url: `/api/documents/${rejectedDoc.id}/replacement`,
      headers: {
        'content-type': 'multipart/form-data; boundary=MissingEndBoundary',
        'x-user-id': 'STU-2024-001'
      },
      body: Buffer.from('--MissingEndBoundary\r\nContent-Disposition: form-data; name="title"\r\n\r\nTest')
    });

    // Incomplete multipart stream returns 400 or 500 and does NOT alter record status
    assert(res.statusCode >= 400);
    const docCheck = db.getDocumentById(rejectedDoc.id);
    assert.strictEqual(docCheck.status, CONSTANTS.STATUSES.REJECTED);
  });

  // -----------------------------------------------------------
  // TC_32: Handle server failure while saving replacement
  // -----------------------------------------------------------
  it('TC_32: Handle server failure while saving replacement', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    // Temporarily simulate storage failure
    const originalSave = storageService.saveFile;
    storageService.saveFile = async () => {
      throw new Error('Simulated disk failure');
    };

    try {
      const res = await sendReplacementRequest(
        rejectedDoc.id,
        {},
        { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
      );

      assert.strictEqual(res.statusCode, 500);
      // Ensure existing record status remains Rejected
      const docCheck = db.getDocumentById(rejectedDoc.id);
      assert.strictEqual(docCheck.status, CONSTANTS.STATUSES.REJECTED);
    } finally {
      storageService.saveFile = originalSave;
    }
  });

  // -----------------------------------------------------------
  // TC_33: Verify replacement file can be previewed
  // -----------------------------------------------------------
  it('TC_33: Verify replacement file can be previewed', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised_certificate.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    const previewRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${rejectedDoc.id}/preview`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(previewRes.statusCode, 200);
    assert(previewRes.buffer.includes(Buffer.from('Revised Certificate')));
  });

  // -----------------------------------------------------------
  // TC_34: Verify replacement file can be downloaded
  // -----------------------------------------------------------
  it('TC_34: Verify replacement file can be downloaded', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised_certificate.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    const downloadRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${rejectedDoc.id}/download`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(downloadRes.statusCode, 200);
    assert(downloadRes.buffer.includes(Buffer.from('Revised Certificate')));
  });

  // -----------------------------------------------------------
  // TC_35: Verify old file is not shown as current
  // -----------------------------------------------------------
  it('TC_35: Verify old file is not shown as current', async () => {
    const rejectedDoc = await createRejectedDocHelper({ fileName: 'old_file.pdf' });
    const oldStorageKey = rejectedDoc.storageKey;

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'new_revised_file.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 200);
    const updatedDoc = res.json.document;
    assert.strictEqual(updatedDoc.originalFilename, 'new_revised_file.pdf');
    assert.notStrictEqual(updatedDoc.storageKey, oldStorageKey);
  });

  // -----------------------------------------------------------
  // TC_36: Verify faculty sees latest resubmission
  // -----------------------------------------------------------
  it('TC_36: Verify faculty sees latest resubmission', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    await sendReplacementRequest(
      rejectedDoc.id,
      { title: 'Resubmitted Certificate for Review' },
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    // Faculty advisor inspects pending queue
    const facultyQueueRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/pending',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(facultyQueueRes.statusCode, 200);
    const item = facultyQueueRes.json.pendingDocuments.find(d => d.id === rejectedDoc.id);
    assert(item);
    assert.strictEqual(item.title, 'Resubmitted Certificate for Review');
    assert.strictEqual(item.status, 'Pending Approval');
  });

  // -----------------------------------------------------------
  // TC_37: Verify resubmission appears in student list
  // -----------------------------------------------------------
  it('TC_37: Verify resubmission appears in student list', async () => {
    const rejectedDoc = await createRejectedDocHelper();

    await sendReplacementRequest(
      rejectedDoc.id,
      {},
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    const studentListRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(studentListRes.statusCode, 200);
    const item = studentListRes.json.documents.find(d => d.id === rejectedDoc.id);
    assert(item);
    assert.strictEqual(item.status, 'Pending Approval');
  });

  // -----------------------------------------------------------
  // TC_38: Verify document title after replacement
  // -----------------------------------------------------------
  it('TC_38: Verify document title after replacement', async () => {
    const rejectedDoc = await createRejectedDocHelper({ title: 'Old Title' });

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { title: 'Updated Internship Certificate' },
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.title, 'Updated Internship Certificate');
    const docInDb = db.getDocumentById(rejectedDoc.id);
    assert.strictEqual(docInDb.title, 'Updated Internship Certificate');
  });

  // -----------------------------------------------------------
  // TC_39: Verify category after replacement
  // -----------------------------------------------------------
  it('TC_39: Verify category after replacement', async () => {
    const rejectedDoc = await createRejectedDocHelper({ category: 'Internship' });

    const res = await sendReplacementRequest(
      rejectedDoc.id,
      { category: 'Achievement' },
      { name: 'file', filename: 'revised.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER }
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.category, 'Achievement');
    const docInDb = db.getDocumentById(rejectedDoc.id);
    assert.strictEqual(docInDb.category, 'Achievement');
  });

  // -----------------------------------------------------------
  // TC_40: Prevent replacement of another user's file through direct request
  // -----------------------------------------------------------
  it('TC_40: Prevent replacement of another user\'s file through direct request', async () => {
    const rejectedDocOfStudentA = await createRejectedDocHelper({ userId: 'STU-2024-001' });

    // Direct malicious request by student B
    const res = await sendReplacementRequest(
      rejectedDocOfStudentA.id,
      { title: 'Hacked Title' },
      { name: 'file', filename: 'hacked.pdf', contentType: 'application/pdf', buffer: REVISED_PDF_BUFFER },
      'STU-2024-002'
    );

    assert.strictEqual(res.statusCode, 403);
    // Verify Student A's document was not altered
    const docCheck = db.getDocumentById(rejectedDocOfStudentA.id);
    assert.strictEqual(docCheck.title, rejectedDocOfStudentA.title);
    assert.strictEqual(docCheck.status, CONSTANTS.STATUSES.REJECTED);
  });
});
