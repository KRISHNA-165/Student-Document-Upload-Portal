const express = require('express');
const db = require('../database/db');
const { getSessionUser, setSessionUser } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/me', (req, res) => {
  return res.json({
    success: true,
    user: req.user || getSessionUser()
  });
});

router.get('/users', (req, res) => {
  return res.json({
    success: true,
    users: db.getAllUsers()
  });
});

router.post('/switch-user', (req, res) => {
  const { userId } = req.body;
  const user = setSessionUser(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: `User '${userId}' not found`
    });
  }
  return res.json({
    success: true,
    message: `Switched session to ${user.name} (${user.role})`,
    user
  });
});

module.exports = router;

