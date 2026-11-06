const crypto = require('crypto');
const db = require('../database/db');

class NotificationService {
  /**
   * Notify assigned faculty advisor about a document event
   */
  notifyFacultyAdvisor({ facultyId, studentId, studentName, documentId, documentTitle, category, action = 'SUBMITTED' }) {
    if (!facultyId) return null;

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
      documentId,
      documentTitle,
      category,
      title,
      message,
      read: false,
      createdAt: new Date().toISOString()
    };

    return db.insertNotification(notification);
  }

  getNotifications(userId) {
    return db.getNotifications(userId);
  }

  markAsRead(notificationId, userId) {
    return db.markNotificationRead(notificationId, userId);
  }
}

const notificationInstance = new NotificationService();
module.exports = notificationInstance;
module.exports.NotificationService = NotificationService;

