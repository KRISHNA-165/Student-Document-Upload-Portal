const express = require('express');
const reviewService = require('../services/reviewService');
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

module.exports = router;

