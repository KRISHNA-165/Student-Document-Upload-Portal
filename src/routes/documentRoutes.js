const express = require('express');
const multer = require('multer');
const CONSTANTS = require('../config/constants');
const documentService = require('../services/documentService');
const reviewService = require('../services/reviewService');
const db = require('../database/db');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Memory storage so validationService can inspect buffer magic bytes and size
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

// Helper for multer single upload with custom error handling
const uploadSingle = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File size exceeds maximum allowed limit of ${CONSTANTS.MAX_FILE_SIZE_MB} MB`
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message
      });
    } else if (err) {
      return res.status(500).json({
        success: false,
        message: 'Error handling file upload'
      });
    }
    next();
  });
};

/**
 * POST /api/documents - Upload a new document
 * Mandatory fields: title, category, dateOfAchievement, issuingOrganization, file
 */
router.post('/', uploadSingle, async (req, res) => {
  try {
    const { title, category, dateOfAchievement, issuingOrganization } = req.body;
    const file = req.file;

    const document = await documentService.uploadDocument({
      user: req.user,
      metadata: {
        title,
        category,
        dateOfAchievement,
        issuingOrganization
      },
      file
    });

    return res.status(201).json({
      success: true,
      message: 'Document uploaded successfully and submitted for Faculty Advisor verification',
      document
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors || undefined
    });
  }
});

/**
 * GET /api/documents - List documents for current user
 */
router.get('/', (req, res) => {
  try {
    let docs = [];
    let summary = null;
    let total = 0;
    if (req.user.role === 'Student') {
      const result = documentService.getDocumentsForStudent(req.user.id, req.query);
      docs = result.documents || result;
      summary = result.summary || null;
      total = result.total !== undefined ? result.total : docs.length;
    } else {
      docs = documentService.getAllDocuments();
      total = docs.length;
    }
    return res.json({
      success: true,
      count: docs.length,
      total,
      summary,
      documents: docs
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/documents/:id - Get document metadata
 */
router.get('/:id', (req, res) => {
  try {
    const doc = documentService.getDocumentById(req.params.id, req.user);
    return res.json({
      success: true,
      document: doc
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/documents/:id/download - Authorized file download
 */
router.get('/:id/download', (req, res) => {
  try {
    const { filePath, originalFilename, mimeType } = documentService.getAuthorizedFile(
      req.params.id,
      req.user
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalFilename)}"`);
    res.sendFile(filePath);
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/documents/:id/view - Authorized file preview/view
 */
router.get('/:id/view', (req, res) => {
  try {
    const { filePath, originalFilename, mimeType } = documentService.getAuthorizedFile(
      req.params.id,
      req.user
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalFilename)}"`);
    res.sendFile(filePath);
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/documents/:id/preview - Authorized file preview (alias with missing file handling, TC_10, TC_11, TC_12)
 */
router.get('/:id/preview', (req, res) => {
  try {
    const { filePath, originalFilename, mimeType } = documentService.getAuthorizedFile(
      req.params.id,
      req.user
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalFilename)}"`);
    res.sendFile(filePath, (fileErr) => {
      if (fileErr && !res.headersSent) {
        return res.status(404).json({
          success: false,
          message: 'The requested document file is currently unavailable in file storage.'
        });
      }
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'File reference unavailable'
    });
  }
});

/**
 * POST /api/documents/:id/review - Review decision by faculty (US02)
 */
router.post('/:id/review', requireRole('Faculty'), async (req, res) => {
  try {
    const { decision, comment } = req.body;
    const result = await reviewService.submitDecision({
      documentId: req.params.id,
      facultyUser: req.user,
      decision,
      comment
    });

    return res.json({
      success: true,
      message: `Document decision recorded: ${result.document.status}`,
      document: result.document,
      review: result.review
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/documents/:id/history - Review history for a document (US05)
 */
router.get('/:id/history', (req, res) => {
  try {
    const doc = documentService.getDocumentById(req.params.id, req.user);
    const history = db.getReviewsForDocument(req.params.id);
    return res.json({
      success: true,
      documentId: req.params.id,
      documentTitle: doc.title,
      count: history.length,
      history
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/documents/:id/review-history - Alias for review history (US05)
 */
router.get('/:id/review-history', (req, res) => {
  try {
    const doc = documentService.getDocumentById(req.params.id, req.user);
    const history = db.getReviewsForDocument(req.params.id);
    return res.json({
      success: true,
      documentId: req.params.id,
      documentTitle: doc.title,
      count: history.length,
      history
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * PUT /api/documents/:id/replacement - Replace a rejected document with a corrected version (US03)
 */
router.put('/:id/replacement', uploadSingle, async (req, res) => {
  try {
    const { title, category, dateOfAchievement, issuingOrganization } = req.body;
    const file = req.file;

    const metadata = {};
    if (title !== undefined) metadata.title = title;
    if (category !== undefined) metadata.category = category;
    if (dateOfAchievement !== undefined) metadata.dateOfAchievement = dateOfAchievement;
    if (issuingOrganization !== undefined) metadata.issuingOrganization = issuingOrganization;

    const updatedDocument = await documentService.replaceRejectedDocument({
      id: req.params.id,
      user: req.user,
      metadata,
      file
    });

    return res.json({
      success: true,
      message: 'Replacement document submitted successfully and returned to Pending Approval',
      document: updatedDocument
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
      errors: err.errors || undefined
    });
  }
});

/**
 * PUT /api/documents/:id/replace - Replace document file/metadata when permitted
 */
router.put('/:id/replace', uploadSingle, async (req, res) => {
  try {
    const { title, category, dateOfAchievement, issuingOrganization } = req.body;
    const file = req.file;

    const metadata = {};
    if (title !== undefined) metadata.title = title;
    if (category !== undefined) metadata.category = category;
    if (dateOfAchievement !== undefined) metadata.dateOfAchievement = dateOfAchievement;
    if (issuingOrganization !== undefined) metadata.issuingOrganization = issuingOrganization;

    const updatedDocument = await documentService.replaceDocument({
      id: req.params.id,
      user: req.user,
      metadata,
      file
    });

    return res.json({
      success: true,
      message: 'Document replaced successfully',
      document: updatedDocument
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
      errors: err.errors || undefined
    });
  }
});

/**
 * DELETE /api/documents/:id - Delete / remove a student document (TC_40)
 */
router.delete('/:id', (req, res) => {
  try {
    const doc = db.getDocumentById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Ownership check: Students can only delete their own documents
    if (req.user && req.user.role === 'Student' && doc.studentId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You cannot delete another student\'s document'
      });
    }

    const removed = db.deleteDocument(req.params.id);
    if (!removed) {
      return res.status(500).json({
        success: false,
        message: 'Failed to remove document'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Document removed successfully',
      documentId: req.params.id
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;
