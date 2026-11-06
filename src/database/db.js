const fs = require('fs');
const path = require('path');
const CONSTANTS = require('../config/constants');

class Database {
  constructor(filePath = CONSTANTS.DB_FILE) {
    this.filePath = filePath;
    this.data = {
      users: [],
      documents: [],
      notifications: [],
      auditLogs: [],
      reviewHistory: [],
      sessions: []
    };
    this.init();
  }

  init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
        if (!this.data.reviewHistory) {
          this.data.reviewHistory = [];
        }
        if (!this.data.sessions) {
          this.data.sessions = [];
        }
        if (!this.data.users || this.data.users.length < 5) {
          this.seedUsers();
        }
      } catch (err) {
        console.error('Failed reading database file, resetting to defaults', err);
        this.seedUsers();
        this.save();
      }
    } else {
      this.seedUsers();
      this.save();
    }
  }

  seedUsers() {
    const defaultSalt = 'a1b2c3d4e5f67890';
    const defaultHash = '601b13857f0d806535f688dbfb8c92ca61b25eb8b6091c6b3fc3d578d11574140d7cef5e38b6f9fa00d196b50728d7097a38d5b317712e5a9dbf6e8dee744817';

    this.data.users = [
      {
        ...CONSTANTS.DEFAULT_STUDENT,
        username: 'johndoe',
        passwordSalt: defaultSalt,
        passwordHash: defaultHash,
        status: 'Active',
        role: 'Student'
      },
      {
        id: 'STU-2024-002',
        name: 'Jane Smith',
        username: 'janesmith',
        email: 'jane.smith@university.edu',
        department: 'Information Technology',
        semester: '6th Semester',
        assignedFacultyAdvisorId: 'FAC-101',
        assignedFacultyAdvisorName: 'Dr. Robert Smith',
        passwordSalt: defaultSalt,
        passwordHash: defaultHash,
        status: 'Active',
        role: 'Student'
      },
      {
        id: 'STU-2024-003',
        name: 'Alex Rivera',
        username: 'alexrivera',
        email: 'alex.rivers@university.edu',
        department: 'Electronics & Communication',
        semester: '4th Semester',
        assignedFacultyAdvisorId: 'FAC-102',
        assignedFacultyAdvisorName: 'Dr. Emily Davis',
        passwordSalt: defaultSalt,
        passwordHash: defaultHash,
        status: 'Active',
        role: 'Student'
      },
      {
        id: 'STU-2024-004',
        name: 'Arun Kumar',
        username: 'arunkumar',
        email: 'arun.kumar@university.edu',
        department: 'Computer Science & Engineering',
        semester: '5th Semester',
        assignedFacultyAdvisorId: 'FAC-101',
        assignedFacultyAdvisorName: 'Dr. Robert Smith',
        passwordSalt: defaultSalt,
        passwordHash: defaultHash,
        status: 'Active',
        role: 'Student'
      },
      {
        id: 'STU-2024-005',
        name: 'Priya Sharma',
        username: 'priyasharma',
        email: 'priya.sharma@university.edu',
        department: 'Information Technology',
        semester: '2nd Semester',
        assignedFacultyAdvisorId: 'FAC-101',
        assignedFacultyAdvisorName: 'Dr. Robert Smith',
        passwordSalt: defaultSalt,
        passwordHash: defaultHash,
        status: 'Active',
        role: 'Student'
      },
      {
        ...CONSTANTS.DEFAULT_FACULTY,
        username: 'robertsmith',
        passwordSalt: defaultSalt,
        passwordHash: defaultHash,
        status: 'Active',
        role: 'Faculty'
      },
      {
        id: 'FAC-102',
        name: 'Dr. Emily Davis',
        username: 'emilydavis',
        email: 'emily.davis@university.edu',
        department: 'Electronics & Communication',
        passwordSalt: defaultSalt,
        passwordHash: defaultHash,
        status: 'Active',
        role: 'Faculty'
      },
      {
        id: 'ADM-001',
        name: 'System Administrator',
        username: 'admin',
        email: 'admin@university.edu',
        department: 'Central Administration',
        passwordSalt: defaultSalt,
        passwordHash: defaultHash,
        status: 'Active',
        role: 'Admin'
      }
    ];
  }

  save() {
    try {
      const tempPath = `${this.filePath}.${Date.now()}-${Math.random().toString(36).substring(2)}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('Error saving database:', err);
      throw err;
    }
  }

  // Users
  getUserById(id) {
    return this.data.users.find(u => u.id === id) || null;
  }

  getUserByIdentifier(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();
    return this.data.users.find(u =>
      (u.id && u.id.toLowerCase() === clean) ||
      (u.email && u.email.toLowerCase() === clean) ||
      (u.username && u.username.toLowerCase() === clean)
    ) || null;
  }

  getAllUsers() {
    return [...this.data.users];
  }

  insertUser(user) {
    if (!this.data.users) this.data.users = [];
    this.data.users.unshift(user);
    this.save();
    return user;
  }

  updateUser(id, updates) {
    if (!this.data.users) return null;
    const index = this.data.users.findIndex(u => u.id === id);
    if (index === -1) return null;
    this.data.users[index] = {
      ...this.data.users[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.data.users[index];
  }

  deleteUser(id) {
    if (!this.data.users) return false;
    const index = this.data.users.findIndex(u => u.id === id);
    if (index === -1) return false;
    this.data.users.splice(index, 1);
    this.save();
    return true;
  }

  // Sessions
  insertSession(session) {
    if (!this.data.sessions) this.data.sessions = [];
    this.data.sessions.unshift(session);
    this.save();
    return session;
  }

  getSession(token) {
    if (!this.data.sessions) return null;
    return this.data.sessions.find(s => s.id === token || s.token === token) || null;
  }

  updateSession(token, updates) {
    if (!this.data.sessions) return null;
    const index = this.data.sessions.findIndex(s => s.id === token || s.token === token);
    if (index === -1) return null;
    this.data.sessions[index] = {
      ...this.data.sessions[index],
      ...updates
    };
    this.save();
    return this.data.sessions[index];
  }

  deleteSession(token) {
    if (!this.data.sessions) return false;
    const index = this.data.sessions.findIndex(s => s.id === token || s.token === token);
    if (index === -1) return false;
    this.data.sessions.splice(index, 1);
    this.save();
    return true;
  }

  clearSessions() {
    this.data.sessions = [];
    this.save();
  }

  // Documents
  getDocuments(filter = {}) {
    return this.data.documents.filter(doc => {
      for (const key of Object.keys(filter)) {
        if (doc[key] !== filter[key]) return false;
      }
      return true;
    });
  }

  getDocumentById(id) {
    return this.data.documents.find(d => d.id === id) || null;
  }

  insertDocument(doc) {
    this.data.documents.unshift(doc);
    this.save();
    return doc;
  }

  updateDocument(id, updates) {
    const index = this.data.documents.findIndex(d => d.id === id);
    if (index === -1) return null;
    this.data.documents[index] = {
      ...this.data.documents[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.data.documents[index];
  }

  deleteDocument(id) {
    const index = this.data.documents.findIndex(d => d.id === id);
    if (index === -1) return false;
    this.data.documents.splice(index, 1);
    this.save();
    return true;
  }

  // Notifications
  insertNotification(notification) {
    this.data.notifications.unshift(notification);
    this.save();
    return notification;
  }

  getNotifications(recipientId) {
    return this.data.notifications.filter(n => n.recipientId === recipientId);
  }

  getNotificationById(id) {
    return this.data.notifications.find(n => n.id === id) || null;
  }

  markNotificationRead(notificationId, recipientId) {
    const item = this.data.notifications.find(
      n => n.id === notificationId && (recipientId ? n.recipientId === recipientId : true)
    );
    if (item) {
      item.read = true;
      item.readAt = new Date().toISOString();
      this.save();
      return item;
    }
    return null;
  }

  markAllNotificationsRead(recipientId) {
    const now = new Date().toISOString();
    let count = 0;
    this.data.notifications.forEach(n => {
      if (n.recipientId === recipientId && !n.read) {
        n.read = true;
        n.readAt = now;
        count++;
      }
    });
    if (count > 0) this.save();
    return count;
  }

  // Review History
  insertReview(review) {
    if (!this.data.reviewHistory) {
      this.data.reviewHistory = [];
    }
    this.data.reviewHistory.unshift(review);
    this.save();
    return review;
  }

  getReviewsForDocument(documentId) {
    if (!this.data.reviewHistory) return [];
    return this.data.reviewHistory.filter(r => r.documentId === documentId);
  }

  getReviewHistory() {
    return this.data.reviewHistory ? [...this.data.reviewHistory] : [];
  }

  // Audit Logs
  insertAuditLog(log) {
    this.data.auditLogs.unshift(log);
    this.save();
    return log;
  }

  getAuditLogs() {
    return [...this.data.auditLogs];
  }

  // Reset database (useful for tests)
  reset() {
    this.data = {
      users: [],
      documents: [],
      notifications: [],
      auditLogs: [],
      reviewHistory: [],
      sessions: []
    };
    this.seedUsers();
    this.save();
  }
}

const dbInstance = new Database();
module.exports = dbInstance;
module.exports.Database = Database;
