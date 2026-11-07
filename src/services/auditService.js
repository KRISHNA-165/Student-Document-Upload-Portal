const crypto = require('crypto');
const db = require('../database/db');

class AuditService {
  /**
   * Remove sensitive keys (passwords, salts, tokens, secrets) from details
   */
  sanitizeDetails(details) {
    if (!details || typeof details !== 'object') return {};
    const sanitized = {};
    const sensitiveKeys = ['password', 'salt', 'passwordhash', 'passwordsalt', 'hash', 'token', 'secret', 'key'];

    for (const [key, value] of Object.entries(details)) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeDetails(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Record a new audit log event (US10 AC 5, 6, 7)
   */
  log({ action, actorId, actorName, actorRole, targetId, documentId, details = {}, ip, userAgent }) {
    if (!action) {
      throw new Error('Audit log action is required');
    }

    // Resolve actor name if not provided
    let resolvedActorName = actorName;
    let resolvedActorRole = actorRole;

    if (actorId && (!resolvedActorName || !resolvedActorRole)) {
      const user = db.getUserById(actorId);
      if (user) {
        resolvedActorName = resolvedActorName || user.name;
        resolvedActorRole = resolvedActorRole || user.role;
      }
    }

    const docRef = documentId || targetId || null;

    const logEntry = {
      id: `AUDIT-${crypto.randomUUID()}`,
      action: String(action).toUpperCase(),
      actorId: actorId || 'SYSTEM',
      actorName: resolvedActorName || (actorId ? actorId : 'System'),
      actorRole: resolvedActorRole || 'System',
      targetId: targetId || docRef,
      documentId: docRef,
      details: this.sanitizeDetails(details),
      ip: ip || null,
      userAgent: userAgent || null,
      timestamp: new Date().toISOString()
    };

    return db.insertAuditLog(logEntry);
  }

  /**
   * Retrieve raw list of all audit logs
   */
  getLogs() {
    return db.getAuditLogs();
  }

  /**
   * Query and filter audit logs with pagination and search (US10 AC 9)
   */
  queryLogs(options = {}) {
    let logs = db.getAuditLogs();

    // 1. Filter by action
    if (options.action) {
      const act = String(options.action).toUpperCase();
      logs = logs.filter(l => l.action && l.action.toUpperCase().includes(act));
    }

    // 2. Filter by actorId
    if (options.actorId) {
      logs = logs.filter(l => l.actorId === options.actorId);
    }

    // 3. Filter by actorRole
    if (options.actorRole || options.role) {
      const role = String(options.actorRole || options.role).toLowerCase();
      logs = logs.filter(l => (l.actorRole || '').toLowerCase() === role);
    }

    // 4. Filter by documentId / targetId
    if (options.documentId || options.targetId) {
      const target = options.documentId || options.targetId;
      logs = logs.filter(l => l.targetId === target || l.documentId === target);
    }

    // 5. Filter by Date range
    if (options.from || options.startDate) {
      const fromStr = options.from || options.startDate;
      const fromTime = new Date(fromStr.length === 10 ? `${fromStr}T00:00:00.000Z` : fromStr).getTime();
      if (!isNaN(fromTime)) {
        logs = logs.filter(l => new Date(l.timestamp).getTime() >= fromTime);
      }
    }

    if (options.to || options.endDate) {
      const toStr = options.to || options.endDate;
      const toTime = new Date(toStr.length === 10 ? `${toStr}T23:59:59.999Z` : toStr).getTime();
      if (!isNaN(toTime)) {
        logs = logs.filter(l => new Date(l.timestamp).getTime() <= toTime);
      }
    }

    // 6. Free text search
    if (options.search) {
      const q = String(options.search).toLowerCase();
      logs = logs.filter(l => {
        const text = `${l.action} ${l.actorId} ${l.actorName} ${l.actorRole} ${l.targetId || ''} ${JSON.stringify(l.details)}`.toLowerCase();
        return text.includes(q);
      });
    }

    const total = logs.length;
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.max(1, parseInt(options.limit, 10) || 50);
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = logs.slice((page - 1) * limit, page * limit);

    return {
      count: paginated.length,
      total,
      page,
      limit,
      totalPages,
      logs: paginated
    };
  }

  /**
   * Retrieve full audit trail for a specific document (US10 AC 7)
   */
  getAuditTrailForDocument(documentId) {
    if (!documentId) return [];
    const all = db.getAuditLogs();
    return all.filter(l => 
      l.targetId === documentId || 
      l.documentId === documentId ||
      (l.details && (l.details.documentId === documentId || l.details.id === documentId))
    );
  }

  /**
   * Retrieve audit trail for a user (US10 AC 10: Retained even after deactivation)
   */
  getAuditTrailForUser(userId) {
    if (!userId) return [];
    const all = db.getAuditLogs();
    return all.filter(l => l.actorId === userId || l.targetId === userId);
  }
}

const auditInstance = new AuditService();
module.exports = auditInstance;
module.exports.AuditService = AuditService;
