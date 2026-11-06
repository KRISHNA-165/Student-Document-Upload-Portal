const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const app = require('../src/app');
const db = require('../src/database/db');
const CONSTANTS = require('../src/config/constants');
const documentService = require('../src/services/documentService');
const reviewService = require('../src/services/reviewService');
const authService = require('../src/services/authService');
const { createMultipartPayload, mockRequest } = require('./testHelper');

const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (Test Document) >>\nendobj\ntrailer\n<<>>\n%%EOF');

// Helper to upload a real document
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

// Helper to seed a document directly into db with custom fields
function seedDoc(overrides = {}) {
  const now = new Date();
  const id = overrides.id || `DOC-TEST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const doc = {
    id,
    studentId: overrides.studentId || 'STU-2024-001',
    studentName: overrides.studentName || 'John Doe',
    title: overrides.title || 'Sample Achievement Certificate',
    category: overrides.category || 'Achievement',
    dateOfAchievement: overrides.dateOfAchievement || '2024-04-15',
    issuingOrganization: overrides.issuingOrganization || 'Global Institute',
    status: overrides.status || CONSTANTS.STATUSES.PENDING_APPROVAL,
    storageKey: overrides.storageKey || `uploads/${id}.pdf`,
    originalFilename: overrides.originalFilename || 'certificate.pdf',
    mimeType: overrides.mimeType || 'application/pdf',
    fileSize: overrides.fileSize || 1024,
    assignedFacultyAdvisorId: overrides.assignedFacultyAdvisorId || 'FAC-101',
    assignedFacultyAdvisorName: overrides.assignedFacultyAdvisorName || 'Dr. Robert Smith',
    createdAt: overrides.createdAt || now.toISOString(),
    updatedAt: overrides.updatedAt || now.toISOString()
  };
  return db.insertDocument(doc);
}

describe('US08 - Document Search and Filtering (TC_01 to TC_40)', () => {
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
  // TC_01: Verify document list opens
  // -----------------------------------------------------------
  it('TC_01: Verify document list opens - Student is logged in and sees their saved records', async () => {
    seedDoc({ title: 'My Personal Record 1', studentId: 'STU-2024-001' });
    seedDoc({ title: 'My Personal Record 2', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.documents.length, 2);
    assert.strictEqual(res.json.total, 2);
    assert(res.json.documents.some(d => d.title === 'My Personal Record 1'));
  });

  // -----------------------------------------------------------
  // TC_02: Verify search by document title
  // -----------------------------------------------------------
  it('TC_02: Verify search by document title', async () => {
    seedDoc({ title: 'Internship Certificate', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Volunteering Award', studentId: 'STU-2024-001' });

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
  // TC_03: Verify search by partial title
  // -----------------------------------------------------------
  it('TC_03: Verify search by partial title', async () => {
    seedDoc({ title: 'Internship Certificate 2026', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Sports Meet Medal', studentId: 'STU-2024-001' });

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
  // TC_04: Verify search is case-insensitive
  // -----------------------------------------------------------
  it('TC_04: Verify search is case-insensitive', async () => {
    seedDoc({ title: 'Internship Certificate', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=internship certificate',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].title, 'Internship Certificate');
  });

  // -----------------------------------------------------------
  // TC_05: Verify search by issuing organization
  // -----------------------------------------------------------
  it('TC_05: Verify search by issuing organization', async () => {
    seedDoc({ title: 'Workshop Certificate', issuingOrganization: 'ABC College', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Hackathon Win', issuingOrganization: 'XYZ University', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=ABC College',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].issuingOrganization, 'ABC College');
  });

  // -----------------------------------------------------------
  // TC_06: Verify search by category
  // -----------------------------------------------------------
  it('TC_06: Verify search by category', async () => {
    seedDoc({ title: 'Web Development Role', category: 'Internship', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Dean List Award', category: 'Academic Record', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Internship',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].category, 'Internship');
  });

  // -----------------------------------------------------------
  // TC_07: Verify search with no matches
  // -----------------------------------------------------------
  it('TC_07: Verify search with no matches returns empty result', async () => {
    seedDoc({ title: 'Existing Document 1', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=no-match-xyz',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 0);
    assert.strictEqual(res.json.total, 0);
  });

  // -----------------------------------------------------------
  // TC_08: Verify clearing search restores records
  // -----------------------------------------------------------
  it('TC_08: Verify clearing search restores full record list', async () => {
    seedDoc({ title: 'Doc One', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Doc Two', studentId: 'STU-2024-001' });

    // Filtered
    const searchRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=One',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(searchRes.json.documents.length, 1);

    // Cleared (blank query)
    const clearRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(clearRes.json.documents.length, 2);
  });

  // -----------------------------------------------------------
  // TC_09: Verify filter by Pending status
  // -----------------------------------------------------------
  it('TC_09: Verify filter by Pending status', async () => {
    seedDoc({ title: 'Pending Doc', status: CONSTANTS.STATUSES.PENDING_APPROVAL, studentId: 'STU-2024-001' });
    seedDoc({ title: 'Approved Doc', status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Pending Approval',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].status, CONSTANTS.STATUSES.PENDING_APPROVAL);
  });

  // -----------------------------------------------------------
  // TC_10: Verify filter by Approved status
  // -----------------------------------------------------------
  it('TC_10: Verify filter by Approved status', async () => {
    seedDoc({ title: 'Pending Doc', status: CONSTANTS.STATUSES.PENDING_APPROVAL, studentId: 'STU-2024-001' });
    seedDoc({ title: 'Approved Doc', status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Approved',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].status, CONSTANTS.STATUSES.APPROVED);
  });

  // -----------------------------------------------------------
  // TC_11: Verify filter by Rejected status
  // -----------------------------------------------------------
  it('TC_11: Verify filter by Rejected status', async () => {
    seedDoc({ title: 'Rejected Doc', status: CONSTANTS.STATUSES.REJECTED, studentId: 'STU-2024-001' });
    seedDoc({ title: 'Approved Doc', status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Rejected',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].status, CONSTANTS.STATUSES.REJECTED);
  });

  // -----------------------------------------------------------
  // TC_12: Verify combining search and status filter
  // -----------------------------------------------------------
  it('TC_12: Verify combining search and status filter', async () => {
    seedDoc({ title: 'Official Academic Transcript', status: CONSTANTS.STATUSES.PENDING_APPROVAL, studentId: 'STU-2024-001' });
    seedDoc({ title: 'Unofficial Transcript', status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });
    seedDoc({ title: 'Internship Offer', status: CONSTANTS.STATUSES.PENDING_APPROVAL, studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Transcript&status=Pending Approval',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].title, 'Official Academic Transcript');
    assert.strictEqual(res.json.documents[0].status, CONSTANTS.STATUSES.PENDING_APPROVAL);
  });

  // -----------------------------------------------------------
  // TC_13: Verify category filter
  // -----------------------------------------------------------
  it('TC_13: Verify category filter', async () => {
    seedDoc({ title: 'Math Olympiad', category: 'Academic Record', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Summer Internship', category: 'Internship', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?category=Academic Record',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].title, 'Math Olympiad');
  });

  // -----------------------------------------------------------
  // TC_14: Verify date-range filter
  // -----------------------------------------------------------
  it('TC_14: Verify date-range filter returns records within selected dates', async () => {
    seedDoc({ title: 'September Doc', createdAt: '2026-09-15T10:00:00.000Z', studentId: 'STU-2024-001' });
    seedDoc({ title: 'October Doc', createdAt: '2026-10-15T10:00:00.000Z', studentId: 'STU-2024-001' });
    seedDoc({ title: 'August Doc', createdAt: '2026-08-15T10:00:00.000Z', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?from=2026-09-01&to=2026-10-01',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].title, 'September Doc');
  });

  // -----------------------------------------------------------
  // TC_15: Verify start date later than end date is rejected
  // -----------------------------------------------------------
  it('TC_15: Verify start date later than end date is rejected with 400', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?from=2026-10-10&to=2026-10-01',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json.success, false);
    assert(res.json.message.includes('Start date cannot be later than end date'));
  });

  // -----------------------------------------------------------
  // TC_16: Verify reset clears all filters
  // -----------------------------------------------------------
  it('TC_16: Verify reset clears all filters and restores authorized list', async () => {
    seedDoc({ title: 'Doc A', category: 'Achievement', status: 'Approved', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Doc B', category: 'Internship', status: 'Pending Approval', studentId: 'STU-2024-001' });

    // Fully filtered
    const filteredRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Doc&category=Achievement&status=Approved',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(filteredRes.json.documents.length, 1);

    // Reset (no query params)
    const resetRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(resetRes.json.documents.length, 2);
  });

  // -----------------------------------------------------------
  // TC_17: Verify filter count matches visible records
  // -----------------------------------------------------------
  it('TC_17: Verify filter count matches visible records', async () => {
    seedDoc({ title: 'App 1', status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });
    seedDoc({ title: 'App 2', status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });
    seedDoc({ title: 'App 3', status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });
    seedDoc({ title: 'App 4', status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });
    seedDoc({ title: 'Pend 1', status: CONSTANTS.STATUSES.PENDING_APPROVAL, studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Approved',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.count, 4);
    assert.strictEqual(res.json.total, 4);
    assert.strictEqual(res.json.documents.length, 4);
  });

  // -----------------------------------------------------------
  // TC_18: Verify sort by upload date newest first
  // -----------------------------------------------------------
  it('TC_18: Verify sort by upload date newest first', async () => {
    seedDoc({ title: 'Oct 01', createdAt: '2026-10-01T10:00:00.000Z', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Oct 20', createdAt: '2026-10-20T10:00:00.000Z', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Oct 10', createdAt: '2026-10-10T10:00:00.000Z', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?sort=newest',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    const titles = res.json.documents.map(d => d.title);
    assert.deepStrictEqual(titles, ['Oct 20', 'Oct 10', 'Oct 01']);
  });

  // -----------------------------------------------------------
  // TC_19: Verify sort by upload date oldest first
  // -----------------------------------------------------------
  it('TC_19: Verify sort by upload date oldest first', async () => {
    seedDoc({ title: 'Oct 01', createdAt: '2026-10-01T10:00:00.000Z', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Oct 20', createdAt: '2026-10-20T10:00:00.000Z', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Oct 10', createdAt: '2026-10-10T10:00:00.000Z', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?sort=oldest',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    const titles = res.json.documents.map(d => d.title);
    assert.deepStrictEqual(titles, ['Oct 01', 'Oct 10', 'Oct 20']);
  });

  // -----------------------------------------------------------
  // TC_20: Verify sort by title
  // -----------------------------------------------------------
  it('TC_20: Verify sort by title alphabetically', async () => {
    seedDoc({ title: 'Certificate B', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Certificate A', studentId: 'STU-2024-001' });
    seedDoc({ title: 'Certificate C', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?sort=title_asc',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    const titles = res.json.documents.map(d => d.title);
    assert.deepStrictEqual(titles, ['Certificate A', 'Certificate B', 'Certificate C']);
  });

  // -----------------------------------------------------------
  // TC_21: Verify sort by status
  // -----------------------------------------------------------
  it('TC_21: Verify sort by status defined rank order', async () => {
    seedDoc({ title: 'Rej', status: CONSTANTS.STATUSES.REJECTED, studentId: 'STU-2024-001' });
    seedDoc({ title: 'Pend', status: CONSTANTS.STATUSES.PENDING_APPROVAL, studentId: 'STU-2024-001' });
    seedDoc({ title: 'App', status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?sort=status',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    const statuses = res.json.documents.map(d => d.status);
    assert.deepStrictEqual(statuses, [
      CONSTANTS.STATUSES.PENDING_APPROVAL,
      CONSTANTS.STATUSES.APPROVED,
      CONSTANTS.STATUSES.REJECTED
    ]);
  });

  // -----------------------------------------------------------
  // TC_22: Verify search handles leading and trailing spaces
  // -----------------------------------------------------------
  it('TC_22: Verify search handles leading and trailing spaces cleanly', async () => {
    seedDoc({ title: 'Transcript of Records', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=%20%20Transcript%20%20',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].title, 'Transcript of Records');
  });

  // -----------------------------------------------------------
  // TC_23: Verify special characters in search are handled safely
  // -----------------------------------------------------------
  it('TC_23: Verify special characters in search are handled safely', async () => {
    seedDoc({ title: 'Document with special symbols %_#', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=%25_%27;--',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(Array.isArray(res.json.documents), true);
  });

  // -----------------------------------------------------------
  // TC_24: Verify search input does not execute script
  // -----------------------------------------------------------
  it('TC_24: Verify search input does not execute script and is treated as plain text', async () => {
    seedDoc({ title: 'Normal Certificate', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=%3Cscript%3Ealert(1)%3C/script%3E',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 0);
  });

  // -----------------------------------------------------------
  // TC_25: Verify results are restricted to signed-in student
  // -----------------------------------------------------------
  it('TC_25: Verify results are restricted strictly to signed-in student', async () => {
    seedDoc({ title: 'Student B Private Award', studentId: 'STU-2024-002' });
    seedDoc({ title: 'Student A Public Cert', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Private Award',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 0);
  });

  // -----------------------------------------------------------
  // TC_26: Verify direct document link respects authorization
  // -----------------------------------------------------------
  it('TC_26: Verify direct document link respects authorization (403 for other student)', async () => {
    const docB = seedDoc({ title: 'Student B Only', studentId: 'STU-2024-002' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${docB.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json.success, false);
    assert(res.json.message.includes('Access denied'));
  });

  // -----------------------------------------------------------
  // TC_27: Verify pagination preserves active search
  // -----------------------------------------------------------
  it('TC_27: Verify pagination preserves active search', async () => {
    for (let i = 1; i <= 15; i++) {
      seedDoc({ title: `Seminar Certificate ${i}`, studentId: 'STU-2024-001' });
    }

    const page1Res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Seminar&page=1&limit=10',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(page1Res.statusCode, 200);
    assert.strictEqual(page1Res.json.documents.length, 10);
    assert.strictEqual(page1Res.json.total, 15);
    assert.strictEqual(page1Res.json.totalPages, 2);

    const page2Res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Seminar&page=2&limit=10',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(page2Res.statusCode, 200);
    assert.strictEqual(page2Res.json.documents.length, 5);
    assert.strictEqual(page2Res.json.total, 15);
  });

  // -----------------------------------------------------------
  // TC_28: Verify pagination preserves active filters
  // -----------------------------------------------------------
  it('TC_28: Verify pagination preserves active status filter', async () => {
    for (let i = 1; i <= 12; i++) {
      seedDoc({ title: `Approved Cert ${i}`, status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });
    }
    seedDoc({ title: 'Pending Cert 99', status: CONSTANTS.STATUSES.PENDING_APPROVAL, studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Approved&page=2&limit=10',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 2);
    assert(res.json.documents.every(d => d.status === CONSTANTS.STATUSES.APPROVED));
  });

  // -----------------------------------------------------------
  // TC_29: Verify no-results message after combined filters
  // -----------------------------------------------------------
  it('TC_29: Verify no-results after conflicting search and status filter', async () => {
    seedDoc({ title: 'Sports Winner', status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Sports&status=Rejected',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 0);
    assert.strictEqual(res.json.total, 0);
  });

  // -----------------------------------------------------------
  // TC_30: Verify result list updates after document upload
  // -----------------------------------------------------------
  it('TC_30: Verify result list updates after document upload', async () => {
    const beforeRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Merit Certificate',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(beforeRes.json.documents.length, 0);

    await uploadDocHelper({ title: 'Merit Certificate', userId: 'STU-2024-001' });

    const afterRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Merit Certificate',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(afterRes.statusCode, 200);
    assert.strictEqual(afterRes.json.documents.length, 1);
    assert.strictEqual(afterRes.json.documents[0].title, 'Merit Certificate');
  });

  // -----------------------------------------------------------
  // TC_31: Verify result list updates after status change
  // -----------------------------------------------------------
  it('TC_31: Verify result list updates after status change (approval removes from pending)', async () => {
    const doc = seedDoc({ title: 'Paper Publication', status: CONSTANTS.STATUSES.PENDING_APPROVAL, studentId: 'STU-2024-001' });

    const pendingBefore = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Pending Approval',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(pendingBefore.json.documents.length, 1);

    // Faculty reviews and approves
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: { id: 'FAC-101', name: 'Dr. Robert Smith', role: 'Faculty' },
      decision: 'Approve',
      comment: 'Excellent publication'
    });

    const pendingAfter = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Pending Approval',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(pendingAfter.json.documents.length, 0);

    const approvedAfter = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?status=Approved',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(approvedAfter.json.documents.length, 1);
  });

  // -----------------------------------------------------------
  // TC_32: Verify empty document list state
  // -----------------------------------------------------------
  it('TC_32: Verify empty document list state contains helpful message and upload action', () => {
    assert(indexHtmlContent.includes('id="studentEmptyDocsState"'));
    assert(indexHtmlContent.includes('No documents uploaded yet'));
    assert(indexHtmlContent.includes('id="btnEmptyUploadDocs"'));
  });

  // -----------------------------------------------------------
  // TC_33: Verify loading indicator during search
  // -----------------------------------------------------------
  it('TC_33: Verify loading indicator during search is present in markup and js', () => {
    assert(indexHtmlContent.includes('id="studentSearchLoading"'));
    assert(indexHtmlContent.includes('Searching documents...'));
    assert(appJsContent.includes('studentSearchLoading'));
  });

  // -----------------------------------------------------------
  // TC_34: Verify search failure message
  // -----------------------------------------------------------
  it('TC_34: Verify search failure message and retry button are present in markup', () => {
    assert(indexHtmlContent.includes('id="studentSearchError"'));
    assert(indexHtmlContent.includes('id="btnRetryStudentSearch"'));
    assert(appJsContent.includes('studentSearchError'));
  });

  // -----------------------------------------------------------
  // TC_35: Verify retry after search failure
  // -----------------------------------------------------------
  it('TC_35: Verify retry handler is registered in app.js', () => {
    assert(appJsContent.includes('btnRetryStudentSearch'));
    assert(appJsContent.includes('loadDocuments(studentCurrentPage)'));
  });

  // -----------------------------------------------------------
  // TC_36: Verify search and filters work on mobile
  // -----------------------------------------------------------
  it('TC_36: Verify search and filter controls support mobile viewport wrapping', () => {
    assert(indexHtmlContent.includes('flex-wrap:wrap'));
    assert(indexHtmlContent.includes('student-filters-bar'));
  });

  // -----------------------------------------------------------
  // TC_37: Verify keyboard access to search and filters
  // -----------------------------------------------------------
  it('TC_37: Verify keyboard access and focusability of search and filter controls', () => {
    assert(indexHtmlContent.includes('id="studentSearchInput"'));
    assert(indexHtmlContent.includes('id="studentCategoryFilter"'));
    assert(indexHtmlContent.includes('id="studentStatusFilter"'));
    assert(indexHtmlContent.includes('id="btnClearStudentFilters"'));
  });

  // -----------------------------------------------------------
  // TC_38: Verify accessible labels for filter controls
  // -----------------------------------------------------------
  it('TC_38: Verify accessible labels for filter controls', () => {
    assert(indexHtmlContent.includes('aria-label="Search documents by title, category, or issuing organization"'));
    assert(indexHtmlContent.includes('aria-label="Filter documents by category"'));
    assert(indexHtmlContent.includes('aria-label="Filter documents by status"'));
    assert(indexHtmlContent.includes('aria-label="Start upload date"'));
    assert(indexHtmlContent.includes('aria-label="End upload date"'));
    assert(indexHtmlContent.includes('aria-label="Sort documents"'));
  });

  // -----------------------------------------------------------
  // TC_39: Verify search result details are accurate
  // -----------------------------------------------------------
  it('TC_39: Verify search result details accurately match the saved document metadata', async () => {
    const seed = seedDoc({
      title: 'Cloud Computing Specialization',
      category: 'Certification',
      dateOfAchievement: '2024-03-25',
      issuingOrganization: 'Amazon Web Services',
      status: CONSTANTS.STATUSES.APPROVED,
      studentId: 'STU-2024-001'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Cloud Computing',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    const doc = res.json.documents[0];
    assert.strictEqual(doc.id, seed.id);
    assert.strictEqual(doc.title, 'Cloud Computing Specialization');
    assert.strictEqual(doc.category, 'Certification');
    assert.strictEqual(doc.dateOfAchievement, '2024-03-25');
    assert.strictEqual(doc.issuingOrganization, 'Amazon Web Services');
    assert.strictEqual(doc.status, CONSTANTS.STATUSES.APPROVED);
  });

  // -----------------------------------------------------------
  // TC_40: Verify large result set remains usable
  // -----------------------------------------------------------
  it('TC_40: Verify large result set with 500 records is queryable and paginated smoothly', async () => {
    const start = Date.now();
    for (let i = 1; i <= 500; i++) {
      db.insertDocument({
        id: `DOC-BULK-${i}`,
        studentId: 'STU-2024-001',
        studentName: 'John Doe',
        title: i === 250 ? 'Unique Needle In Haystack' : `Standard Academic Document Record ${i}`,
        category: i % 2 === 0 ? 'Achievement' : 'Internship',
        dateOfAchievement: '2024-01-01',
        issuingOrganization: 'Bulk University',
        status: i % 3 === 0 ? CONSTANTS.STATUSES.APPROVED : CONSTANTS.STATUSES.PENDING_APPROVAL,
        storageKey: `uploads/bulk-${i}.pdf`,
        originalFilename: `doc-${i}.pdf`,
        mimeType: 'application/pdf',
        fileSize: 1024,
        assignedFacultyAdvisorId: 'FAC-101',
        createdAt: new Date(2026, 0, 1, 0, i).toISOString()
      });
    }

    // Direct search in 500 documents
    const searchRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=Needle',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(searchRes.statusCode, 200);
    assert.strictEqual(searchRes.json.documents.length, 1);
    assert.strictEqual(searchRes.json.documents[0].title, 'Unique Needle In Haystack');

    // Paginated load of bulk documents
    const pageRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?page=1&limit=25',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(pageRes.statusCode, 200);
    assert.strictEqual(pageRes.json.documents.length, 25);
    assert.strictEqual(pageRes.json.total, 500);
    assert.strictEqual(pageRes.json.totalPages, 20);

    const elapsed = Date.now() - start;
    assert(elapsed < 2000, `Bulk querying took ${elapsed}ms, should be < 2000ms`);
  });

  // -----------------------------------------------------------
  // US08 Acceptance Criteria 1 - 4
  // -----------------------------------------------------------
  it('US08 Acceptance 1: Students can search their own documents', async () => {
    seedDoc({ title: 'Student 1 AI Project', studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents?search=AI Project',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
  });

  it('US08 Acceptance 2: Faculty can search documents belonging to their assigned students', async () => {
    seedDoc({
      title: 'Machine Learning Internship',
      studentId: 'STU-2024-001',
      studentName: 'John Doe',
      assignedFacultyAdvisorId: 'FAC-101'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents?search=Machine Learning',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].title, 'Machine Learning Internship');
  });

  it('US08 Acceptance 3: Faculty should not see documents belonging to students assigned to another Faculty Advisor', async () => {
    seedDoc({
      title: 'Other Advisor Student Paper',
      studentId: 'STU-2024-002',
      assignedFacultyAdvisorId: 'FAC-999' // Different faculty advisor
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents?search=Other Advisor',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 0);
  });

  it('US08 Acceptance 4: Faculty can filter documents by assigned student', async () => {
    seedDoc({
      title: 'John Document',
      studentId: 'STU-2024-001',
      studentName: 'John Doe',
      assignedFacultyAdvisorId: 'FAC-101'
    });
    seedDoc({
      title: 'Jane Document',
      studentId: 'STU-2024-002',
      studentName: 'Jane Smith',
      assignedFacultyAdvisorId: 'FAC-101'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/faculty/documents?studentId=STU-2024-001',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.documents.length, 1);
    assert.strictEqual(res.json.documents[0].studentId, 'STU-2024-001');
    assert.strictEqual(res.json.documents[0].title, 'John Document');
  });
});
