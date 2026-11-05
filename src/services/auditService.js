const crypto = require('crypto');
const db = require('../database/db');

class AuditService {
  log({ action, actorId, actorRole, targetId, details = {} }) {
    const logEntry = {
      id: `AUDIT-${crypto.randomUUID()}`,
      action,
      actorId,
      actorRole,
      targetId,
      details,
      timestamp: new Date().toISOString()
    };
    return db.insertAuditLog(logEntry);
  }

  getLogs() {
    return db.getAuditLogs();
  }
}

const auditInstance = new AuditService();
module.exports = auditInstance;
module.exports.AuditService = AuditService;

