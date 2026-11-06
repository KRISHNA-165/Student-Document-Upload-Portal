const express = require('express');
const notificationService = require('../services/notificationService');

const router = express.Router();

/**
 * GET /api/notifications - List notifications for current user with filtering, search, sorting
 */
router.get('/', (req, res) => {
  try {
    const { type, search } = req.query;
    const result = notificationService.getUserNotifications(req.user.id, { type, search });
    return res.json({
      success: true,
      count: result.notifications.length,
      unreadCount: result.unreadCount,
      total: result.total,
      notifications: result.notifications
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * POST /api/notifications/read-all - Mark all notifications as read (TC_11)
 * Also supports PATCH /api/notifications/read-all
 */
const markAllReadHandler = (req, res) => {
  try {
    const updatedCount = notificationService.markAllAsRead(req.user.id);
    return res.json({
      success: true,
      message: 'All notifications marked as read',
      markedCount: updatedCount,
      unreadCount: 0
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

router.post('/read-all', markAllReadHandler);
router.patch('/read-all', markAllReadHandler);

/**
 * GET /api/notifications/:id - Get a single notification with authorization check (TC_19, TC_20, TC_36)
 */
router.get('/:id', (req, res) => {
  try {
    const notif = notificationService.getNotifications(req.user.id).find(n => n.id === req.params.id);
    if (!notif) {
      // Check if it belongs to someone else to throw 403
      const allDbNotif = require('../database/db').getNotificationById(req.params.id);
      if (allDbNotif && allDbNotif.recipientId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You cannot access notifications belonging to another user'
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    return res.json({
      success: true,
      notification: notif
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * PATCH /api/notifications/:id/read - Mark single notification as read (TC_10)
 */
router.patch('/:id/read', (req, res) => {
  try {
    const updated = notificationService.markAsRead(req.params.id, req.user.id);
    if (!updated) {
      // Check if it belongs to another user
      const anyNotif = require('../database/db').getNotificationById(req.params.id);
      if (anyNotif && anyNotif.recipientId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You cannot modify notifications belonging to another user'
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    return res.json({
      success: true,
      message: 'Notification marked as read',
      notification: updated
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/notifications/:id/open - Open notification linked to document (TC_12, TC_18)
 */
router.get('/:id/open', (req, res) => {
  try {
    const result = notificationService.openStudentNotification(req.params.id, req.user);
    if (!result.documentFound) {
      return res.status(404).json({
        success: false,
        notification: result.notification,
        message: 'The document associated with this notification is no longer available.',
        document: null
      });
    }
    return res.json({
      success: true,
      notification: result.notification,
      document: result.document,
      documentUrl: `/api/documents/${result.document.id}`
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;

