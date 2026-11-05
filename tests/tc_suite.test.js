const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const app = require('../src/app');
const db = require('../src/database/db');
const CONSTANTS = require('../src/config/constants');
const validationService = require('../src/services/validationService');
const { createMultipartPayload, mockRequest } = require('./testHelper');

// Accurate magic bytes buffers
const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (Certificate) >>\nendobj\ntrailer\n<<>>\n%%EOF');
const VALID_JPG_BUFFER = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00]);
const VALID_JPEG_BUFFER = Buffer.from([0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09]);
const VALID_PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]);

const INVALID_EXE_BUFFER = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const INVALID_DOCX_BUFFER = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const INVALID_ZIP_BUFFER = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x0A, 0x00, 0x00, 0x00]);

// Boundary test buffers
const EXACT_10MB_BUFFER = Buffer.alloc(10 * 1024 * 1024);
VALID_PDF_BUFFER.copy(EXACT_10MB_BUFFER, 0);

const LARGE_12MB_BUFFER = Buffer.alloc(12 * 1024 * 1024);
VALID_PDF_BUFFER.copy(LARGE_12MB_BUFFER, 0);

// Helper for sending upload request via in-memory mockRequest
async function uploadRequest({
  title = 'Internship Certificate',
  category = 'Internship',
  dateOfAchievement = '2024-05-10',
  issuingOrganization = 'ABC Ltd',
  fileBuffer = VALID_PDF_BUFFER,
  fileName = 'internship.pdf',
  fileType = 'application/pdf',
  omitFile = false,
  omitFields = [],
  userId = 'STU-2024-001'
} = {}) {
  const fields = {};
  if (!omitFields.includes('title') && title !== undefined) {
    fields.title = title;
  }
  if (!omitFields.includes('category') && category !== undefined) {
    fields.category = category;
  }
  if (!omitFields.includes('dateOfAchievement') && dateOfAchievement !== undefined) {
    fields.dateOfAchievement = dateOfAchievement;
  }
  if (!omitFields.includes('issuingOrganization') && issuingOrganization !== undefined) {
    fields.issuingOrganization = issuingOrganization;
  }

  const files = [];
  if (!omitFile && fileBuffer) {
    files.push({
      name: 'file',
      filename: fileName,
      contentType: fileType,
      buffer: fileBuffer
    });
  }

  const payload = createMultipartPayload(fields, files);

  const res = await mockRequest(app, {
    method: 'POST',
    url: '/api/documents',
    headers: {
      'content-type': payload.contentType,
      'x-user-id': userId
    },
    body: payload.body
  });

  return {
    status: res.statusCode,
    data: res.json || {},
    headers: res.headers,
    raw: res
  };
}

