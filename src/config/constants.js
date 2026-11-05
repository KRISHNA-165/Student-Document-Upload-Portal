const path = require('path');

const CONSTANTS = {
  // 10 MB in bytes: 10 * 1024 * 1024 = 10,485,760 bytes
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_FILE_SIZE_MB: 10,

  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ],

  ALLOWED_EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png'],

  CATEGORIES: [
    'Achievement',
    'Internship',
    'Participation Certificate',
    'Academic Record',
    'Certification',
    'Other'
  ],

  STATUSES: {
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Approved',
    REJECTED: 'Rejected'
  },

  STORAGE_DIR: path.resolve(__dirname, '../../storage/documents'),
  DB_FILE: path.resolve(__dirname, '../../data/portal_db.json'),

  DEFAULT_STUDENT: {
    id: 'STU-2024-001',
    name: 'John Doe',
    email: 'john.doe@university.edu',
    department: 'Computer Science & Engineering',
    semester: '6th Semester',
    assignedFacultyAdvisorId: 'FAC-101',
    assignedFacultyAdvisorName: 'Dr. Robert Smith'
  },

  DEFAULT_FACULTY: {
    id: 'FAC-101',
    name: 'Dr. Robert Smith',
    email: 'robert.smith@university.edu',
    department: 'Computer Science & Engineering',
    role: 'Senior Faculty Advisor'
  }
};

module.exports = CONSTANTS;

