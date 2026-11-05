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
      auditLogs: []
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
        if (!this.data.users || this.data.users.length === 0) {
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
    this.data.users = [
      {
        ...CONSTANTS.DEFAULT_STUDENT,
        role: 'Student'
      },
      {
        id: 'STU-2024-002',
        name: 'Jane Smith',
        email: 'jane.smith@university.edu',
        department: 'Information Technology',
        semester: '6th Semester',
        assignedFacultyAdvisorId: 'FAC-101',
        assignedFacultyAdvisorName: 'Dr. Robert Smith',
        role: 'Student'
      },
      {
        ...CONSTANTS.DEFAULT_FACULTY,
        role: 'Faculty'
      }
    ];
  }

  save() {
    try {
      const tempPath = `${this.filePath}.tmp`;
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

  getAllUsers() {
    return [...this.data.users];
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

  markNotificationRead(notificationId, recipientId) {
    const item = this.data.notifications.find(
      n => n.id === notificationId && n.recipientId === recipientId
    );
    if (item) {
      item.read = true;
      this.save();
      return item;
    }
    return null;
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
      auditLogs: []
    };
    this.seedUsers();
    this.save();
  }
}

const dbInstance = new Database();
module.exports = dbInstance;
module.exports.Database = Database;

