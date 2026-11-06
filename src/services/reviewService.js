const crypto = require('crypto');
const db = require('../database/db');
const CONSTANTS = require('../config/constants');
const storageService = require('./storageService');
const auditService = require('./auditService');

class ReviewService {
  /**
   * Get documents submitted by students assigned to the given faculty advisor
   */
  getAssignedDocuments(facultyUser, { status = 'Pending Approval', category, search, startDate, endDate } = {}) {
    if (!facultyUser || facultyUser.role !== 'Faculty') {
      const err = new Error('Unauthorized: Only faculty members can view review queues');
      err.statusCode = 403;
      throw err;
    }

    // Filter documents by assigned faculty advisor
    let docs = db.getDocuments({ assignedFacultyAdvisorId: facultyUser.id });

    // Filter by status if specified (e.g. Pending Approval)
    if (status && status !== 'ALL') {
      docs = docs.filter(d => d.status === status);
    }

    // Filter by Category if provided (TC_32)
    if (category && category !== 'ALL') {
      docs = docs.filter(d => d.category.toLowerCase() === category.toLowerCase());
    }

    // Filter/Search by student name (TC_31)
    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      docs = docs.filter(d =>
        (d.studentName && d.studentName.toLowerCase().includes(q)) ||
        (d.studentId && d.studentId.toLowerCase().includes(q)) ||
        (d.title && d.title.toLowerCase().includes(q))
      );
    }

    // Filter by date range (TC_33)
    if (startDate) {
      const start = new Date(startDate);
      docs = docs.filter(d => new Date(d.createdAt) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      docs = docs.filter(d => new Date(d.createdAt) <= end);
    }

    // Map fields ensuring registrationNumber is explicitly present (TC_03, TC_04, etc.)
    return docs.map(doc => ({
      ...doc,
      registrationNumber: doc.studentId,
      uploadDate: doc.createdAt
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

