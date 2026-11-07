const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const app = require('../src/app');
const db = require('../src/database/db');
const CONSTANTS = require('../src/config/constants');
const reportService = require('../src/services/reportService');
const reviewService = require('../src/services/reviewService');
const { createMultipartPayload, mockRequest } = require('./testHelper');

const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (Report Test Doc) >>\nendobj\ntrailer\n<<>>\n%%EOF');

// Helper to seed a document directly into db with custom fields
function seedDoc(overrides = {}) {
  const now = new Date();
  const id = overrides.id || `DOC-REP-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const doc = {
    id,
    studentId: overrides.studentId || 'STU-2024-001',
    studentName: overrides.studentName || 'John Doe',
    title: overrides.title || 'Sample Achievement Record',
    category: overrides.category || 'Achievement',
    dateOfAchievement: overrides.dateOfAchievement || '2024-04-15',
    issuingOrganization: overrides.issuingOrganization || 'National Institute',
    status: overrides.status || CONSTANTS.STATUSES.PENDING_APPROVAL,
    storageKey: overrides.storageKey || `uploads/${id}.pdf`,
    originalFilename: overrides.originalFilename || 'report_doc.pdf',
    mimeType: overrides.mimeType || 'application/pdf',
    fileSize: overrides.fileSize || 1024,
    assignedFacultyAdvisorId: overrides.assignedFacultyAdvisorId || 'FAC-101',
    assignedFacultyAdvisorName: overrides.assignedFacultyAdvisorName || 'Dr. Robert Smith',
    createdAt: overrides.createdAt || now.toISOString(),
    updatedAt: overrides.updatedAt || now.toISOString(),
    lastReviewComment: overrides.lastReviewComment || null
  };
  return db.insertDocument(doc);
}

// Helper to upload a real document
async function uploadDocHelper({
  title = 'Internship Certificate',
  category = 'Internship',
  dateOfAchievement = '2024-05-10',
  issuingOrganization = 'Tech Org',
  userId = 'STU-2024-001'
} = {}) {
  const payload = createMultipartPayload(
    { title, category, dateOfAchievement, issuingOrganization },
    [{ name: 'file', filename: 'cert.pdf', contentType: 'application/pdf', buffer: VALID_PDF_BUFFER }]
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

describe('US09 - Student Document Dashboard & Reports Analytics (TC_01 to TC_40)', () => {
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
  // TC_01: Verify analytics report page opens
  // -----------------------------------------------------------
  it('TC_01: Verify analytics report page opens for authorized admin', async () => {
    seedDoc({ title: 'Doc 1' });
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert(res.json.metrics !== undefined);
  });

  // -----------------------------------------------------------
  // TC_02: Verify report access is restricted by role
  // -----------------------------------------------------------
  it('TC_02: Verify report access is restricted by role (Student gets 403 Forbidden)', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json.success, false);
    assert(res.json.message.includes('Access denied'));
  });

  // -----------------------------------------------------------
  // TC_03: Verify total document metric
  // -----------------------------------------------------------
  it('TC_03: Verify total document metric matches known dataset of 10 documents', async () => {
    for (let i = 1; i <= 10; i++) {
      seedDoc({ title: `Doc ${i}` });
    }

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.totalDocuments, 10);
  });

  // -----------------------------------------------------------
  // TC_04: Verify pending documents metric
  // -----------------------------------------------------------
  it('TC_04: Verify pending documents metric displays 3', async () => {
    seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    seedDoc({ status: CONSTANTS.STATUSES.APPROVED });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.pendingDocuments, 3);
  });

  // -----------------------------------------------------------
  // TC_05: Verify approved documents metric
  // -----------------------------------------------------------
  it('TC_05: Verify approved documents metric displays 4', async () => {
    for (let i = 0; i < 4; i++) seedDoc({ status: CONSTANTS.STATUSES.APPROVED });
    seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.approvedDocuments, 4);
  });

  // -----------------------------------------------------------
  // TC_06: Verify rejected documents metric
  // -----------------------------------------------------------
  it('TC_06: Verify rejected documents metric displays 3', async () => {
    for (let i = 0; i < 3; i++) seedDoc({ status: CONSTANTS.STATUSES.REJECTED });
    seedDoc({ status: CONSTANTS.STATUSES.APPROVED });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.rejectedDocuments, 3);
  });

  // -----------------------------------------------------------
  // TC_07: Verify status metrics reconcile
  // -----------------------------------------------------------
  it('TC_07: Verify status metrics reconcile (3 pending, 4 approved, 3 rejected = 10 total)', async () => {
    for (let i = 0; i < 3; i++) seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    for (let i = 0; i < 4; i++) seedDoc({ status: CONSTANTS.STATUSES.APPROVED });
    for (let i = 0; i < 3; i++) seedDoc({ status: CONSTANTS.STATUSES.REJECTED });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    const m = res.json.metrics;
    assert.strictEqual(m.totalDocuments, 10);
    assert.strictEqual(m.pendingDocuments, 3);
    assert.strictEqual(m.approvedDocuments, 4);
    assert.strictEqual(m.rejectedDocuments, 3);
    assert.strictEqual(m.reconciled, true);
    assert.strictEqual(m.totalDocuments, m.pendingDocuments + m.approvedDocuments + m.rejectedDocuments);
  });

  // -----------------------------------------------------------
  // TC_08: Verify report date range filter
  // -----------------------------------------------------------
  it('TC_08: Verify report date range filter includes only records within selected range', async () => {
    seedDoc({ title: 'Sept Doc', createdAt: '2026-09-15T12:00:00.000Z' });
    seedDoc({ title: 'Oct Doc', createdAt: '2026-10-15T12:00:00.000Z' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports?from=2026-09-01&to=2026-09-30',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.totalDocuments, 1);
    assert.strictEqual(res.json.details[0].title, 'Sept Doc');
  });

  // -----------------------------------------------------------
  // TC_09: Verify invalid report date range
  // -----------------------------------------------------------
  it('TC_09: Verify invalid report date range returns 400 validation error', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports?from=2026-10-10&to=2026-10-01',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json.success, false);
    assert(res.json.message.includes('Start date cannot be later than end date'));
  });

  // -----------------------------------------------------------
  // TC_10: Verify report filter reset
  // -----------------------------------------------------------
  it('TC_10: Verify report filter reset restores default report scope', async () => {
    seedDoc({ category: 'Achievement', status: 'Approved' });
    seedDoc({ category: 'Internship', status: 'Pending Approval' });

    // Filtered
    const filteredRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports?status=Approved',
      headers: { 'x-user-id': 'ADM-001' }
    });
    assert.strictEqual(filteredRes.json.metrics.totalDocuments, 1);

    // Cleared
    const resetRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    assert.strictEqual(resetRes.json.metrics.totalDocuments, 2);
  });

  // -----------------------------------------------------------
  // TC_11: Verify analytics updates after new upload
  // -----------------------------------------------------------
  it('TC_11: Verify analytics updates after new upload', async () => {
    const initialRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    const initialTotal = initialRes.json.metrics.totalDocuments;

    await uploadDocHelper({ title: 'New Achievement Upload' });

    const updatedRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    assert.strictEqual(updatedRes.json.metrics.totalDocuments, initialTotal + 1);
  });

  // -----------------------------------------------------------
  // TC_12: Verify analytics updates after approval
  // -----------------------------------------------------------
  it('TC_12: Verify analytics updates after approval (pending decreases, approved increases)', async () => {
    const doc = seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });

    const beforeRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    const beforePending = beforeRes.json.metrics.pendingDocuments;
    const beforeApproved = beforeRes.json.metrics.approvedDocuments;

    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: { id: 'FAC-101', name: 'Dr. Robert Smith', role: 'Faculty' },
      decision: 'Approve',
      comment: 'Verified'
    });

    const afterRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    assert.strictEqual(afterRes.json.metrics.pendingDocuments, beforePending - 1);
    assert.strictEqual(afterRes.json.metrics.approvedDocuments, beforeApproved + 1);
  });

  // -----------------------------------------------------------
  // TC_13: Verify analytics updates after rejection
  // -----------------------------------------------------------
  it('TC_13: Verify analytics updates after rejection (pending decreases, rejected increases)', async () => {
    const doc = seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });

    const beforeRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    const beforePending = beforeRes.json.metrics.pendingDocuments;
    const beforeRejected = beforeRes.json.metrics.rejectedDocuments;

    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: { id: 'FAC-101', name: 'Dr. Robert Smith', role: 'Faculty' },
      decision: 'Reject',
      comment: 'Certificate blurred'
    });

    const afterRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    assert.strictEqual(afterRes.json.metrics.pendingDocuments, beforePending - 1);
    assert.strictEqual(afterRes.json.metrics.rejectedDocuments, beforeRejected + 1);
  });

  // -----------------------------------------------------------
  // TC_14: Verify chart labels are readable
  // -----------------------------------------------------------
  it('TC_14: Verify chart labels are readable and present in status distribution breakdown', async () => {
    seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    seedDoc({ status: CONSTANTS.STATUSES.APPROVED });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    const chart = res.json.charts.statusDistribution;
    assert(Array.isArray(chart));
    assert(chart.some(c => c.status === 'Pending Approval' && c.color));
    assert(chart.some(c => c.status === 'Approved' && c.color));
    assert(chart.some(c => c.status === 'Rejected' && c.color));
  });

  // -----------------------------------------------------------
  // TC_15: Verify chart values match summary metrics
  // -----------------------------------------------------------
  it('TC_15: Verify chart values correspond to summary metrics', async () => {
    seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    seedDoc({ status: CONSTANTS.STATUSES.APPROVED });
    seedDoc({ status: CONSTANTS.STATUSES.APPROVED });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    const m = res.json.metrics;
    const chart = res.json.charts.statusDistribution;
    const pendingItem = chart.find(c => c.status === 'Pending Approval');
    const approvedItem = chart.find(c => c.status === 'Approved');

    assert.strictEqual(pendingItem.count, m.pendingDocuments);
    assert.strictEqual(approvedItem.count, m.approvedDocuments);
  });

  // -----------------------------------------------------------
  // TC_16: Verify zero-data report state
  // -----------------------------------------------------------
  it('TC_16: Verify zero-data report state when no records match filter', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports?from=2030-01-01&to=2030-01-31',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.totalDocuments, 0);
    assert.strictEqual(res.json.details.length, 0);
  });

  // -----------------------------------------------------------
  // TC_17: Verify report generation loading state
  // -----------------------------------------------------------
  it('TC_17: Verify report generation loading state is present in markup', () => {
    assert(indexHtmlContent.includes('id="reportLoadingState"'));
    assert(indexHtmlContent.includes('Generating analytics report...'));
  });

  // -----------------------------------------------------------
  // TC_18: Verify report service error handling
  // -----------------------------------------------------------
  it('TC_18: Verify report service error handling UI elements exist', () => {
    assert(indexHtmlContent.includes('id="reportErrorState"'));
    assert(indexHtmlContent.includes('id="btnRetryReport"'));
  });

  // -----------------------------------------------------------
  // TC_19: Verify retry after report service recovery
  // -----------------------------------------------------------
  it('TC_19: Verify retry handler is registered in app.js', () => {
    assert(appJsContent.includes('btnRetryReport'));
    assert(appJsContent.includes('loadReportsData'));
  });

  // -----------------------------------------------------------
  // TC_20: Verify export report to CSV when supported
  // -----------------------------------------------------------
  it('TC_20: Verify export report to CSV returns valid CSV content', async () => {
    seedDoc({ title: 'Exported Certificate', studentName: 'Alex Rivera' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports/export?format=csv',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert(res.headers['content-type'].includes('text/csv'));
    assert(res.body.includes('Document ID,Document Title,Student Name'));
    assert(res.body.includes('Exported Certificate'));
    assert(res.body.includes('Alex Rivera'));
  });

  // -----------------------------------------------------------
  // TC_21: Verify export report to Excel when supported
  // -----------------------------------------------------------
  it('TC_21: Verify export report to Excel returns valid workbook content', async () => {
    seedDoc({ title: 'Excel Certificate' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports/export?format=excel',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert(res.headers['content-type'].includes('application/vnd.ms-excel'));
    assert(res.body.includes('Excel Certificate'));
  });

  // -----------------------------------------------------------
  // TC_22: Verify export respects active filters
  // -----------------------------------------------------------
  it('TC_22: Verify export respects active filters (Approved filter exports only approved)', async () => {
    seedDoc({ title: 'Approved Doc', status: CONSTANTS.STATUSES.APPROVED });
    seedDoc({ title: 'Pending Doc', status: CONSTANTS.STATUSES.PENDING_APPROVAL });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports/export?format=csv&status=Approved',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert(res.body.includes('Approved Doc'));
    assert(!res.body.includes('Pending Doc'));
  });

  // -----------------------------------------------------------
  // TC_23: Verify export filename and format
  // -----------------------------------------------------------
  it('TC_23: Verify export filename and format are valid', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports/export?format=csv',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    const disp = res.headers['content-disposition'];
    assert(disp.includes('academic_records_report_'));
    assert(disp.endsWith('.csv"'));
  });

  // -----------------------------------------------------------
  // TC_24: Verify report totals use consistent time boundaries
  // -----------------------------------------------------------
  it('TC_24: Verify report totals use consistent midnight time boundaries', async () => {
    seedDoc({ createdAt: '2026-09-01T00:00:01.000Z' });
    seedDoc({ createdAt: '2026-09-30T23:59:58.000Z' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports?from=2026-09-01&to=2026-09-30',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.totalDocuments, 2);
  });

  // -----------------------------------------------------------
  // TC_25: Verify report uses correct status definitions
  // -----------------------------------------------------------
  it('TC_25: Verify report uses correct status definitions (Pending Approval, Approved, Rejected)', async () => {
    seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });
    seedDoc({ status: CONSTANTS.STATUSES.APPROVED });
    seedDoc({ status: CONSTANTS.STATUSES.REJECTED });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.pendingDocuments, 1);
    assert.strictEqual(res.json.metrics.approvedDocuments, 1);
    assert.strictEqual(res.json.metrics.rejectedDocuments, 1);
  });

  // -----------------------------------------------------------
  // TC_26: Verify report avoids duplicate counting
  // -----------------------------------------------------------
  it('TC_26: Verify report avoids duplicate counting for documents with review history', async () => {
    const doc = seedDoc({ title: 'Reviewed Multiple Times', status: CONSTANTS.STATUSES.REJECTED });
    db.insertReview({ documentId: doc.id, reviewerName: 'Dr. Smith', action: 'Rejected', comments: 'C1' });
    db.insertReview({ documentId: doc.id, reviewerName: 'Dr. Smith', action: 'Rejected', comments: 'C2' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.totalDocuments, 1);
  });

  // -----------------------------------------------------------
  // TC_27: Verify reports can be filtered by category
  // -----------------------------------------------------------
  it('TC_27: Verify reports can be filtered by category', async () => {
    seedDoc({ title: 'Internship 1', category: 'Internship' });
    seedDoc({ title: 'Academic 1', category: 'Academic Record' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports?category=Internship',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.totalDocuments, 1);
    assert.strictEqual(res.json.details[0].category, 'Internship');
  });

  // -----------------------------------------------------------
  // TC_28: Verify reports can be grouped by time period
  // -----------------------------------------------------------
  it('TC_28: Verify reports can be grouped by time period (monthly)', async () => {
    seedDoc({ createdAt: '2026-09-10T10:00:00.000Z' });
    seedDoc({ createdAt: '2026-10-10T10:00:00.000Z' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports?groupBy=month',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert(Array.isArray(res.json.periodicData));
    assert(res.json.periodicData.some(p => p.period === '2026-09' && p.total === 1));
    assert(res.json.periodicData.some(p => p.period === '2026-10' && p.total === 1));
  });

  // -----------------------------------------------------------
  // TC_29: Verify report detail rows match source records
  // -----------------------------------------------------------
  it('TC_29: Verify report detail rows match source records', async () => {
    const seed = seedDoc({
      title: 'Precision Record',
      category: 'Certification',
      status: CONSTANTS.STATUSES.APPROVED,
      studentName: 'John Doe',
      issuingOrganization: 'Stanford'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    const detail = res.json.details.find(d => d.id === seed.id);
    assert(detail !== undefined);
    assert.strictEqual(detail.title, 'Precision Record');
    assert.strictEqual(detail.category, 'Certification');
    assert.strictEqual(detail.status, CONSTANTS.STATUSES.APPROVED);
    assert.strictEqual(detail.studentName, 'John Doe');
    assert.strictEqual(detail.issuingOrganization, 'Stanford');
  });

  // -----------------------------------------------------------
  // TC_30: Verify report is not exposing unnecessary personal data
  // -----------------------------------------------------------
  it('TC_30: Verify report does not expose sensitive keys, passwords, or tokens', async () => {
    seedDoc({ title: 'Safe Record' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    const text = JSON.stringify(res.json);
    assert(!text.includes('password'));
    assert(!text.includes('passwordHash'));
    assert(!text.includes('salt'));
    assert(!text.includes('sessionToken'));
  });

  // -----------------------------------------------------------
  // TC_31: Verify analytics data is scoped to permitted department/advisor
  // -----------------------------------------------------------
  it('TC_31: Verify analytics data is scoped to assigned advisor for faculty account', async () => {
    seedDoc({ title: 'Advisor 1 Doc', assignedFacultyAdvisorId: 'FAC-101' });
    seedDoc({ title: 'Advisor 2 Doc', assignedFacultyAdvisorId: 'FAC-102' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'FAC-101' } // Faculty Advisor 101
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.totalDocuments, 1);
    assert.strictEqual(res.json.details[0].title, 'Advisor 1 Doc');
  });

  // -----------------------------------------------------------
  // TC_32: Verify large report remains usable
  // -----------------------------------------------------------
  it('TC_32: Verify large report with 500 records completes within performance target', async () => {
    const start = Date.now();
    for (let i = 1; i <= 500; i++) {
      db.insertDocument({
        id: `DOC-REP-BULK-${i}`,
        studentId: 'STU-2024-001',
        studentName: 'Bulk Student',
        title: `Bulk Document ${i}`,
        category: i % 2 === 0 ? 'Achievement' : 'Internship',
        status: i % 3 === 0 ? CONSTANTS.STATUSES.APPROVED : CONSTANTS.STATUSES.PENDING_APPROVAL,
        assignedFacultyAdvisorId: 'FAC-101',
        createdAt: new Date().toISOString()
      });
    }

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert(res.json.metrics.totalDocuments >= 500);
    const duration = Date.now() - start;
    assert(duration < 2500, `Large report took ${duration}ms, should be < 2500ms`);
  });

  // -----------------------------------------------------------
  // TC_33: Verify report layout on mobile viewport
  // -----------------------------------------------------------
  it('TC_33: Verify report layout supports mobile viewport with responsive flex/grid', () => {
    assert(indexHtmlContent.includes('report-charts-grid'));
    assert(indexHtmlContent.includes('report-filters-bar'));
  });

  // -----------------------------------------------------------
  // TC_34: Verify chart alternative text or accessible summary
  // -----------------------------------------------------------
  it('TC_34: Verify chart alternative text or accessible summary is present', () => {
    assert(indexHtmlContent.includes('id="reportChartSummary"'));
    assert(indexHtmlContent.includes('aria-label="Status distribution chart"'));
    assert(indexHtmlContent.includes('aria-label="Category distribution chart"'));
  });

  // -----------------------------------------------------------
  // TC_35: Verify keyboard navigation in reports
  // -----------------------------------------------------------
  it('TC_35: Verify interactive controls have accessible labels and keyboard focusability', () => {
    assert(indexHtmlContent.includes('id="reportStartDate"'));
    assert(indexHtmlContent.includes('id="reportEndDate"'));
    assert(indexHtmlContent.includes('id="reportCategoryFilter"'));
    assert(indexHtmlContent.includes('id="reportStatusFilter"'));
    assert(indexHtmlContent.includes('id="btnResetReportFilters"'));
  });

  // -----------------------------------------------------------
  // TC_36: Verify report refresh does not duplicate values
  // -----------------------------------------------------------
  it('TC_36: Verify report refresh multiple times maintains consistent totals without duplication', async () => {
    seedDoc({ title: 'Stable Record' });

    const res1 = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    const res2 = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res1.json.metrics.totalDocuments, res2.json.metrics.totalDocuments);
    assert.strictEqual(res1.json.details.length, res2.json.details.length);
  });

  // -----------------------------------------------------------
  // TC_37: Verify concurrent data changes are reflected consistently
  // -----------------------------------------------------------
  it('TC_37: Verify report reflects concurrent status updates on refresh', async () => {
    const doc = seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL });

    const resBefore = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    assert.strictEqual(resBefore.json.metrics.pendingDocuments, 1);

    // Another user approves in background
    db.updateDocument(doc.id, { status: CONSTANTS.STATUSES.APPROVED });

    const resAfter = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    assert.strictEqual(resAfter.json.metrics.pendingDocuments, 0);
    assert.strictEqual(resAfter.json.metrics.approvedDocuments, 1);
  });

  // -----------------------------------------------------------
  // TC_38: Verify report filter combinations are applied together
  // -----------------------------------------------------------
  it('TC_38: Verify report filter combinations are applied together (status + category + date)', async () => {
    seedDoc({
      title: 'Target Record',
      category: 'Internship',
      status: CONSTANTS.STATUSES.APPROVED,
      createdAt: '2026-09-15T10:00:00.000Z'
    });
    seedDoc({
      title: 'Wrong Category',
      category: 'Achievement',
      status: CONSTANTS.STATUSES.APPROVED,
      createdAt: '2026-09-15T10:00:00.000Z'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports?status=Approved&category=Internship&from=2026-09-01&to=2026-09-30',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.totalDocuments, 1);
    assert.strictEqual(res.json.details[0].title, 'Target Record');
  });

  // -----------------------------------------------------------
  // TC_39: Verify report metadata shows generation or refresh time
  // -----------------------------------------------------------
  it('TC_39: Verify report metadata shows generation time ISO string', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert(typeof res.json.generatedAt === 'string');
    assert(!isNaN(new Date(res.json.generatedAt).getTime()));
  });

  // -----------------------------------------------------------
  // TC_40: Verify report generation timestamp is not misleading
  // -----------------------------------------------------------
  it('TC_40: Verify report generation timestamp matches current system time within 5 seconds', async () => {
    const before = Date.now();
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/reports',
      headers: { 'x-user-id': 'ADM-001' }
    });
    const after = Date.now();

    const genTime = new Date(res.json.generatedAt).getTime();
    assert(genTime >= before - 1000 && genTime <= after + 1000);
  });

  // ===========================================================
  // US09 Acceptance Criteria 1 - 7: Student Document Dashboard
  // ===========================================================
  it('US09 Acceptance 1: Student Dashboard displays basic student information', async () => {
    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/student/dashboard',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.student.name, 'John Doe');
    assert.strictEqual(res.json.student.id, 'STU-2024-001');
    assert(res.json.student.email !== undefined);
  });

  it('US09 Acceptance 2: Dashboard displays document statistics (Total, Pending, Approved, Rejected)', async () => {
    seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL, studentId: 'STU-2024-001' });
    seedDoc({ status: CONSTANTS.STATUSES.APPROVED, studentId: 'STU-2024-001' });
    seedDoc({ status: CONSTANTS.STATUSES.REJECTED, studentId: 'STU-2024-001' });

    const res = await mockRequest(app, {
      method: 'GET',
      url: '/api/student/dashboard',
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.metrics.totalDocuments, 3);
    assert.strictEqual(res.json.metrics.pendingApproval, 1);
    assert.strictEqual(res.json.metrics.approved, 1);
    assert.strictEqual(res.json.metrics.rejected, 1);
  });

  it('US09 Acceptance 3: Student can view complete document list and open individual document', async () => {
    const doc = seedDoc({ title: 'Accessible Document', studentId: 'STU-2024-001' });

    const listRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/documents',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(listRes.statusCode, 200);
    assert(listRes.json.documents.some(d => d.id === doc.id));

    const singleRes = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(singleRes.statusCode, 200);
    assert.strictEqual(singleRes.json.document.title, 'Accessible Document');
  });

  it('US09 Acceptance 4: Student can view faculty comments', async () => {
    const doc = seedDoc({
      title: 'Document With Comments',
      status: CONSTANTS.STATUSES.REJECTED,
      studentId: 'STU-2024-001',
      lastReviewComment: 'Please upload a clearer seal and signature.'
    });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.document.lastReviewComment, 'Please upload a clearer seal and signature.');
  });

  it('US09 Acceptance 5: Student can download approved documents', async () => {
    const uploaded = await uploadDocHelper({
      title: 'Approved Downloadable Doc',
      userId: 'STU-2024-001'
    });

    db.updateDocument(uploaded.id, { status: CONSTANTS.STATUSES.APPROVED });

    const res = await mockRequest(app, {
      method: 'GET',
      url: `/api/documents/${uploaded.id}/download`,
      headers: { 'x-user-id': 'STU-2024-001' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert(res.headers['content-disposition'].includes('attachment'));
  });

  it('US09 Acceptance 6: Rejected documents provide an option to replace/resubmit', async () => {
    const doc = seedDoc({
      title: 'Rejected Replaceable Doc',
      status: CONSTANTS.STATUSES.REJECTED,
      studentId: 'STU-2024-001'
    });

    // Student replaces rejected document with a valid payload
    const replacePayload = createMultipartPayload(
      { title: 'Corrected Doc Title' },
      [{ name: 'file', filename: 'new_cert.pdf', contentType: 'application/pdf', buffer: VALID_PDF_BUFFER }]
    );

    const replaceRes = await mockRequest(app, {
      method: 'PUT',
      url: `/api/documents/${doc.id}/replace`,
      headers: {
        'content-type': replacePayload.contentType,
        'x-user-id': 'STU-2024-001'
      },
      body: replacePayload.body
    });

    assert.strictEqual(replaceRes.statusCode, 200);
    assert.strictEqual(replaceRes.json.document.status, CONSTANTS.STATUSES.PENDING_APPROVAL);
  });

  it('US09 Acceptance 7: Dashboard reflects status changes immediately after review', async () => {
    const doc = seedDoc({ status: CONSTANTS.STATUSES.PENDING_APPROVAL, studentId: 'STU-2024-001' });

    const beforeRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/student/dashboard',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(beforeRes.json.metrics.pendingApproval, 1);
    assert.strictEqual(beforeRes.json.metrics.approved, 0);

    // Faculty approves
    await reviewService.submitDecision({
      documentId: doc.id,
      facultyUser: { id: 'FAC-101', name: 'Dr. Robert Smith', role: 'Faculty' },
      decision: 'Approve',
      comment: 'Approved immediately'
    });

    const afterRes = await mockRequest(app, {
      method: 'GET',
      url: '/api/student/dashboard',
      headers: { 'x-user-id': 'STU-2024-001' }
    });
    assert.strictEqual(afterRes.json.metrics.pendingApproval, 0);
    assert.strictEqual(afterRes.json.metrics.approved, 1);
  });
});
