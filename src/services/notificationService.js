const crypto = require('crypto');
const db = require('../database/db');

class NotificationService {
  /**
   * Notify assigned faculty advisor about a document event (US04)
   */
  notifyFacultyAdvisor({ facultyId, studentId, studentName, documentId, documentTitle, category, action = 'SUBMITTED' }) {
    if (!facultyId) return null;

    const isResubmission = action === 'RESUBMITTED';
    const eventType = isResubmission ? 'RESUBMISSION' : (action === 'REPLACED' ? 'REPLACEMENT' : 'SUBMISSION');
    const now = new Date().toISOString();

    let title = 'New Document Submitted for Verification';
    let message = `Student ${studentName || studentId} has uploaded a new document "${documentTitle}" under category "${category}" for review.`;

    if (action === 'REPLACED') {
      title = 'Document Updated / Replaced by Student';
      message = `Student ${studentName || studentId} has updated the document "${documentTitle}" under category "${category}".`;
    } else if (action === 'RESUBMITTED') {
      title = 'Document Resubmitted for Verification';
      message = `Student ${studentName || studentId} has resubmitted the rejected document "${documentTitle}" under category "${category}" for review.`;
    }

    const notification = {
      id: `NOTIF-${crypto.randomUUID()}`,
      recipientId: facultyId,
      senderId: studentId,
      studentName: studentName || 'Student',
      documentId,
      documentTitle,
      category,
      submissionDate: now,
      eventType,
      isResubmission,
      title,
      message,
      read: false,
      createdAt: now
    };

    return db.insertNotification(notification);
  }

  getNotifications(userId) {
    return db.getNotifications(userId);
  }

  getFacultyNotifications(facultyId) {
    const list = db.getNotifications(facultyId);
    const unreadCount = list.filter(n => !n.read).length;
    return {
      notifications: list,
      unreadCount,
      total: list.length
    };
  }

  markAsRead(notificationId, userId) {
    return db.markNotificationRead(notificationId, userId);
  }

  openNotification(notificationId, facultyUser) {
    const notif = db.getNotificationById(notificationId);
    if (!notif) {
      const err = new Error('Notification not found');
      err.statusCode = 404;
      throw err;
    }

    if (notif.recipientId !== facultyUser.id) {
      const err = new Error('Access denied: You cannot view notifications belonging to other faculty');
      err.statusCode = 403;
      throw err;
    }

    // Mark as Read
    db.markNotificationRead(notificationId, facultyUser.id);

    // Resolve linked document
    const doc = db.getDocumentById(notif.documentId);
    if (!doc) {
      const err = new Error('The document linked to this notification is unavailable');
      err.statusCode = 404;
      throw err;
    }

    if (doc.assignedFacultyAdvisorId !== facultyUser.id) {
      const err = new Error('Access denied: You are not the assigned advisor for this student document');
      err.statusCode = 403;
      throw err;
    }

    return {
      notification: notif,
      document: doc
    };
  }
}

const notificationInstance = new NotificationService();
module.exports = notificationInstance;
module.exports.NotificationService = NotificationService;

