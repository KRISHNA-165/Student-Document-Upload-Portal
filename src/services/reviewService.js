const crypto = require('crypto');
const db = require('../database/db');
const CONSTANTS = require('../config/constants');
const storageService = require('./storageService');
const auditService = require('./auditService');

class ReviewService {
  /**
   * Get documents submitted by students assigned to the given faculty advisor
   */
  getAssignedDocuments(facultyUser, options = {}) {
    if (!facultyUser || facultyUser.role !== 'Faculty') {
      const err = new Error('Unauthorized: Only faculty members can view review queues');
      err.statusCode = 403;
      throw err;
    }

    const {
      status = 'Pending Approval',
      category,
      search,
      startDate,
      endDate,
      studentId,
      student,
      sort,
      sortBy,
      sortOrder
    } = options;

    // 1. Validate date range if provided (TC_15)
    const from = startDate || options.from;
    const to = endDate || options.to;
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime()) && fromDate > toDate) {
        const err = new Error('Start date cannot be later than end date');
        err.statusCode = 400;
        throw err;
      }
    }

    // 2. Filter documents strictly by assigned faculty advisor (AC_3, TC_25, TC_26)
    let docs = db.getDocuments({ assignedFacultyAdvisorId: facultyUser.id });

    // 3. Filter by student if provided (AC_4)
    const targetStudentId = studentId || student;
    if (targetStudentId && targetStudentId !== 'ALL' && targetStudentId !== 'all') {
      docs = docs.filter(d => d.studentId === targetStudentId);
    }

    // 4. Filter by status if specified (e.g. Pending Approval, Approved, Rejected)
    if (status && status !== 'ALL' && status !== 'all') {
      const targetStatus = status.trim().toLowerCase();
      docs = docs.filter(d => d.status && d.status.toLowerCase() === targetStatus);
    }

    // 5. Filter by Category if provided (TC_13)
    if (category && category !== 'ALL' && category !== 'all') {
      const targetCategory = category.trim().toLowerCase();
      docs = docs.filter(d => d.category && d.category.toLowerCase() === targetCategory);
    }

    // 6. Filter/Search by student name, ID, title, org, or category (TC_02 - TC_06, TC_22 - TC_24)
    if (search !== undefined && search !== null) {
      const q = String(search).trim().toLowerCase();
      if (q.length > 0) {
        docs = docs.filter(d =>
          (d.studentName && d.studentName.toLowerCase().includes(q)) ||
          (d.studentId && d.studentId.toLowerCase().includes(q)) ||
          (d.title && d.title.toLowerCase().includes(q)) ||
          (d.issuingOrganization && d.issuingOrganization.toLowerCase().includes(q)) ||
          (d.category && d.category.toLowerCase().includes(q))
        );
      }
    }

    // 7. Filter by date range (TC_14)
    if (from) {
      const start = new Date(from);
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        docs = docs.filter(d => new Date(d.createdAt) >= start);
      }
    }
    if (to) {
      const end = new Date(to);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        docs = docs.filter(d => new Date(d.createdAt) <= end);
      }
    }

    // 8. Sorting (TC_18 - TC_21)
    const activeSort = (sort || sortBy || 'newest').toLowerCase();
    const defaultOrder = (activeSort === 'oldest' || activeSort === 'title_asc' || activeSort === 'title' || activeSort === 'status') ? 'asc' : 'desc';
    const activeOrder = (sortOrder || defaultOrder).toLowerCase();

    if (activeSort === 'title' || activeSort === 'title_asc' || activeSort === 'title_desc') {
      const isDesc = activeSort === 'title_desc' || (activeSort !== 'title_asc' && activeSort !== 'title' && activeOrder === 'desc') || (sortOrder === 'desc');
      docs.sort((a, b) => {
        const res = (a.title || '').localeCompare(b.title || '');
        return isDesc ? -res : res;
      });
    } else if (activeSort === 'status') {
      const statusRank = {
        'pending approval': 1,
        'approved': 2,
        'rejected': 3
      };
      const isDesc = sortOrder === 'desc';
      docs.sort((a, b) => {
        const rankA = statusRank[(a.status || '').toLowerCase()] || 99;
        const rankB = statusRank[(b.status || '').toLowerCase()] || 99;
        if (rankA !== rankB) {
          return isDesc ? rankB - rankA : rankA - rankB;
        }
        return (a.title || '').localeCompare(b.title || '');
      });
    } else {
      docs.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        if (timeA !== timeB) {
          return activeOrder === 'asc' ? timeA - timeB : timeB - timeA;
        }
        return activeOrder === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
      });
    }

    // 9. Pagination
    const totalCount = docs.length;
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.max(1, parseInt(options.limit, 10) || 10);
    let paginatedDocs = docs;
    if (options.page !== undefined || options.limit !== undefined) {
      const start = (page - 1) * limit;
      paginatedDocs = docs.slice(start, start + limit);
    }
    const totalPages = limit > 0 ? Math.ceil(totalCount / limit) : 1;

    // Map fields ensuring registrationNumber and uploadDate are explicitly present
    const mapped = paginatedDocs.map(doc => ({
      ...doc,
      registrationNumber: doc.studentId,
      uploadDate: doc.createdAt
    }));

    const returnArr = [...mapped];
    returnArr.documents = mapped;
    returnArr.total = totalCount;
    returnArr.page = page;
    returnArr.limit = limit;
    returnArr.totalPages = totalPages;

    return returnArr;
  }

  /**
   * Get distinct assigned students for the logged-in faculty advisor
   */
  getAssignedStudents(facultyUser) {
    if (!facultyUser || facultyUser.role !== 'Faculty') {
      const err = new Error('Unauthorized: Only faculty members can view assigned students');
      err.statusCode = 403;
      throw err;
    }

    const users = db.getUsers({ role: 'Student', assignedFacultyAdvisorId: facultyUser.id });
    return users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      registrationNumber: u.id,
      department: u.department || 'Computer Science'
    }));
  }

  /**
   * Get single document details with assignment validation
   */
  getDocumentForReview(documentId, facultyUser) {
    if (!facultyUser || facultyUser.role !== 'Faculty') {
      const err = new Error('Unauthorized: Only faculty members can access review details');
      err.statusCode = 403;
      throw err;
    }

    const doc = db.getDocumentById(documentId);
    if (!doc) {
      const err = new Error('Document not found');
      err.statusCode = 404;
      throw err;
    }

    // Security check: Must be assigned to this faculty advisor (TC_24)
    if (doc.assignedFacultyAdvisorId !== facultyUser.id) {
      const err = new Error('Access denied: You are not the assigned advisor for this student');
      err.statusCode = 403;
      throw err;
    }

    // Check file availability in storage (TC_12)
    const fileAvailable = storageService.fileExists(doc.storageKey);

    const history = db.getReviewsForDocument(documentId);

    return {
      document: {
        ...doc,
        registrationNumber: doc.studentId,
        uploadDate: doc.createdAt,
        fileAvailable
      },
      history
    };
  }

  /**
   * Submit Review Decision (Approve or Reject)
   */
  async submitDecision({ documentId, facultyUser, decision, comment = '' }) {
    // 1. Role validation (TC_25)
    if (!facultyUser || facultyUser.role !== 'Faculty') {
      const err = new Error('Unauthorized: Students cannot approve or reject documents');
      err.statusCode = 403;
      throw err;
    }

    // 2. Fetch document
    const doc = db.getDocumentById(documentId);
    if (!doc) {
      const err = new Error('Document not found');
      err.statusCode = 404;
      throw err;
    }

    // 3. Assignment permission check (TC_24)
    if (doc.assignedFacultyAdvisorId !== facultyUser.id) {
      const err = new Error('Access denied: You can only review documents for your assigned students');
      err.statusCode = 403;
      throw err;
    }

    // 4. State validation: Document must be currently Pending Approval (TC_27, TC_30)
    if (doc.status !== CONSTANTS.STATUSES.PENDING_APPROVAL) {
      const err = new Error(`Cannot review document. Document has already been ${doc.status.toLowerCase()}. Conflicting repeated decisions are not permitted.`);
      err.statusCode = 400;
      throw err;
    }

    // 5. Decision validation
    const normalizedDecision = decision === 'Approve' || decision === 'Approved' ? CONSTANTS.STATUSES.APPROVED :
                              (decision === 'Reject' || decision === 'Rejected' ? CONSTANTS.STATUSES.REJECTED : null);

    if (!normalizedDecision) {
      const err = new Error('Invalid decision. Must be "Approve" or "Reject"');
      err.statusCode = 400;
      throw err;
    }

    const trimmedComment = String(comment || '').trim();

    // 6. Comment validation (TC_16, TC_17, TC_14, TC_15)
    if (normalizedDecision === CONSTANTS.STATUSES.REJECTED) {
      if (!trimmedComment || trimmedComment.length === 0) {
        const err = new Error('Rejection reason is mandatory. Please provide a reason for rejecting the document.');
        err.statusCode = 400;
        throw err;
      }
    }

    const now = new Date().toISOString();

    // 7. Update document status immediately (TC_13, TC_16, TC_20, TC_21)
    const updatedDoc = db.updateDocument(documentId, {
      status: normalizedDecision,
      lastReviewedAt: now,
      lastReviewedBy: facultyUser.name,
      lastReviewerId: facultyUser.id,
      lastReviewComment: trimmedComment
    });

    // 8. Record Review History Event (TC_22, TC_23, TC_38, TC_39)
    const reviewEvent = {
      id: `REV-${crypto.randomUUID()}`,
      documentId: doc.id,
      documentTitle: doc.title,
      studentId: doc.studentId,
      studentName: doc.studentName,
      reviewerId: facultyUser.id,
      reviewerName: facultyUser.name,
      reviewerRole: facultyUser.role,
      action: normalizedDecision,
      comments: trimmedComment,
      timestamp: now
    };

    db.insertReview(reviewEvent);

    // 9. Send notification to student (TC_36, TC_37)
    let notifTitle = '';
    let notifMsg = '';

    if (normalizedDecision === CONSTANTS.STATUSES.APPROVED) {
      notifTitle = 'Document Approved';
      notifMsg = `Your document "${doc.title}" has been approved by ${facultyUser.name}.${trimmedComment ? ` Feedback: "${trimmedComment}"` : ''}`;
    } else {
      notifTitle = 'Document Rejected';
      notifMsg = `Your document "${doc.title}" was rejected by ${facultyUser.name}. Reason: "${trimmedComment}"`;
    }

    db.insertNotification({
      id: `NOTIF-${crypto.randomUUID()}`,
      recipientId: doc.studentId,
      senderId: facultyUser.id,
      documentId: doc.id,
      documentTitle: doc.title,
      title: notifTitle,
      message: notifMsg,
      read: false,
      createdAt: now
    });

    // 10. Audit Log
    auditService.log({
      action: `DOCUMENT_${normalizedDecision.toUpperCase()}`,
      actorId: facultyUser.id,
      actorRole: facultyUser.role,
      targetId: doc.id,
      details: {
        decision: normalizedDecision,
        studentId: doc.studentId,
        comment: trimmedComment
      }
    });

    return {
      success: true,
      document: {
        ...updatedDoc,
        registrationNumber: updatedDoc.studentId,
        uploadDate: updatedDoc.createdAt
      },
      review: reviewEvent
    };
  }
}

const reviewInstance = new ReviewService();
module.exports = reviewInstance;
module.exports.ReviewService = ReviewService;

