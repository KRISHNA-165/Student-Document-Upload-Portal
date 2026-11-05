const express = require('express');
const multer = require('multer');
const CONSTANTS = require('../config/constants');
const documentService = require('../services/documentService');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Memory storage so validationService can inspect buffer magic bytes and size
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Allow slightly larger than 10MB into multer so our custom validation can return exact friendly error,
    // but cap at 20MB to prevent memory exhaustion
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

    // Double submission prevention support: Check for active lock if header provided
    const idempotencyKey = req.headers['x-idempotency-key'];

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
    if (req.user.role === 'Student') {
      docs = documentService.getDocumentsForStudent(req.user.id);
    } else {
      docs = documentService.getAllDocuments();
    }
    return res.json({
      success: true,
      count: docs.length,
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

module.exports = router;

