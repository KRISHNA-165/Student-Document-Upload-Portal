const express = require('express');
const authService = require('../services/authService');
const documentService = require('../services/documentService');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * GET /api/student/dashboard
 * US06: Comprehensive dashboard statistics and recent uploads for authenticated student
 */
router.get('/dashboard', requireAuth, requireRole('Student'), (req, res) => {
  try {
    const dashboardData = authService.getStudentDashboardData(req.user.id);
    return res.status(200).json({
      success: true,
      ...dashboardData,
      metrics: {
        totalDocuments: dashboardData.counts ? dashboardData.counts.total : 0,
        pendingApproval: dashboardData.counts ? dashboardData.counts.pending : 0,
        approved: dashboardData.counts ? dashboardData.counts.approved : 0,
        rejected: dashboardData.counts ? dashboardData.counts.rejected : 0
      }
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Error loading dashboard data'
    });
  }
});

/**
 * GET /api/student/documents - Alias for student documents
 */
router.get('/documents', requireAuth, requireRole('Student'), (req, res) => {
  try {
    const result = documentService.getDocumentsForStudent(req.user.id, req.query);
    const docs = result.documents || result;
    return res.status(200).json({
      success: true,
      count: docs.length,
      total: result.total !== undefined ? result.total : docs.length,
      summary: result.summary || null,
      documents: docs
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;

