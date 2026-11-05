const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CONSTANTS = require('../config/constants');

class StorageService {
  constructor(storageDir = CONSTANTS.STORAGE_DIR) {
    this.storageDir = storageDir;
    this.ensureStorageDir();
  }

  ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  getSafePath(storageKey) {
    // Prevent directory traversal attacks
    const sanitizedKey = path.basename(storageKey);
    const resolvedPath = path.resolve(this.storageDir, sanitizedKey);
    if (!resolvedPath.startsWith(path.resolve(this.storageDir))) {
      throw new Error('Access denied: Invalid storage path');
    }
    return resolvedPath;
  }

  async saveFile(buffer, originalFilename) {
    this.ensureStorageDir();
    const ext = path.extname(originalFilename).toLowerCase();
    const uniqueKey = `${crypto.randomUUID()}${ext}`;
    const targetPath = this.getSafePath(uniqueKey);

    await fs.promises.writeFile(targetPath, buffer);
    return {
      storageKey: uniqueKey,
      filePath: targetPath,
      size: buffer.length
    };
  }

  async deleteFile(storageKey) {
    try {
      const targetPath = this.getSafePath(storageKey);
      if (fs.existsSync(targetPath)) {
        await fs.promises.unlink(targetPath);
        return true;
      }
    } catch (err) {
      console.warn(`Warning: Could not delete storage file ${storageKey}:`, err.message);
    }
    return false;
  }

  fileExists(storageKey) {
    try {
      const targetPath = this.getSafePath(storageKey);
      return fs.existsSync(targetPath);
    } catch {
      return false;
    }
  }

  getFilePath(storageKey) {
    const targetPath = this.getSafePath(storageKey);
    if (!fs.existsSync(targetPath)) {
      throw new Error('File not found in storage');
    }
    return targetPath;
  }

  getFileStream(storageKey) {
    const targetPath = this.getFilePath(storageKey);
    return fs.createReadStream(targetPath);
  }

  getFileBuffer(storageKey) {
    const targetPath = this.getFilePath(storageKey);
    return fs.readFileSync(targetPath);
  }
}

const storageInstance = new StorageService();
module.exports = storageInstance;
module.exports.StorageService = StorageService;

