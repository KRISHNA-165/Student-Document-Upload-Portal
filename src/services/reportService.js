const db = require('../database/db');
const CONSTANTS = require('../config/constants');

class ReportService {
  /**
   * Generate comprehensive report & analytics for Admin or Faculty
   * Enforces role-based access control and department/advisor scoping
   */
  generateReport(user, options = {}) {
    // 1. Role-based access restriction (TC_01, TC_02)
    if (!user || (user.role !== 'Admin' && user.role !== 'Faculty')) {
      const err = new Error('Access denied: Reports and Analytics are only accessible to Administrators and Faculty Advisors');
      err.statusCode = 403;
      throw err;
    }

    // 2. Validate date range if provided (TC_09)
    const from = options.from || options.startDate;
    const to = options.to || options.endDate;
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime()) && fromDate > toDate) {
        const err = new Error('Start date cannot be later than end date');
        err.statusCode = 400;
        throw err;
      }
    }

    // 3. Retrieve base documents scoped to user role & department (TC_31)
    let docs = [];
    if (user.role === 'Faculty') {
      // Scoped strictly to assigned students
      docs = db.getDocuments({ assignedFacultyAdvisorId: user.id });
    } else {
      // Admin: all documents or filtered by department/advisor
      docs = db.getDocuments();
      if (options.department && options.department !== 'ALL') {
        const deptUsers = db.getUsers({ department: options.department }).map(u => u.id);
        docs = docs.filter(d => deptUsers.includes(d.studentId));
      }
      if (options.advisorId && options.advisorId !== 'ALL') {
        docs = docs.filter(d => d.assignedFacultyAdvisorId === options.advisorId);
      }
    }

    // Ensure deduplication by document ID (TC_26)
    const uniqueMap = new Map();
    for (const d of docs) {
      if (!uniqueMap.has(d.id)) {
        uniqueMap.set(d.id, d);
      }
    }
    docs = Array.from(uniqueMap.values());

    // 4. Filter by Date Range (TC_08, TC_24)
    if (from) {
      const startDate = from.length === 10 ? new Date(`${from}T00:00:00.000Z`) : new Date(from);
      if (!isNaN(startDate.getTime())) {
        docs = docs.filter(d => new Date(d.createdAt || d.submissionDate || 0) >= startDate);
      }
    }
    if (to) {
      const endDate = to.length === 10 ? new Date(`${to}T23:59:59.999Z`) : new Date(to);
      if (!isNaN(endDate.getTime())) {
        docs = docs.filter(d => new Date(d.createdAt || d.submissionDate || 0) <= endDate);
      }
    }

    // 5. Filter by Category (TC_27)
    if (options.category && options.category !== 'ALL' && options.category !== 'All') {
      const targetCat = options.category.trim().toLowerCase();
      docs = docs.filter(d => d.category && d.category.toLowerCase() === targetCat);
    }

    // 6. Filter by Status (TC_22, TC_25, TC_38)
    if (options.status && options.status !== 'ALL' && options.status !== 'All') {
      const targetStatus = options.status.trim().toLowerCase();
      docs = docs.filter(d => d.status && d.status.toLowerCase() === targetStatus);
    }

    // 7. Calculate status metrics (TC_03, TC_04, TC_05, TC_06, TC_07)
    const totalDocuments = docs.length;
    const pendingDocuments = docs.filter(d => d.status === CONSTANTS.STATUSES.PENDING_APPROVAL).length;
    const approvedDocuments = docs.filter(d => d.status === CONSTANTS.STATUSES.APPROVED).length;
    const rejectedDocuments = docs.filter(d => d.status === CONSTANTS.STATUSES.REJECTED).length;

    // Mutually exclusive reconciliation
    const reconciled = totalDocuments === (pendingDocuments + approvedDocuments + rejectedDocuments);

    const decidedCount = approvedDocuments + rejectedDocuments;
    const approvalRate = decidedCount > 0 ? Math.round((approvedDocuments / decidedCount) * 100) : 0;

    // 8. Category Breakdown & Chart Data (TC_14, TC_15)
    const categoryCounts = {};
    for (const d of docs) {
      const cat = d.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    const categoryBreakdown = Object.entries(categoryCounts).map(([category, count]) => ({
      category,
      count,
      percentage: totalDocuments > 0 ? Math.round((count / totalDocuments) * 100) : 0
    }));

    // Status breakdown chart data
    const statusChart = [
      {
        status: 'Pending Approval',
        count: pendingDocuments,
        color: '#f59e0b',
        percentage: totalDocuments > 0 ? Math.round((pendingDocuments / totalDocuments) * 100) : 0
      },
      {
        status: 'Approved',
        count: approvedDocuments,
        color: '#10b981',
        percentage: totalDocuments > 0 ? Math.round((approvedDocuments / totalDocuments) * 100) : 0
      },
      {
        status: 'Rejected',
        count: rejectedDocuments,
        color: '#ef4444',
        percentage: totalDocuments > 0 ? Math.round((rejectedDocuments / totalDocuments) * 100) : 0
      }
    ];

    // 9. Time Period Grouping (TC_28)
    const monthlyGroups = {};
    for (const d of docs) {
      const date = new Date(d.createdAt || d.submissionDate || Date.now());
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyGroups[key]) {
        monthlyGroups[key] = { period: key, total: 0, pending: 0, approved: 0, rejected: 0 };
      }
      monthlyGroups[key].total += 1;
      if (d.status === CONSTANTS.STATUSES.PENDING_APPROVAL) monthlyGroups[key].pending += 1;
      else if (d.status === CONSTANTS.STATUSES.APPROVED) monthlyGroups[key].approved += 1;
      else if (d.status === CONSTANTS.STATUSES.REJECTED) monthlyGroups[key].rejected += 1;
    }
    const periodicData = Object.values(monthlyGroups).sort((a, b) => a.period.localeCompare(b.period));

    // 10. Document detail rows: sanitized, avoiding leaking private storage paths/hashes (TC_29, TC_30)
    const details = docs.map(d => ({
      id: d.id,
      title: d.title,
      category: d.category,
      status: d.status,
      studentName: d.studentName || 'Student',
      studentId: d.studentId,
      registrationNumber: d.studentId,
      issuingOrganization: d.issuingOrganization || '',
      dateOfAchievement: d.dateOfAchievement || '',
      uploadDate: d.createdAt,
      createdAt: d.createdAt
    }));

    const generatedAt = new Date().toISOString();

    return {
      success: true,
      role: user.role,
      userScope: user.role === 'Faculty' ? `Assigned to ${user.name}` : 'Enterprise All Scope',
      generatedAt, // TC_39, TC_40
      filtersApplied: {
        from: from || null,
        to: to || null,
        category: options.category || 'ALL',
        status: options.status || 'ALL'
      },
      metrics: {
        totalDocuments, // TC_03
        pendingDocuments, // TC_04
        approvedDocuments, // TC_05
        rejectedDocuments, // TC_06
        approvalRatePercentage: approvalRate,
        reconciled // TC_07
      },
      charts: {
        statusDistribution: statusChart, // TC_14, TC_15
        categoryDistribution: categoryBreakdown
      },
      periodicData, // TC_28
      detailsCount: details.length,
      details // TC_29, TC_30
    };
  }

  /**
   * Export report data as CSV or Excel (TC_20, TC_21, TC_22, TC_23)
   */
  exportReport(user, options = {}) {
    const report = this.generateReport(user, options);
    const format = (options.format || 'csv').toLowerCase();

    const headers = [
      'Document ID',
      'Document Title',
      'Student Name',
      'Registration Number',
      'Category',
      'Status',
      'Upload Date',
      'Issuing Organization'
    ];

    const escapeCsv = (str) => {
      const s = String(str || '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = report.details.map(d => [
      escapeCsv(d.id),
      escapeCsv(d.title),
      escapeCsv(d.studentName),
      escapeCsv(d.registrationNumber),
      escapeCsv(d.category),
      escapeCsv(d.status),
      escapeCsv(d.uploadDate ? new Date(d.uploadDate).toLocaleString() : ''),
      escapeCsv(d.issuingOrganization)
    ].join(','));

    const todayStr = new Date().toISOString().split('T')[0];

    if (format === 'excel' || format === 'xlsx') {
      // Excel-compatible TSV / HTML Workbook with UTF-8 BOM
      const tsvContent = '\uFEFF' + [
        headers.join('\t'),
        ...report.details.map(d => [
          d.id,
          d.title,
          d.studentName,
          d.registrationNumber,
          d.category,
          d.status,
          d.uploadDate ? new Date(d.uploadDate).toLocaleString() : '',
          d.issuingOrganization
        ].map(s => String(s || '').replace(/\t/g, ' ')).join('\t'))
      ].join('\r\n');

      return {
        content: tsvContent,
        contentType: 'application/vnd.ms-excel; charset=utf-8',
        filename: `academic_records_report_${todayStr}.xls`,
        rowCount: report.details.length
      };
    }

    // Default CSV
    const csvContent = [headers.join(','), ...rows].join('\r\n');
    return {
      content: csvContent,
      contentType: 'text/csv; charset=utf-8',
      filename: `academic_records_report_${todayStr}.csv`,
      rowCount: report.details.length
    };
  }
}

module.exports = new ReportService();
module.exports.ReportService = ReportService;
