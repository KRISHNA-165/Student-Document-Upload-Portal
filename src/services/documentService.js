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
   * Retrieve documents for a student
   */
  getDocumentsForStudent(studentId) {
    return db.getDocuments({ studentId });
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
}

const documentServiceInstance = new DocumentService();
module.exports = documentServiceInstance;
module.exports.DocumentService = DocumentService;

