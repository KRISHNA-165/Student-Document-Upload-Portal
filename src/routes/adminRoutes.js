const express = require('express');
const { requireRole } = require('../middleware/authMiddleware');
const db = require('../database/db');

const router = express.Router();

/**
 * Admin-only endpoints (TC_26)
 */
router.use(requireRole('Admin'));

router.get('/users', (req, res) => {
  return res.json({
    success: true,
    users: db.getAllUsers()
  });
});

router.post('/manage', (req, res) => {
  return res.json({
    success: true,
    message: 'Admin action completed'
  });
});

module.exports = router;

