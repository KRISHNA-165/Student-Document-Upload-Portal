const express = require('express');
const notificationService = require('../services/notificationService');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const notifications = notificationService.getNotifications(req.user.id);
    return res.json({
      success: true,
      count: notifications.length,
      notifications
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

router.patch('/:id/read', (req, res) => {
  try {
    const updated = notificationService.markAsRead(req.params.id, req.user.id);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    return res.json({
      success: true,
      notification: updated
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;

