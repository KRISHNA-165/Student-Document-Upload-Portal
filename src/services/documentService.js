const crypto = require('crypto');
const db = require('../database/db');
const storageService = require('./storageService');
const validationService = require('./validationService');
const notificationService = require('./notificationService');
const auditService = require('./auditService');
const CONSTANTS = require('../config/constants');

class DocumentService {
  /**
   * Upload and persist a new student document
   */
  async uploadDocument({ user, metadata, file }) {
    if (!user || user.role !== 'Student') {
      const err = new Error('Unauthorized: Only students can upload documents');
      err.statusCode = 403;
      throw err;
    }

    // 1. Validate metadata
    const metaValidation = validationService.validateMetadata(metadata);
    if (!metaValidation.isValid) {
      const err = new Error('Metadata validation failed');
      err.statusCode = 400;
      err.errors = metaValidation.errors;
      throw err;
    }

    // 2. Validate file
    const fileValidation = validationService.validateFile(file);
    if (!fileValidation.isValid) {
      const err = new Error(fileValidation.error);
      err.statusCode = 400;
      throw err;
    }

    // 3. Store file in private file storage
    let storedFile;
    try {
      storedFile = await storageService.saveFile(file.buffer, file.originalname);
    } catch (storageErr) {
      const err = new Error('File storage operation failed');
      err.statusCode = 500;
      throw err;
    }

    // 4. Persist metadata in database with atomic failure rollback
    const docId = `DOC-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const documentRecord = {
      id: docId,
      studentId: user.id,
      studentName: user.name,
      studentDepartment: user.department,
      assignedFacultyAdvisorId: user.assignedFacultyAdvisorId,
      title: metaValidation.sanitized.title,
      category: metaValidation.sanitized.category,
      dateOfAchievement: metaValidation.sanitized.dateOfAchievement,
      issuingOrganization: metaValidation.sanitized.issuingOrganization,
      originalFilename: file.originalname,
      storageKey: storedFile.storageKey,
      fileSize: storedFile.size,
      mimeType: fileValidation.mimeType,
      extension: fileValidation.extension,
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      createdAt: now,
      updatedAt: now
    };

    try {
      db.insertDocument(documentRecord);
    } catch (dbErr) {
      // Rollback file write if database persistence fails
      await storageService.deleteFile(storedFile.storageKey);
      const err = new Error('Failed to save document metadata');
      err.statusCode = 500;
      throw err;
    }

    // 5. Notify assigned Faculty Advisor
    try {
      notificationService.notifyFacultyAdvisor({
        facultyId: user.assignedFacultyAdvisorId,
        studentId: user.id,
        studentName: user.name,
        documentId: documentRecord.id,
        documentTitle: documentRecord.title,
        category: documentRecord.category,
        action: 'SUBMITTED'
      });
    } catch (notifErr) {
      console.warn('Faculty notification warning:', notifErr.message);
    }

    // 6. Record Audit Log
    try {
      auditService.log({
        action: 'DOCUMENT_UPLOAD',
        actorId: user.id,
        actorRole: user.role,
        targetId: documentRecord.id,
        details: {
          title: documentRecord.title,
          category: documentRecord.category,
          originalFilename: documentRecord.originalFilename,
          fileSize: documentRecord.fileSize,
          storageKey: documentRecord.storageKey
        }
      });
    } catch (auditErr) {
      console.warn('Audit logging warning:', auditErr.message);
    }

    return documentRecord;
  }

  /**
   * Retrieve documents for a student with filtering, searching, sorting, and pagination
   */
  getDocumentsForStudent(studentId, options = {}) {
    // 1. Validate date range if provided (TC_15)
    const from = options.from || options.startDate;
    const to = options.to || options.endDate;
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime()) && fromDate > toDate) {
        const err = new Error('Start date cannot be later than end date');
        err.statusCode = 400;
        throw err;
      }
    }

    let docs = db.getDocuments({ studentId });

    // 2. Filter by status (TC_09, TC_10, TC_11, TC_12)
    if (options.status && options.status !== 'all' && options.status !== 'All') {
      const targetStatus = options.status.trim().toLowerCase();
      docs = docs.filter(d => d.status && d.status.toLowerCase() === targetStatus);
    }

    // 3. Filter by category (TC_13)
    if (options.category && options.category !== 'all' && options.category !== 'All') {
      const targetCategory = options.category.trim().toLowerCase();
      docs = docs.filter(d => d.category && d.category.toLowerCase() === targetCategory);
    }

    // 4. Search by title, issuing organization, and category (TC_02 - TC_06, TC_22 - TC_24)
    if (options.search !== undefined && options.search !== null) {
      const query = String(options.search).trim().toLowerCase();
      if (query.length > 0) {
        docs = docs.filter(d => {
          const titleMatch = d.title && d.title.toLowerCase().includes(query);
          const orgMatch = d.issuingOrganization && d.issuingOrganization.toLowerCase().includes(query);
          const catMatch = d.category && (d.category.toLowerCase() === query || d.category.toLowerCase().includes(query) && !d.title);
          return Boolean(titleMatch || orgMatch || catMatch);
        });
      }
    }

    // 5. Filter by Date Range (TC_14)
    if (from) {
      const start = new Date(from);
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        docs = docs.filter(d => {
          const docDate = new Date(d.createdAt || d.submissionDate || d.dateOfAchievement);
          return docDate >= start;
        });
      }
    }
    if (to) {
      const end = new Date(to);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        docs = docs.filter(d => {
          const docDate = new Date(d.createdAt || d.submissionDate || d.dateOfAchievement);
          return docDate <= end;
        });
      }
    }

    // 6. Sorting (TC_18 - TC_21)
    const sortBy = (options.sort || options.sortBy || 'newest').toLowerCase();
    const defaultOrder = (sortBy === 'oldest' || sortBy === 'title_asc' || sortBy === 'title' || sortBy === 'status') ? 'asc' : 'desc';
    const sortOrder = (options.sortOrder || defaultOrder).toLowerCase();

    if (sortBy === 'title' || sortBy === 'title_asc' || sortBy === 'title_desc') {
      const isDesc = sortBy === 'title_desc' || (sortBy !== 'title_asc' && sortBy !== 'title' && sortOrder === 'desc') || (options.sortOrder === 'desc');
      docs.sort((a, b) => {
        const res = (a.title || '').localeCompare(b.title || '');
        return isDesc ? -res : res;
      });
    } else if (sortBy === 'status') {
      const statusRank = {
        'pending approval': 1,
        'pending': 1,
        'approved': 2,
        'rejected': 3
      };
      const isDesc = options.sortOrder === 'desc';
      docs.sort((a, b) => {
        const rankA = statusRank[(a.status || '').toLowerCase()] || 99;
        const rankB = statusRank[(b.status || '').toLowerCase()] || 99;
        if (rankA !== rankB) {
          return isDesc ? rankB - rankA : rankA - rankB;
        }
        return (a.title || '').localeCompare(b.title || '');
      });
    } else {
      // Default: date sorting (newest / oldest)
      docs.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.submissionDate || 0).getTime();
        const timeB = new Date(b.createdAt || b.submissionDate || 0).getTime();
        if (timeA !== timeB) {
          return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        }
        return sortOrder === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
      });
    }

    // 7. Summary counts for student dashboard (TC_17)
    const allStudentDocs = db.getDocuments({ studentId });
    const summary = {
      total: allStudentDocs.length,
      pending: allStudentDocs.filter(d => d.status === CONSTANTS.STATUSES.PENDING_APPROVAL).length,
      approved: allStudentDocs.filter(d => d.status === CONSTANTS.STATUSES.APPROVED).length,
      rejected: allStudentDocs.filter(d => d.status === CONSTANTS.STATUSES.REJECTED).length
    };

    const totalCount = docs.length;

    // 8. Pagination (TC_27, TC_28, TC_40)
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.max(1, parseInt(options.limit, 10) || 10);
    let paginatedDocs = docs;
    if (options.page !== undefined || options.limit !== undefined) {
      const start = (page - 1) * limit;
      paginatedDocs = docs.slice(start, start + limit);
    }
    const totalPages = limit > 0 ? Math.ceil(totalCount / limit) : 1;

    const returnArr = [...paginatedDocs];
    returnArr.documents = paginatedDocs;
    returnArr.total = totalCount;
    returnArr.page = page;
    returnArr.limit = limit;
    returnArr.totalPages = totalPages;
    returnArr.summary = summary;

    return returnArr;
  }

  /**
   * Retrieve all documents (e.g. for faculty advisor review)
   */
  getAllDocuments(filter = {}) {
    return db.getDocuments(filter);
  }

  /**
   * Retrieve single document with ownership check
   */
  getDocumentById(id, user) {
    const doc = db.getDocumentById(id);
    if (!doc) {
      const err = new Error('Document not found');
      err.statusCode = 404;
      throw err;
    }

    // Authorization check
    if (user.role === 'Student' && doc.studentId !== user.id) {
      const err = new Error('Access denied: You can only access your own documents');
      err.statusCode = 403;
      throw err;
    }

    return doc;
  }

  /**
   * Get file path and details for authorized download / view
   */
  getAuthorizedFile(id, user) {
    const doc = this.getDocumentById(id, user);
    const filePath = storageService.getFilePath(doc.storageKey);

    return {
      document: doc,
      filePath,
      mimeType: doc.mimeType,
      originalFilename: doc.originalFilename
    };
  }

  /**
   * Replace a document when permitted (e.g., Pending Approval status)
   */
  async replaceDocument({ id, user, metadata = {}, file }) {
    const doc = this.getDocumentById(id, user);

    // If the document is Rejected, delegate to replaceRejectedDocument (US03)
    if (doc.status === CONSTANTS.STATUSES.REJECTED) {
      return this.replaceRejectedDocument({ id, user, metadata, file });
    }

    // Verify permission: Only allow replacing when in Pending Approval status
    if (doc.status !== CONSTANTS.STATUSES.PENDING_APPROVAL) {
      const err = new Error(`Cannot replace document. Replacement is only permitted while status is '${CONSTANTS.STATUSES.PENDING_APPROVAL}'. Current status is '${doc.status}'.`);
      err.statusCode = 400;
      throw err;
    }

    const updates = {};

    // Validate metadata if provided
    if (Object.keys(metadata).length > 0) {
      const metaValidation = validationService.validateMetadata({
        title: metadata.title !== undefined ? metadata.title : doc.title,
        category: metadata.category !== undefined ? metadata.category : doc.category,
        dateOfAchievement: metadata.dateOfAchievement !== undefined ? metadata.dateOfAchievement : doc.dateOfAchievement,
        issuingOrganization: metadata.issuingOrganization !== undefined ? metadata.issuingOrganization : doc.issuingOrganization
      });

      if (!metaValidation.isValid) {
        const err = new Error('Validation failed for replacement metadata');
        err.statusCode = 400;
        err.errors = metaValidation.errors;
        throw err;
      }

      Object.assign(updates, metaValidation.sanitized);
    }

    // Replace file if new file provided
    let oldStorageKey = null;
    if (file) {
      const fileValidation = validationService.validateFile(file);
      if (!fileValidation.isValid) {
        const err = new Error(fileValidation.error);
        err.statusCode = 400;
        throw err;
      }

      const stored = await storageService.saveFile(file.buffer, file.originalname);
      oldStorageKey = doc.storageKey;

      updates.storageKey = stored.storageKey;
      updates.originalFilename = file.originalname;
      updates.fileSize = stored.size;
      updates.mimeType = fileValidation.mimeType;
      updates.extension = fileValidation.extension;
    }

    // Apply updates
    const updatedDoc = db.updateDocument(id, updates);

    // If new file saved successfully, delete the old file
    if (oldStorageKey) {
      await storageService.deleteFile(oldStorageKey);
    }

    // Notify faculty advisor about update
    try {
      notificationService.notifyFacultyAdvisor({
        facultyId: doc.assignedFacultyAdvisorId,
        studentId: user.id,
        studentName: user.name,
        documentId: updatedDoc.id,
        documentTitle: updatedDoc.title,
        category: updatedDoc.category,
        action: 'REPLACED'
      });
    } catch (notifErr) {
      console.warn('Faculty notification warning on replace:', notifErr.message);
    }

    // Audit log
    try {
      auditService.log({
        action: 'DOCUMENT_REPLACE',
        actorId: user.id,
        actorRole: user.role,
        targetId: doc.id,
        details: {
          updatedFields: Object.keys(updates),
          newFile: Boolean(file)
        }
      });
    } catch (auditErr) {
      console.warn('Audit log error on replace:', auditErr.message);
    }

    return updatedDoc;
  }

  /**
   * Replace a rejected document with a corrected version and resubmit (US03)
   */
  async replaceRejectedDocument({ id, user, metadata = {}, file }) {
    // 1. Role validation (TC_29)
    if (!user || user.role !== 'Student') {
      const err = new Error('Faculty cannot replace student document. Only students can perform this action.');
      err.statusCode = 403;
      throw err;
    }

    // 2. Fetch document (TC_30)
    const doc = db.getDocumentById(id);
    if (!doc) {
      const err = new Error('Document not found');
      err.statusCode = 404;
      throw err;
    }

    // 3. Ownership validation (TC_28, TC_40)
    if (doc.studentId !== user.id) {
      const err = new Error('Access denied: You can only replace your own documents');
      err.statusCode = 403;
      throw err;
    }

    // 4. Status validation (TC_02, TC_27)
    if (doc.status === CONSTANTS.STATUSES.PENDING_APPROVAL) {
      const err = new Error('Document under review cannot be replaced. Replacement is only permitted for rejected documents.');
      err.statusCode = 400;
      throw err;
    }

    if (doc.status === CONSTANTS.STATUSES.APPROVED) {
      const err = new Error('Approved documents cannot be replaced according to system rules.');
      err.statusCode = 400;
      throw err;
    }

    if (doc.status !== CONSTANTS.STATUSES.REJECTED) {
      const err = new Error(`Replacement is only permitted for documents with Rejected status. Current status is '${doc.status}'.`);
      err.statusCode = 400;
      throw err;
    }

    // 5. Require new replacement file (TC_11)
    if (!file) {
      const err = new Error('A replacement file is required for resubmission. Please select a valid document.');
      err.statusCode = 400;
      throw err;
    }

    // 6. Validate replacement file format and size (TC_06, TC_07, TC_08, TC_09, TC_10)
    const fileValidation = validationService.validateFile(file);
    if (!fileValidation.isValid) {
      const err = new Error(fileValidation.error);
      err.statusCode = 400;
      throw err;
    }

    // 7. Validate metadata fields (TC_12, TC_13, TC_14, TC_15, TC_38, TC_39)
    const targetTitle = metadata.title !== undefined ? metadata.title : doc.title;
    const targetCategory = metadata.category !== undefined ? metadata.category : doc.category;
    const targetDate = metadata.dateOfAchievement !== undefined ? metadata.dateOfAchievement : doc.dateOfAchievement;
    const targetOrg = metadata.issuingOrganization !== undefined ? metadata.issuingOrganization : doc.issuingOrganization;

    const metaValidation = validationService.validateMetadata({
      title: targetTitle,
      category: targetCategory,
      dateOfAchievement: targetDate,
      issuingOrganization: targetOrg
    });

    if (!metaValidation.isValid) {
      const err = new Error('Validation failed for replacement metadata');
      err.statusCode = 400;
      err.errors = metaValidation.errors;
      throw err;
    }

    // 8. Store replacement file in private storage (TC_32)
    let storedFile;
    try {
      storedFile = await storageService.saveFile(file.buffer, file.originalname);
    } catch (storageErr) {
      const err = new Error('File storage operation failed while saving replacement');
      err.statusCode = 500;
      throw err;
    }

    // 9. Version tracking & metadata update (TC_16, TC_17, TC_19, TC_35)
    const now = new Date().toISOString();
    const previousVersions = Array.isArray(doc.versions) ? [...doc.versions] : [
      {
        version: 1,
        storageKey: doc.storageKey,
        originalFilename: doc.originalFilename,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        uploadedAt: doc.createdAt
      }
    ];

    const newVersion = (doc.version || 1) + 1;
    previousVersions.push({
      version: newVersion,
      storageKey: storedFile.storageKey,
      originalFilename: file.originalname,
      fileSize: storedFile.size,
      mimeType: fileValidation.mimeType,
      uploadedAt: now
    });

    const updates = {
      title: metaValidation.sanitized.title,
      category: metaValidation.sanitized.category,
      dateOfAchievement: metaValidation.sanitized.dateOfAchievement,
      issuingOrganization: metaValidation.sanitized.issuingOrganization,
      originalFilename: file.originalname,
      storageKey: storedFile.storageKey,
      fileSize: storedFile.size,
      mimeType: fileValidation.mimeType,
      extension: fileValidation.extension,
      status: CONSTANTS.STATUSES.PENDING_APPROVAL,
      version: newVersion,
      versions: previousVersions,
      updatedAt: now,
      resubmittedAt: now
    };

    const updatedDoc = db.updateDocument(id, updates);

    // 10. Notify assigned Faculty Advisor of resubmission (TC_20)
    try {
      notificationService.notifyFacultyAdvisor({
        facultyId: doc.assignedFacultyAdvisorId,
        studentId: user.id,
        studentName: user.name,
        documentId: updatedDoc.id,
        documentTitle: updatedDoc.title,
        category: updatedDoc.category,
        action: 'RESUBMITTED'
      });
    } catch (notifErr) {
      console.warn('Faculty resubmission notification warning:', notifErr.message);
    }

    // 11. Notify student that resubmission was received (TC_21)
    try {
      db.insertNotification({
        id: `NOTIF-${crypto.randomUUID()}`,
        recipientId: user.id,
        senderId: 'SYSTEM',
        documentId: updatedDoc.id,
        documentTitle: updatedDoc.title,
        title: 'Resubmission Received',
        message: `Your replacement document "${updatedDoc.title}" has been successfully resubmitted and is now pending verification.`,
        read: false,
        createdAt: now
      });
    } catch (notifErr) {
      console.warn('Student resubmission notification warning:', notifErr.message);
    }

    // 12. Log audit event
    try {
      auditService.log({
        action: 'DOCUMENT_RESUBMISSION',
        actorId: user.id,
        actorRole: user.role,
        targetId: doc.id,
        details: {
          previousStatus: CONSTANTS.STATUSES.REJECTED,
          newStatus: CONSTANTS.STATUSES.PENDING_APPROVAL,
          version: newVersion,
          originalFilename: file.originalname,
          title: updatedDoc.title
        }
      });
    } catch (auditErr) {
      console.warn('Audit logging warning on resubmission:', auditErr.message);
    }

    return updatedDoc;
  }
}

const documentServiceInstance = new DocumentService();
module.exports = documentServiceInstance;
module.exports.DocumentService = DocumentService;

