const express = require('express');
const reviewService = require('../services/reviewService');
const notificationService = require('../services/notificationService');
const { requireRole } = require('../middleware/authMiddleware');
const db = require('../database/db');

const router = express.Router();

/**
 * GET /api/faculty/documents
 * List documents submitted by students assigned to the current faculty advisor
 * Supports query params: status, category, search, startDate, endDate
 */
router.get('/documents', requireRole('Faculty'), (req, res) => {
  try {
    const { status, category, search, startDate, endDate } = req.query;
    const documents = reviewService.getAssignedDocuments(req.user, {
      status,
      category,
      search,
      startDate,
      endDate
    });

    return res.json({
      success: true,
      count: documents.length,
      documents
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/faculty/pending
 * List pending review queue for assigned students
 */
router.get('/pending', requireRole('Faculty'), (req, res) => {
  try {
    const documents = reviewService.getAssignedDocuments(req.user, {
      status: 'Pending Approval'
    });

    return res.json({
      success: true,
      count: documents.length,
      pendingDocuments: documents,
      documents
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/faculty/documents/:id
 * Retrieve a specific document for review
 */
router.get('/documents/:id', requireRole('Faculty'), (req, res) => {
  try {
    const data = reviewService.getDocumentForReview(req.params.id, req.user);
    return res.json({
      success: true,
      ...data
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * POST /api/faculty/documents/:id/review
 * Submit review decision (Approve or Reject)
 */
router.post('/documents/:id/review', requireRole('Faculty'), async (req, res) => {
  try {
    const { decision, comment } = req.body;
    const result = await reviewService.submitDecision({
      documentId: req.params.id,
      facultyUser: req.user,
      decision,
      comment
    });

    return res.json({
      success: true,
      message: `Document successfully ${result.document.status.toLowerCase()}`,
      document: result.document,
      review: result.review
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/faculty/notifications
 * View recent notifications for the logged-in Faculty Advisor (US04)
 */
router.get('/notifications', requireRole('Faculty'), (req, res) => {
  try {
    const result = notificationService.getFacultyNotifications(req.user.id);
    return res.json({
      success: true,
      count: result.notifications.length,
      unreadCount: result.unreadCount,
      notifications: result.notifications
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * PATCH /api/faculty/notifications/:id/read
 * Mark notification as Read (US04)
 */
router.patch('/notifications/:id/read', requireRole('Faculty'), (req, res) => {
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
      message: 'Notification marked as read',
      notification: updated
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/faculty/notifications/:id/open
 * Open notification: marks as Read and returns linked review document details (US04)
 */
router.get('/notifications/:id/open', requireRole('Faculty'), (req, res) => {
  try {
    const result = notificationService.openNotification(req.params.id, req.user);
    return res.json({
      success: true,
      notification: result.notification,
      document: result.document,
      reviewUrl: `/api/faculty/documents/${result.document.id}`
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

