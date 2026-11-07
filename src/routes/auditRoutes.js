const express = require('express');
const auditService = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/audit-logs
 * US10: Retrieve audit logs with filtering, searching, and pagination (Admin only)
 */
router.get('/', (req, res) => {
  try {
    // If request user is non-admin, deny access (AC 8, TC_18-20, TC_24)
    if (req.user && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Administrator privileges required to access audit logs'
      });
    }

    const result = auditService.queryLogs(req.query);
    return res.json({
      success: true,
      count: result.count,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      logs: result.logs
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error fetching audit logs'
    });
  }
});

/**
 * GET /api/audit-logs/document/:id
 * Retrieve audit trail for a specific document
 */
router.get('/document/:id', (req, res) => {
  try {
    if (req.user && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Administrator privileges required to access audit logs'
      });
    }

    const trail = auditService.getAuditTrailForDocument(req.params.id);
    return res.json({
      success: true,
      documentId: req.params.id,
      count: trail.length,
      trail
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Immutability protection: Audit records cannot be modified or deleted (AC 8)
 */
router.all('/', (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method Not Allowed: Audit records are immutable and cannot be created, modified, or deleted'
    });
  }
});

router.all('/:id', (req, res) => {
  return res.status(405).json({
    success: false,
    message: 'Method Not Allowed: Audit records are immutable and cannot be created, modified, or deleted'
  });
});

module.exports = router;
