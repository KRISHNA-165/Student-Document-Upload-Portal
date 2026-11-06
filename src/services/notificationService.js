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

  getUserNotifications(userId, options = {}) {
    let list = db.getNotifications(userId);

    // Filter by type (Approved, Rejected) - TC_15, TC_16, TC_17
    if (options.type && options.type !== 'all' && options.type !== 'All') {
      const typeLower = options.type.toLowerCase();
      list = list.filter(n => {
        const titleMatch = n.title && n.title.toLowerCase().includes(typeLower);
        const msgMatch = n.message && n.message.toLowerCase().includes(typeLower);
        const actionMatch = n.action && n.action.toLowerCase() === typeLower;
        return titleMatch || msgMatch || actionMatch;
      });
    }

    // Search by title or text - TC_32, TC_33
    if (options.search && typeof options.search === 'string' && options.search.trim().length > 0) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(n => {
        const titleMatch = n.title && n.title.toLowerCase().includes(q);
        const docTitleMatch = n.documentTitle && n.documentTitle.toLowerCase().includes(q);
        const msgMatch = n.message && n.message.toLowerCase().includes(q);
        return titleMatch || docTitleMatch || msgMatch;
      });
    }

    // Sort newest first by default - TC_31
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const allUserNotifs = db.getNotifications(userId);
    const unreadCount = allUserNotifs.filter(n => !n.read).length;

    return {
      notifications: list,
      total: list.length,
      unreadCount
    };
  }

  markAllAsRead(userId) {
    return db.markAllNotificationsRead(userId);
  }

  openStudentNotification(notificationId, studentUser) {
    const notif = db.getNotificationById(notificationId);
    if (!notif) {
      const err = new Error('Notification not found');
      err.statusCode = 404;
      throw err;
    }

    if (notif.recipientId !== studentUser.id) {
      const err = new Error('Access denied: You cannot access notifications belonging to another user');
      err.statusCode = 403;
      throw err;
    }

    // Mark as read
    db.markNotificationRead(notificationId, studentUser.id);

    // Resolve document
    const doc = db.getDocumentById(notif.documentId);
    return {
      notification: notif,
      document: doc,
      documentFound: Boolean(doc)
    };
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