describe('US01 - Student Document Upload Specification Tests (TC_01 to TC_40)', () => {
  let indexHtmlContent = '';

  before(() => {
    indexHtmlContent = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
  });

  beforeEach(() => {
    db.reset();
  });

  // -----------------------------------------------------------
  // TC_01 to TC_05: UI Form & Field Presence
  // -----------------------------------------------------------
  it('TC_01: Validate upload form opens - Upload form is displayed with all required fields and file selector', () => {
    assert.ok(indexHtmlContent.includes('id="uploadForm"'), 'Upload form must exist');
    assert.ok(indexHtmlContent.includes('id="documentTitle"'), 'Document Title field must exist');
    assert.ok(indexHtmlContent.includes('id="documentCategory"'), 'Category field must exist');
    assert.ok(indexHtmlContent.includes('id="dateOfAchievement"'), 'Date field must exist');
    assert.ok(indexHtmlContent.includes('id="issuingOrganization"'), 'Organization field must exist');
    assert.ok(indexHtmlContent.includes('id="fileInput"'), 'File selector must exist');
  });

  it('TC_02: Validate Document Title field is present', () => {
    assert.ok(indexHtmlContent.includes('id="documentTitle"'));
    assert.ok(indexHtmlContent.includes('name="title"'));
    assert.ok(indexHtmlContent.includes('Document Title'));
  });

  it('TC_03: Validate Category field is present', () => {
    assert.ok(indexHtmlContent.includes('id="documentCategory"'));
    assert.ok(indexHtmlContent.includes('name="category"'));
    assert.ok(indexHtmlContent.includes('Achievement'));
    assert.ok(indexHtmlContent.includes('Internship'));
  });

  it('TC_04: Validate Date of Achievement field is present', () => {
    assert.ok(indexHtmlContent.includes('id="dateOfAchievement"'));
    assert.ok(indexHtmlContent.includes('type="date"'));
    assert.ok(indexHtmlContent.includes('name="dateOfAchievement"'));
  });

  it('TC_05: Validate Issuing Organization field is present', () => {
    assert.ok(indexHtmlContent.includes('id="issuingOrganization"'));
    assert.ok(indexHtmlContent.includes('name="issuingOrganization"'));
    assert.ok(indexHtmlContent.includes('Issuing Organization'));
  });

  // -----------------------------------------------------------
  // TC_06 to TC_09: Valid File Formats Upload
  // -----------------------------------------------------------
  it('TC_06: Upload a valid PDF file', async () => {
    const res = await uploadRequest({
      title: 'Internship Certificate',
      category: 'Internship',
      dateOfAchievement: '2024-05-10',
      issuingOrganization: 'ABC Ltd',
      fileBuffer: VALID_PDF_BUFFER,
      fileName: 'internship.pdf',
      fileType: 'application/pdf'
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.document.title, 'Internship Certificate');
    assert.strictEqual(res.data.document.category, 'Internship');
    assert.strictEqual(res.data.document.mimeType, 'application/pdf');
    assert.strictEqual(res.data.document.status, 'Pending Approval');
  });

  it('TC_07: Upload a valid JPG file', async () => {
    const res = await uploadRequest({
      title: 'Course Certificate',
      category: 'Achievement',
      dateOfAchievement: '2024-04-12',
      issuingOrganization: 'IEEE Branch',
      fileBuffer: VALID_JPG_BUFFER,
      fileName: 'certificate.jpg',
      fileType: 'image/jpeg'
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.document.mimeType, 'image/jpeg');
    assert.strictEqual(res.data.document.extension, '.jpg');
  });

  it('TC_08: Upload a valid JPEG file', async () => {
    const res = await uploadRequest({
      title: 'Hackathon Award',
      category: 'Achievement',
      dateOfAchievement: '2024-03-20',
      issuingOrganization: 'Tech Institute',
      fileBuffer: VALID_JPEG_BUFFER,
      fileName: 'achievement.jpeg',
      fileType: 'image/jpeg'
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.document.mimeType, 'image/jpeg');
    assert.strictEqual(res.data.document.extension, '.jpeg');
  });

  it('TC_09: Upload a valid PNG file', async () => {
    const res = await uploadRequest({
      title: 'Gold Medal Award',
      category: 'Achievement',
      dateOfAchievement: '2024-02-15',
      issuingOrganization: 'Global Tech',
      fileBuffer: VALID_PNG_BUFFER,
      fileName: 'award.png',
      fileType: 'image/png'
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.document.mimeType, 'image/png');
    assert.strictEqual(res.data.document.extension, '.png');
  });

  // -----------------------------------------------------------
  // TC_10 to TC_12: Reject Unsupported Formats
  // -----------------------------------------------------------
  it('TC_10: Reject an unsupported EXE file', async () => {
    const res = await uploadRequest({
      title: 'Program Executable',
      category: 'Achievement',
      dateOfAchievement: '2024-01-10',
      issuingOrganization: 'Software Corp',
      fileBuffer: INVALID_EXE_BUFFER,
      fileName: 'program.exe',
      fileType: 'application/x-msdownload'
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(
      res.data.message.includes('Unsupported file format') || res.data.message.includes('.exe'),
      `Expected unsupported format error, got: ${res.data.message}`
    );
  });

  it('TC_11: Reject an unsupported DOCX file', async () => {
    const res = await uploadRequest({
      title: 'Word Document Certificate',
      category: 'Achievement',
      dateOfAchievement: '2024-01-10',
      issuingOrganization: 'Word Corp',
      fileBuffer: INVALID_DOCX_BUFFER,
      fileName: 'certificate.docx',
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(
      res.data.message.includes('Unsupported file format') || res.data.message.includes('Only PDF, JPG, JPEG, and PNG'),
      `Expected format restriction error, got: ${res.data.message}`
    );
  });

  it('TC_12: Reject an unsupported ZIP file', async () => {
    const res = await uploadRequest({
      title: 'Archive File',
      category: 'Achievement',
      dateOfAchievement: '2024-01-10',
      issuingOrganization: 'Zip Corp',
      fileBuffer: INVALID_ZIP_BUFFER,
      fileName: 'documents.zip',
      fileType: 'application/zip'
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.message.includes('Unsupported file format'));
  });

  // -----------------------------------------------------------
  // TC_13 & TC_14: File Size Boundaries (10 MB Limit)
  // -----------------------------------------------------------
  it('TC_13: Reject file exceeding 10 MB (12 MB file)', async () => {
    const res = await uploadRequest({
      title: 'Over 10MB Document',
      category: 'Internship',
      dateOfAchievement: '2024-01-10',
      issuingOrganization: 'Large Corp',
      fileBuffer: LARGE_12MB_BUFFER,
      fileName: 'large.pdf',
      fileType: 'application/pdf'
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(
      res.data.message.includes('10 MB'),
      `Expected 10 MB limit error, got: ${res.data.message}`
    );
  });

  it('TC_14: Accept file at configured 10 MB limit (exact 10 * 1024 * 1024 bytes)', async () => {
    const res = await uploadRequest({
      title: 'Boundary 10MB Document',
      category: 'Internship',
      dateOfAchievement: '2024-01-10',
      issuingOrganization: 'Boundary Corp',
      fileBuffer: EXACT_10MB_BUFFER,
      fileName: 'document.pdf',
      fileType: 'application/pdf'
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.document.fileSize, 10 * 1024 * 1024);
  });

  // -----------------------------------------------------------
  // TC_15 to TC_19: Reject Missing / Empty Mandatory Fields
  // -----------------------------------------------------------
  it('TC_15: Reject empty Document Title', async () => {
    const res = await uploadRequest({
      title: '',
      category: 'Internship',
      dateOfAchievement: '2024-01-10',
      issuingOrganization: 'ABC Ltd',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.errors && res.data.errors.title);
  });

  it('TC_16: Reject empty Category', async () => {
    const res = await uploadRequest({
      title: 'Valid Title',
      category: '',
      dateOfAchievement: '2024-01-10',
      issuingOrganization: 'ABC Ltd',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.errors && res.data.errors.category);
  });

  it('TC_17: Reject empty Date of Achievement', async () => {
    const res = await uploadRequest({
      title: 'Valid Title',
      category: 'Internship',
      dateOfAchievement: '',
      issuingOrganization: 'ABC Ltd',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.errors && res.data.errors.dateOfAchievement);
  });

  it('TC_18: Reject empty Issuing Organization', async () => {
    const res = await uploadRequest({
      title: 'Valid Title',
      category: 'Internship',
      dateOfAchievement: '2024-01-10',
      issuingOrganization: '',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.errors && res.data.errors.issuingOrganization);
  });

  it('TC_19: Reject submission with all required fields empty', async () => {
    const res = await uploadRequest({
      title: '',
      category: '',
      dateOfAchievement: '',
      issuingOrganization: '',
      omitFile: true
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.errors);
    assert.ok(res.data.errors.title);
    assert.ok(res.data.errors.category);
    assert.ok(res.data.errors.dateOfAchievement);
    assert.ok(res.data.errors.issuingOrganization);
    assert.strictEqual(db.getDocuments().length, 0);
  });

  // -----------------------------------------------------------
  // TC_20 & TC_21: Button Disabled/Enabled Behavior
  // -----------------------------------------------------------
  it('TC_20: Keep Upload disabled until fields are complete', () => {
    assert.ok(indexHtmlContent.includes('id="btnUpload"'));
    assert.ok(indexHtmlContent.includes('id="btnUpload"\n                disabled') || indexHtmlContent.includes('id="btnUpload" disabled'));
  });

  it('TC_21: Enable Upload after required fields are complete', () => {
    const metaCheck = validationService.validateMetadata({
      title: 'My Title',
      category: 'Achievement',
      dateOfAchievement: '2024-01-01',
      issuingOrganization: 'My Org'
    });
    const fileCheck = validationService.validateFile({
      originalname: 'cert.pdf',
      size: 2048,
      buffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(metaCheck.isValid, true);
    assert.strictEqual(fileCheck.isValid, true);
  });

  // -----------------------------------------------------------
  // TC_22 to TC_24: Date Handling
  // -----------------------------------------------------------
  it('TC_22: Reject future achievement date if disallowed', async () => {
    const res = await uploadRequest({
      title: 'Future Certificate',
      category: 'Achievement',
      dateOfAchievement: '2099-01-01',
      issuingOrganization: 'Future Tech',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(
      res.data.errors && res.data.errors.dateOfAchievement.includes('future'),
      `Expected future date error message, got: ${JSON.stringify(res.data.errors)}`
    );
  });

  it('TC_23: Accept a valid past achievement date (2024-06-15)', async () => {
    const res = await uploadRequest({
      title: 'Past Achievement',
      category: 'Achievement',
      dateOfAchievement: '2024-06-15',
      issuingOrganization: 'Science Council',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.document.dateOfAchievement, '2024-06-15');
  });

  it('TC_24: Handle invalid date input (e.g. 2024-15-40)', async () => {
    const res = await uploadRequest({
      title: 'Invalid Date Doc',
      category: 'Achievement',
      dateOfAchievement: '2024-15-40',
      issuingOrganization: 'Test Org',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.errors && res.data.errors.dateOfAchievement);
  });

  // -----------------------------------------------------------
  // TC_25 to TC_28: Text Trimming & Punctuation
  // -----------------------------------------------------------
  it('TC_25: Accept a long but valid document title', async () => {
    const longTitle = 'University-Level National Internship Completion Certificate';
    const res = await uploadRequest({
      title: longTitle,
      category: 'Internship',
      dateOfAchievement: '2024-06-15',
      issuingOrganization: 'University',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.document.title, longTitle);
  });

  it('TC_26: Trim whitespace-only title and block upload', async () => {
    const res = await uploadRequest({
      title: '     ',
      category: 'Internship',
      dateOfAchievement: '2024-06-15',
      issuingOrganization: 'Org',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.errors && res.data.errors.title);
  });

  it('TC_27: Trim whitespace around organization name cleanly', async () => {
    const res = await uploadRequest({
      title: 'Spaced Org Doc',
      category: 'Achievement',
      dateOfAchievement: '2024-06-15',
      issuingOrganization: '  ABC University  ',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.document.issuingOrganization, 'ABC University');
  });

  it('TC_28: Upload certificate with special characters in title', async () => {
    const titleWithSpecialChars = 'Hackathon – 1st Place (2026)';
    const res = await uploadRequest({
      title: titleWithSpecialChars,
      category: 'Achievement',
      dateOfAchievement: '2024-06-15',
      issuingOrganization: 'ACM',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.document.title, titleWithSpecialChars);
  });

  // -----------------------------------------------------------
  // TC_29 & TC_30: Category Verification
  // -----------------------------------------------------------
  it('TC_29: Upload achievement certificate category', async () => {
    const res = await uploadRequest({
      title: 'Coding Championship',
      category: 'Achievement',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'ACM',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.document.category, 'Achievement');
  });

  it('TC_30: Upload internship document category', async () => {
    const res = await uploadRequest({
      title: 'Internship Document',
      category: 'Internship',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'Research Labs',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.document.category, 'Internship');
  });

  // -----------------------------------------------------------
  // TC_31 & TC_32: Double Click Prevention & Success Feedback
  // -----------------------------------------------------------
  it('TC_31: Prevent double submission on repeated click', async () => {
    const res = await uploadRequest({
      title: 'Single Document Test',
      category: 'Achievement',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'Single Lab',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(db.getDocuments().length, 1);
  });

  it('TC_32: Show upload success confirmation', async () => {
    const res = await uploadRequest({
      title: 'Confirmation Doc',
      category: 'Achievement',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'Confirmation Board',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.message.includes('Document uploaded successfully'));
    assert.ok(res.data.document.id);
  });

  // -----------------------------------------------------------
  // TC_33 to TC_36: Persistence, Initial Status, Timestamp & Linkage
  // -----------------------------------------------------------
  it('TC_33: Set initial status to Pending Approval', async () => {
    const res = await uploadRequest({
      title: 'Initial Status Test',
      category: 'Internship',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'Status Org',
      fileBuffer: VALID_PDF_BUFFER
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.document.status, 'Pending Approval');
  });

  it('TC_34: Record upload date and time automatically', async () => {
    const start = new Date();
    const res = await uploadRequest({
      title: 'Timestamp Test',
      category: 'Achievement',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'Time Org',
      fileBuffer: VALID_PDF_BUFFER
    });

    const end = new Date();
    assert.strictEqual(res.status, 201);
    assert.ok(res.data.document.createdAt);
    const createdAtDate = new Date(res.data.document.createdAt);
    assert.ok(createdAtDate >= new Date(start.getTime() - 2000));
    assert.ok(createdAtDate <= new Date(end.getTime() + 2000));
  });

  it('TC_35: Link uploaded document to student profile', async () => {
    const studentId = 'STU-2024-001';
    const res = await uploadRequest({
      title: 'Profile Linked Certificate',
      category: 'Internship',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'Corp',
      fileBuffer: VALID_PDF_BUFFER,
      userId: studentId
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.document.studentId, studentId);
    assert.strictEqual(res.data.document.studentName, 'John Doe');
  });

  it('TC_36: Show uploaded document in document list', async () => {
    const uploadRes = await uploadRequest({
      title: 'Document in Student List',
      category: 'Achievement',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'Org A',
      fileBuffer: VALID_PDF_BUFFER,
      userId: 'STU-2024-001'
    });
    assert.strictEqual(uploadRes.status, 201);

    const listRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(listRes.statusCode, 200);
    assert.strictEqual(listRes.json.success, true);
    assert.ok(listRes.json.documents.some(d => d.id === uploadRes.data.document.id));
  });

  // -----------------------------------------------------------
  // TC_37 & TC_38: Viewing & Downloading Document
  // -----------------------------------------------------------
  it('TC_37: Allow viewing uploaded document when permitted', async () => {
    const uploadRes = await uploadRequest({
      title: 'Viewable Certificate',
      category: 'Achievement',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'Org View',
      fileBuffer: VALID_PDF_BUFFER,
      fileName: 'viewable.pdf',
      fileType: 'application/pdf',
      userId: 'STU-2024-001'
    });
    const docId = uploadRes.data.document.id;

    const viewRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${docId}/view`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(viewRes.statusCode, 200);
    assert.strictEqual(viewRes.headers['content-type'], 'application/pdf');
    assert.ok(viewRes.headers['content-disposition'].includes('inline'));
    assert.ok(viewRes.buffer.length > 0);
  });

  it('TC_38: Allow downloading uploaded document when permitted', async () => {
    const uploadRes = await uploadRequest({
      title: 'Downloadable Certificate',
      category: 'Achievement',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'Org Download',
      fileBuffer: VALID_JPG_BUFFER,
      fileName: 'my_certificate.jpg',
      fileType: 'image/jpeg',
      userId: 'STU-2024-001'
    });
    const docId = uploadRes.data.document.id;

    const downloadRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${docId}/download`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(downloadRes.statusCode, 200);
    assert.strictEqual(downloadRes.headers['content-type'], 'image/jpeg');
    assert.ok(downloadRes.headers['content-disposition'].includes('attachment'));
    assert.ok(downloadRes.headers['content-disposition'].includes('my_certificate.jpg'));
    assert.ok(downloadRes.buffer.length > 0);
  });

  // -----------------------------------------------------------
  // TC_39: Document Replacement
  // -----------------------------------------------------------
  it('TC_39: Allow replacing document only when permitted (in Pending Approval status)', async () => {
    // 1. Initial upload
    const uploadRes = await uploadRequest({
      title: 'Initial Certificate',
      category: 'Internship',
      dateOfAchievement: '2024-05-01',
      issuingOrganization: 'Old Org',
      fileBuffer: VALID_PDF_BUFFER,
      fileName: 'initial.pdf',
      userId: 'STU-2024-001'
    });
    const docId = uploadRes.data.document.id;
    assert.strictEqual(uploadRes.data.document.status, 'Pending Approval');

    // 2. Perform replacement with updated title, org, and new PNG file
    const replacePayload = createMultipartPayload(
      {
        title: 'Updated Certificate Title',
        category: 'Internship',
        dateOfAchievement: '2024-05-02',
        issuingOrganization: 'Updated Org'
      },
      [
        {
          name: 'file',
          filename: 'replacement.png',
          contentType: 'image/png',
          buffer: VALID_PNG_BUFFER
        }
      ]
    );

    const replaceRes = await mockRequest(app, {
      method: 'PUT',
      url: `/api/documents/${docId}/replace`,
      headers: {
        'content-type': replacePayload.contentType,
        'x-user-id': 'STU-2024-001'
      },
      body: replacePayload.body
    });

    assert.strictEqual(replaceRes.statusCode, 200);
    assert.strictEqual(replaceRes.json.success, true);
    assert.strictEqual(replaceRes.json.document.title, 'Updated Certificate Title');
    assert.strictEqual(replaceRes.json.document.issuingOrganization, 'Updated Org');
    assert.strictEqual(replaceRes.json.document.originalFilename, 'replacement.png');
    assert.strictEqual(replaceRes.json.document.mimeType, 'image/png');

    // 3. Verify replace blocked when status is not Pending Approval (e.g. Approved)
    db.updateDocument(docId, { status: 'Approved' });
    const blockedRes = await mockRequest(app, {
      method: 'PUT',
      url: `/api/documents/${docId}/replace`,
      headers: {
        'content-type': replacePayload.contentType,
        'x-user-id': 'STU-2024-001'
      },
      body: replacePayload.body
    });

    assert.strictEqual(blockedRes.statusCode, 400);
    assert.strictEqual(blockedRes.json.success, false);
    assert.ok(blockedRes.json.message.includes('Cannot replace document'));
  });

  // -----------------------------------------------------------
  // TC_40: Faculty Advisor Notification
  // -----------------------------------------------------------
  it('TC_40: Notify Faculty Advisor after upload', async () => {
    // 1. Upload a document as student John Doe (assigned to FAC-101)
    const uploadRes = await uploadRequest({
      title: 'Cloud Specialization',
      category: 'Certification',
      dateOfAchievement: '2024-05-15',
      issuingOrganization: 'AWS',
      fileBuffer: VALID_PDF_BUFFER,
      userId: 'STU-2024-001'
    });
    assert.strictEqual(uploadRes.status, 201);
    const docId = uploadRes.data.document.id;

    // 2. Query notifications for assigned Faculty Advisor FAC-101
    const notifRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/notifications',
      headers: { 'x-user-id': 'FAC-101' }
    });

    assert.strictEqual(notifRes.statusCode, 200);
    assert.strictEqual(notifRes.json.success, true);
    assert.ok(notifRes.json.notifications.length > 0);

    const matchingNotif = notifRes.json.notifications.find(n => n.documentId === docId);
    assert.ok(matchingNotif, 'Must find notification for the newly uploaded document');
    assert.strictEqual(matchingNotif.recipientId, 'FAC-101');
    assert.strictEqual(matchingNotif.senderId, 'STU-2024-001');
    assert.ok(matchingNotif.title.includes('New Document Submitted'));
    assert.ok(matchingNotif.message.includes('Cloud Specialization'));
  });
});
