const path = require('path');
const CONSTANTS = require('../config/constants');

class ValidationService {
  /**
   * Validates metadata fields for document submission
   */
  validateMetadata(fields = {}) {
    const errors = {};
    const sanitized = {};

    // 1. Document Title
    const rawTitle = fields.title;
    if (rawTitle === undefined || rawTitle === null || String(rawTitle).trim() === '') {
      errors.title = 'Document Title is required';
    } else {
      const trimmedTitle = String(rawTitle).trim();
      if (trimmedTitle.length < 2) {
        errors.title = 'Document Title must be at least 2 characters long';
      } else if (trimmedTitle.length > 255) {
        errors.title = 'Document Title cannot exceed 255 characters';
      } else {
        sanitized.title = trimmedTitle;
      }
    }

    // 2. Category
    const rawCategory = fields.category;
    if (!rawCategory || String(rawCategory).trim() === '') {
      errors.category = 'Category is required';
    } else {
      const trimmedCategory = String(rawCategory).trim();
      if (!CONSTANTS.CATEGORIES.includes(trimmedCategory)) {
        errors.category = `Invalid category. Allowed categories: ${CONSTANTS.CATEGORIES.join(', ')}`;
      } else {
        sanitized.category = trimmedCategory;
      }
    }

    // 3. Date of Achievement
    const rawDate = fields.dateOfAchievement;
    if (!rawDate || String(rawDate).trim() === '') {
      errors.dateOfAchievement = 'Date of Achievement is required';
    } else {
      const trimmedDate = String(rawDate).trim();
      // Expect YYYY-MM-DD
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(trimmedDate)) {
        errors.dateOfAchievement = 'Invalid date format. Expected YYYY-MM-DD';
      } else {
        const [year, month, day] = trimmedDate.split('-').map(Number);
        const parsedDate = new Date(year, month - 1, day);
        // Verify calendar validity (e.g. month <= 12, day matches month)
        if (
          parsedDate.getFullYear() !== year ||
          parsedDate.getMonth() !== month - 1 ||
          parsedDate.getDate() !== day
        ) {
          errors.dateOfAchievement = 'Invalid calendar date';
        } else {
          // Reject future achievement date
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          if (parsedDate > today) {
            errors.dateOfAchievement = 'Achievement date cannot be in the future';
          } else {
            sanitized.dateOfAchievement = trimmedDate;
          }
        }
      }
    }

    // 4. Issuing Organization
    const rawOrg = fields.issuingOrganization;
    if (rawOrg === undefined || rawOrg === null || String(rawOrg).trim() === '') {
      errors.issuingOrganization = 'Issuing Organization is required';
    } else {
      const trimmedOrg = String(rawOrg).trim();
      if (trimmedOrg.length < 2) {
        errors.issuingOrganization = 'Issuing Organization must be at least 2 characters long';
      } else if (trimmedOrg.length > 200) {
        errors.issuingOrganization = 'Issuing Organization cannot exceed 200 characters';
      } else {
        sanitized.issuingOrganization = trimmedOrg;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      sanitized
    };
  }

  /**
   * Validates uploaded file buffer and properties
   */
  validateFile(file) {
    if (!file) {
      return {
        isValid: false,
        error: 'A document file is required'
      };
    }

    // Check file size
    if (file.size === 0 || (file.buffer && file.buffer.length === 0)) {
      return {
        isValid: false,
        error: 'The uploaded file is empty or unreadable'
      };
    }

    if (file.size > CONSTANTS.MAX_FILE_SIZE_BYTES) {
      return {
        isValid: false,
        error: `File size exceeds maximum allowed limit of ${CONSTANTS.MAX_FILE_SIZE_MB} MB`
      };
    }

    // Check file extension
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!CONSTANTS.ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        isValid: false,
        error: `Unsupported file format '${ext || 'unknown'}'. Only PDF, JPG, JPEG, and PNG files are allowed.`
      };
    }

    // Check file magic bytes signature if buffer is available
    if (file.buffer && file.buffer.length >= 4) {
      const isSignatureValid = this.verifyMagicBytes(file.buffer, ext);
      if (!isSignatureValid) {
        return {
          isValid: false,
          error: `File signature mismatch. The file content does not match the allowed ${ext.toUpperCase()} format.`
        };
      }
    }

    // Determine normalized MIME type
    let mimeType = file.mimetype;
    if (ext === '.pdf') mimeType = 'application/pdf';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';

    return {
      isValid: true,
      mimeType,
      extension: ext,
      size: file.size
    };
  }

  /**
   * Verifies magic bytes signatures
   */
  verifyMagicBytes(buffer, ext) {
    if (!buffer || buffer.length < 4) return false;

    // PDF magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    if (ext === '.pdf') {
      return (
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46
      );
    }

    // JPEG / JPG magic bytes: 0xFF 0xD8 0xFF
    if (ext === '.jpg' || ext === '.jpeg') {
      return (
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      );
    }

    // PNG magic bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    if (ext === '.png') {
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    }

    return false;
  }
}

const validationInstance = new ValidationService();
module.exports = validationInstance;
module.exports.ValidationService = ValidationService;

