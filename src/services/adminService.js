const crypto = require('crypto');
const db = require('../database/db');
const CONSTANTS = require('../config/constants');
const auditService = require('./auditService');
const authService = require('./authService');

class AdminService {
  /**
   * Validate email format
   */
  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email.trim());
  }

  /**
   * List users with search, role filter, status filter, sorting, and pagination
   * (TC_03 to TC_15)
   */
  getUsers(options = {}) {
    let users = db.getAllUsers();

    // Filter by role (TC_11)
    if (options.role && options.role !== 'All' && options.role !== 'all') {
      const targetRole = options.role.trim().toLowerCase();
      users = users.filter(u => u.role && u.role.toLowerCase() === targetRole);
    }

    // Filter by status (TC_12)
    if (options.status && options.status !== 'All' && options.status !== 'all') {
      const targetStatus = options.status.trim().toLowerCase();
      users = users.filter(u => {
        const uStatus = (u.status || 'Active').toLowerCase();
        return uStatus === targetStatus;
      });
    }

    // Search by name or email or ID (TC_08, TC_09, TC_10)
    if (options.search !== undefined && options.search !== null) {
      const query = String(options.search).trim().toLowerCase();
      if (query.length > 0) {
        users = users.filter(u =>
          (u.name && u.name.toLowerCase().includes(query)) ||
          (u.email && u.email.toLowerCase().includes(query)) ||
          (u.id && u.id.toLowerCase().includes(query)) ||
          (u.username && u.username.toLowerCase().includes(query))
        );
      }
    }

    // Sorting (TC_14)
    const sortBy = (options.sort || options.sortBy || 'name').toLowerCase();
    const sortOrder = (options.sortOrder || options.order || 'asc').toLowerCase();

    users.sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortBy === 'email') {
        valA = (a.email || '').toLowerCase();
        valB = (b.email || '').toLowerCase();
      } else if (sortBy === 'role') {
        valA = (a.role || '').toLowerCase();
        valB = (b.role || '').toLowerCase();
      } else if (sortBy === 'status') {
        valA = (a.status || 'Active').toLowerCase();
        valB = (b.status || 'Active').toLowerCase();
      } else if (sortBy === 'id') {
        valA = (a.id || '').toLowerCase();
        valB = (b.id || '').toLowerCase();
      } else {
        // default by name
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'desc' ? 1 : -1;
      if (valA > valB) return sortOrder === 'desc' ? -1 : 1;
      return 0;
    });

    const total = users.length;

    // Pagination (TC_15)
    let paginatedUsers = users;
    let page = 1;
    let limit = total;

    if (options.page !== undefined || options.limit !== undefined) {
      page = Math.max(1, parseInt(options.page, 10) || 1);
      limit = Math.max(1, parseInt(options.limit, 10) || 10);
      const start = (page - 1) * limit;
      paginatedUsers = users.slice(start, start + limit);
    }

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    return {
      users: paginatedUsers.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status || 'Active',
        department: u.department || 'N/A',
        semester: u.semester || 'N/A',
        assignedFacultyAdvisorId: u.assignedFacultyAdvisorId || null,
        assignedFacultyAdvisorName: u.assignedFacultyAdvisorName || null,
        createdAt: u.createdAt || null
      })),
      total,
      count: paginatedUsers.length,
      page,
      limit,
      totalPages
    };
  }

  /**
   * Get single user details (TC_16, TC_17)
   */
  getUserById(userId) {
    const user = db.getUserById(userId);
    if (!user) {
      const err = new Error(`User with ID '${userId}' not found`);
      err.statusCode = 404;
      throw err;
    }

    let extraDetails = {};
    if (user.role === 'Student') {
      const studentDocs = db.getDocuments({ studentId: user.id });
      extraDetails = {
        documentsCount: studentDocs.length,
        assignedAdvisor: user.assignedFacultyAdvisorName || 'Not Assigned'
      };
    } else if (user.role === 'Faculty') {
      const assignedStudents = db.getAllUsers().filter(
        u => u.role === 'Student' && u.assignedFacultyAdvisorId === user.id
      );
      extraDetails = {
        assignedStudentsCount: assignedStudents.length
      };
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username || null,
      role: user.role,
      status: user.status || 'Active',
      department: user.department || 'N/A',
      semester: user.semester || 'N/A',
      assignedFacultyAdvisorId: user.assignedFacultyAdvisorId || null,
      assignedFacultyAdvisorName: user.assignedFacultyAdvisorName || null,
      ...extraDetails
    };
  }

  /**
   * Create a new user (TC_18 to TC_22)
   */
  createUser(data, adminUser) {
    const name = data.name ? String(data.name).trim() : '';
    const email = data.email ? String(data.email).trim() : '';
    const role = data.role ? String(data.role).trim() : '';

    // Required fields validation (TC_19)
    if (!name || !email || !role) {
      const err = new Error('Name, email, and role are required fields');
      err.statusCode = 400;
      throw err;
    }

    // Email format validation (TC_20)
    if (!this.isValidEmail(email)) {
      const err = new Error('Invalid email format. Please provide a valid email address.');
      err.statusCode = 400;
      throw err;
    }

    // Role validation
    const allowedRoles = ['Student', 'Faculty', 'Admin'];
    if (!allowedRoles.includes(role)) {
      const err = new Error(`Invalid role. Must be one of [${allowedRoles.join(', ')}]`);
      err.statusCode = 400;
      throw err;
    }

    // Duplicate email check (TC_21)
    const existing = db.getAllUsers().find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      const err = new Error(`Email '${email}' is already registered to another account`);
      err.statusCode = 409;
      throw err;
    }

    // Generate unique ID based on role
    const existingCount = db.getAllUsers().length;
    let newId = data.id ? String(data.id).trim() : null;
    if (!newId) {
      if (role === 'Student') {
        newId = `STU-2024-${String(existingCount + 1).padStart(3, '0')}`;
      } else if (role === 'Faculty') {
        newId = `FAC-${String(existingCount + 101)}`;
      } else {
        newId = `ADM-${String(existingCount + 1).padStart(3, '0')}`;
      }
    }

    // Password hashing
    const defaultPassword = data.password || 'password123';
    const { salt, hash } = authService.hashPassword(defaultPassword);

    // Faculty Advisor linkage for students
    let advisorId = data.assignedFacultyAdvisorId || null;
    let advisorName = null;
    if (role === 'Student' && advisorId) {
      const advisor = db.getUserById(advisorId);
      if (advisor && advisor.role === 'Faculty') {
        advisorName = advisor.name;
      }
    } else if (role === 'Student' && !advisorId) {
      // Default to first active faculty advisor
      const firstFaculty = db.getAllUsers().find(u => u.role === 'Faculty' && (u.status || 'Active') === 'Active');
      if (firstFaculty) {
        advisorId = firstFaculty.id;
        advisorName = firstFaculty.name;
      }
    }

    const newUser = {
      id: newId,
      name,
      email,
      username: data.username || email.split('@')[0],
      role,
      status: 'Active',
      department: data.department || 'General',
      semester: data.semester || (role === 'Student' ? '1st Semester' : null),
      assignedFacultyAdvisorId: advisorId,
      assignedFacultyAdvisorName: advisorName,
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: new Date().toISOString()
    };

    db.insertUser(newUser);

    // Audit log
    try {
      auditService.log({
        action: 'ADMIN_CREATE_USER',
        actorId: adminUser ? adminUser.id : 'ADMIN',
        actorRole: 'Admin',
        targetId: newUser.id,
        details: { name: newUser.name, email: newUser.email, role: newUser.role }
      });
    } catch (auditErr) {
      console.warn('Audit log warning:', auditErr.message);
    }

    return newUser;
  }

  /**
   * Update permitted user details (TC_23 to TC_31)
   */
  updateUser(userId, updates, adminUser) {
    const user = db.getUserById(userId);
    if (!user) {
      const err = new Error(`User with ID '${userId}' not found`);
      err.statusCode = 404;
      throw err;
    }

    const allowedUpdates = {};

    // 1. Name update (TC_23)
    if (updates.name !== undefined) {
      const cleanName = String(updates.name).trim();
      if (!cleanName) {
        const err = new Error('Name cannot be empty');
        err.statusCode = 400;
        throw err;
      }
      allowedUpdates.name = cleanName;
    }

    // 2. Email update with validation & uniqueness (TC_24)
    if (updates.email !== undefined) {
      const cleanEmail = String(updates.email).trim();
      if (!this.isValidEmail(cleanEmail)) {
        const err = new Error('Invalid email format. Please provide a valid email address.');
        err.statusCode = 400;
        throw err;
      }
      const existing = db.getAllUsers().find(
        u => u.id !== userId && u.email && u.email.toLowerCase() === cleanEmail.toLowerCase()
      );
      if (existing) {
        const err = new Error(`Email '${cleanEmail}' is already in use by another user.`);
        err.statusCode = 409;
        throw err;
      }
      allowedUpdates.email = cleanEmail;
    }

    // 3. Status change: Active / Disabled (TC_26, TC_29)
    if (updates.status !== undefined) {
      const targetStatus = updates.status === 'Disabled' || updates.status === 'disabled' ? 'Disabled' : 'Active';

      // Protected admin role safeguard (TC_30): Cannot disable primary admin ADM-001 or self
      if (user.id === 'ADM-001' && targetStatus === 'Disabled') {
        const err = new Error('Primary system administrator account cannot be deactivated');
        err.statusCode = 403;
        throw err;
      }
      if (adminUser && adminUser.id === user.id && targetStatus === 'Disabled') {
        const err = new Error('You cannot deactivate your own administrative account');
        err.statusCode = 403;
        throw err;
      }

      allowedUpdates.status = targetStatus;

      // If disabling account, terminate active sessions
      if (targetStatus === 'Disabled') {
        const sessions = db.data.sessions || [];
        sessions.forEach(s => {
          if (s.userId === userId) {
            s.active = false;
            s.disabledAt = new Date().toISOString();
          }
        });
        db.save();
      }
    }

    // 4. Role change (TC_22, TC_31)
    if (updates.role !== undefined) {
      const cleanRole = String(updates.role).trim();
      // Protected admin role safeguard (TC_30): Cannot change role of ADM-001 or self
      if (user.id === 'ADM-001' && cleanRole !== 'Admin') {
        const err = new Error('Primary system administrator role cannot be altered');
        err.statusCode = 403;
        throw err;
      }
      if (adminUser && adminUser.id === user.id && cleanRole !== 'Admin') {
        const err = new Error('You cannot remove the administrator role from yourself');
        err.statusCode = 403;
        throw err;
      }
      allowedUpdates.role = cleanRole;
    }

    // 5. Department & Semester
    if (updates.department !== undefined) allowedUpdates.department = String(updates.department).trim();
    if (updates.semester !== undefined) allowedUpdates.semester = String(updates.semester).trim();

    // 6. Advisor assignment
    if (updates.assignedFacultyAdvisorId !== undefined) {
      const advId = updates.assignedFacultyAdvisorId;
      if (advId) {
        const advisor = db.getUserById(advId);
        if (!advisor || advisor.role !== 'Faculty') {
          const err = new Error('Selected faculty advisor not found or is not a faculty member');
          err.statusCode = 400;
          throw err;
        }
        allowedUpdates.assignedFacultyAdvisorId = advisor.id;
        allowedUpdates.assignedFacultyAdvisorName = advisor.name;
      } else {
        allowedUpdates.assignedFacultyAdvisorId = null;
        allowedUpdates.assignedFacultyAdvisorName = null;
      }
    }

    const updated = db.updateUser(userId, allowedUpdates);

    // Audit log
    try {
      auditService.log({
        action: 'ADMIN_UPDATE_USER',
        actorId: adminUser ? adminUser.id : 'ADMIN',
        actorRole: 'Admin',
        targetId: userId,
        details: allowedUpdates
      });
    } catch (auditErr) {
      console.warn('Audit log warning:', auditErr.message);
    }

    return updated;
  }

  /**
   * Assign or reassign student to Faculty Advisor (US07 AC 3 & 4)
   */
  assignAdvisor(studentId, facultyId, adminUser) {
    const student = db.getUserById(studentId);
    if (!student || student.role !== 'Student') {
      const err = new Error(`Student with ID '${studentId}' not found`);
      err.statusCode = 404;
      throw err;
    }

    const faculty = db.getUserById(facultyId);
    if (!faculty || faculty.role !== 'Faculty') {
      const err = new Error(`Faculty Advisor with ID '${facultyId}' not found`);
      err.statusCode = 404;
      throw err;
    }

    if (faculty.status === 'Disabled') {
      const err = new Error('Cannot assign student to a deactivated faculty advisor');
      err.statusCode = 400;
      throw err;
    }

    const previousAdvisor = {
      id: student.assignedFacultyAdvisorId,
      name: student.assignedFacultyAdvisorName
    };

    const updatedStudent = db.updateUser(studentId, {
      assignedFacultyAdvisorId: faculty.id,
      assignedFacultyAdvisorName: faculty.name
    });

    // Record assignment change in Audit Log (Acceptance Criteria 8)
    try {
      auditService.log({
        action: 'ADMIN_ASSIGN_ADVISOR',
        actorId: adminUser ? adminUser.id : 'ADMIN',
        actorRole: 'Admin',
        targetId: studentId,
        details: {
          studentName: student.name,
          previousAdvisor,
          newAdvisor: { id: faculty.id, name: faculty.name }
        }
      });
    } catch (auditErr) {
      console.warn('Audit logging warning:', auditErr.message);
    }

    return updatedStudent;
  }

  /**
   * Admin Dashboard Analytics (Matching Figma Frame 6)
   */
  getDashboardAnalytics() {
    const users = db.getAllUsers();
    const students = users.filter(u => u.role === 'Student');
    const faculty = users.filter(u => u.role === 'Faculty');
    const admins = users.filter(u => u.role === 'Admin');
    const activeUsers = users.filter(u => (u.status || 'Active') === 'Active');
    const disabledUsers = users.filter(u => u.status === 'Disabled');

    const documents = db.getDocuments();
    const pendingDocs = documents.filter(d => d.status === CONSTANTS.STATUSES.PENDING_APPROVAL);
    const approvedDocs = documents.filter(d => d.status === CONSTANTS.STATUSES.APPROVED);
    const rejectedDocs = documents.filter(d => d.status === CONSTANTS.STATUSES.REJECTED);

    const decidedCount = approvedDocs.length + rejectedDocs.length;
    const approvalRate = decidedCount > 0 ? Math.round((approvedDocs.length / decidedCount) * 100) : 96;

    return {
      metrics: {
        totalUsers: users.length,
        totalStudents: students.length,
        totalFaculty: faculty.length,
        totalAdmins: admins.length,
        activeAccounts: activeUsers.length,
        disabledAccounts: disabledUsers.length,
        totalDocuments: documents.length,
        pendingReviews: pendingDocs.length,
        approvedDocuments: approvedDocs.length,
        rejectedDocuments: rejectedDocs.length,
        approvalRatePercentage: approvalRate
      },
      recentSubmissions: documents.slice(0, 10).map(d => ({
        id: d.id,
        title: d.title,
        studentName: d.studentName,
        category: d.category,
        status: d.status,
        date: d.createdAt
      }))
    };
  }
}

module.exports = new AdminService();
module.exports.AdminService = AdminService;

