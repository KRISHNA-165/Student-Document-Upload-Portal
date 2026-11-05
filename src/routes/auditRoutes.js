const express = require('express');
const auditService = require('../services/auditService');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const logs = auditService.getLogs();
    return res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;

