const express = require('express');
const { requireRole, requireAuth } = require('../middleware/authMiddleware');
const adminService = require('../services/adminService');

const router = express.Router();

/**
 * Admin Role Guard: All endpoints under /api/admin require authenticated Admin role (TC_02, TC_40)
 */
router.use(requireRole('Admin'));

/**
 * GET /api/admin/dashboard - System analytics for Admin (Frame 6)
 */
router.get('/dashboard', (req, res) => {
  try {
    const analytics = adminService.getDashboardAnalytics();
    return res.status(200).json({
      success: true,
      ...analytics
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error fetching admin dashboard analytics'
    });
  }
});

/**
 * GET /api/admin/users - List users with search, filters, sorting, and pagination (TC_03 - TC_15)
 */
router.get('/users', (req, res) => {
  try {
    const result = adminService.getUsers(req.query);
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error loading users'
    });
  }
});

/**
 * GET /api/admin/users/:id - Get user profile and assignment details (TC_16, TC_17)
 */
router.get('/users/:id', (req, res) => {
  try {
    const user = adminService.getUserById(req.params.id);
    return res.status(200).json({
      success: true,
      user
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'User not found'
    });
  }
});

/**
 * POST /api/admin/users - Create a new user (TC_18 - TC_22)
 */
router.post('/users', (req, res) => {
  try {
    const user = adminService.createUser(req.body, req.user);
    return res.status(201).json({
      success: true,
      message: `User '${user.name}' created successfully with role ${user.role}`,
      user
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Error creating user'
    });
  }
});

/**
 * PATCH /api/admin/users/:id - Update permitted user details (TC_23 - TC_31)
 */
router.patch('/users/:id', (req, res) => {
  try {
    const user = adminService.updateUser(req.params.id, req.body, req.user);
    return res.status(200).json({
      success: true,
      message: `User '${user.name}' updated successfully`,
      user
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Error updating user'
    });
  }
});

/**
 * PUT /api/admin/students/:studentId/advisor - Assign or reassign Faculty Advisor (US07 AC 3 & 4)
 */
router.put('/students/:studentId/advisor', (req, res) => {
  try {
    const { facultyId } = req.body;
    if (!facultyId) {
      return res.status(400).json({
        success: false,
        message: 'Faculty Advisor ID is required'
      });
    }

    const student = adminService.assignAdvisor(req.params.studentId, facultyId, req.user);
    return res.status(200).json({
      success: true,
      message: `Faculty Advisor '${student.assignedFacultyAdvisorName}' assigned to student '${student.name}'`,
      student
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Error assigning advisor'
    });
  }
});

module.exports = router;
