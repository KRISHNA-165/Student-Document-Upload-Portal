const express = require('express');
const reportService = require('../services/reportService');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Enforce authentication on all report endpoints
router.use(requireAuth);

/**
 * GET /api/reports
 * Retrieve analytics and reporting metrics for Admin and authorized Faculty
 */
router.get('/', (req, res) => {
  try {
    const { from, to, startDate, endDate, category, status, department, groupBy } = req.query;
    const report = reportService.generateReport(req.user, {
      from: from || startDate,
      to: to || endDate,
      category,
      status,
      department,
      groupBy
    });

    return res.status(200).json(report);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/reports/export
 * Export filtered report as CSV or Excel
 */
router.get('/export', (req, res) => {
  try {
    const { format = 'csv', from, to, startDate, endDate, category, status, department } = req.query;
    const exported = reportService.exportReport(req.user, {
      format,
      from: from || startDate,
      to: to || endDate,
      category,
      status,
      department
    });

    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.status(200).send(exported.content);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;
