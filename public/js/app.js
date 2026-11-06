// Client-side Application for AcademiaFlow Portal (US01)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

// State
let currentUser = null;
let selectedFile = null;
let isSubmitting = false;
let currentView = 'landing'; // 'landing' | 'portal'
let selectedSigninRole = 'Student';

// DOM Elements - Views & Navigation
const landingView = document.getElementById('landingView');
const portalDashboardView = document.getElementById('portalDashboardView');
const signinModal = document.getElementById('signinModal');
const guestNavControls = document.getElementById('guestNavControls');
const authNavControls = document.getElementById('authNavControls');
const brandLogo = document.getElementById('brandLogo');
const btnNavLogin = document.getElementById('btnNavLogin');
const btnCloseSignin = document.getElementById('btnCloseSignin');
const btnSignOut = document.getElementById('btnSignOut');

// Landing CTAs
const btnCtaStudent = document.getElementById('btnCtaStudent');
const btnCtaFaculty = document.getElementById('btnCtaFaculty');
const btnCtaAdmin = document.getElementById('btnCtaAdmin');

// Signin Modal Elements
const signinForm = document.getElementById('signinForm');
const signinEmail = document.getElementById('signinEmail');
const signinPassword = document.getElementById('signinPassword');
const btnTogglePwd = document.getElementById('btnTogglePwd');
const rolePills = document.querySelectorAll('.role-pill');

// Upload Form Elements
const uploadForm = document.getElementById('uploadForm');
const documentTitleInput = document.getElementById('documentTitle');
const titleCharCount = document.getElementById('titleCharCount');
const documentCategorySelect = document.getElementById('documentCategory');
const dateOfAchievementInput = document.getElementById('dateOfAchievement');
const issuingOrganizationInput = document.getElementById('issuingOrganization');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const dropzoneContent = document.getElementById('dropzoneContent');
const filePreviewPill = document.getElementById('filePreviewPill');
const previewFileName = document.getElementById('previewFileName');
const previewFileSize = document.getElementById('previewFileSize');
const btnRemoveFile = document.getElementById('btnRemoveFile');
const btnUpload = document.getElementById('btnUpload');
const uploadSpinner = document.getElementById('uploadSpinner');
const uploadBtnText = document.getElementById('uploadBtnText');
const btnResetForm = document.getElementById('btnResetForm');

// Feedback elements
const titleFeedback = document.getElementById('titleFeedback');
const categoryFeedback = document.getElementById('categoryFeedback');
const dateFeedback = document.getElementById('dateFeedback');
const orgFeedback = document.getElementById('orgFeedback');
const fileFeedback = document.getElementById('fileFeedback');

// Checklist indicators
const checkTitle = document.getElementById('checkTitle');
const checkCategory = document.getElementById('checkCategory');
const checkDate = document.getElementById('checkDate');
const checkOrg = document.getElementById('checkOrg');
const checkFile = document.getElementById('checkFile');

// User profile & role switch elements
const roleSelect = document.getElementById('roleSelect');
const userNameEl = document.getElementById('userName');
const userRoleEl = document.getElementById('userRole');
const userAvatarEl = document.getElementById('userAvatar');
const advisorBanner = document.getElementById('advisorBanner');
const assignedAdvisorName = document.getElementById('assignedAdvisorName');

// Tabs
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');
const myDocsCountBadge = document.getElementById('myDocsCount');
const facultyNotifCountBadge = document.getElementById('facultyNotifCount');

// Tables
const documentsTableBody = document.getElementById('documentsTableBody');
const facultyDocsTableBody = document.getElementById('facultyDocsTableBody');
const notificationsList = document.getElementById('notificationsList');
const auditTableBody = document.getElementById('auditTableBody');

// Modals
const previewModal = document.getElementById('previewModal');
const previewModalBody = document.getElementById('previewModalBody');
const btnClosePreview = document.getElementById('btnClosePreview');
const btnClosePreviewBtn = document.getElementById('btnClosePreviewBtn');
const btnDownloadPreview = document.getElementById('btnDownloadPreview');

const replaceModal = document.getElementById('replaceModal');
const replaceForm = document.getElementById('replaceForm');
const btnCloseReplace = document.getElementById('btnCloseReplace');
const btnCancelReplace = document.getElementById('btnCancelReplace');

const successModal = document.getElementById('successModal');
const successModalBody = document.getElementById('successModalBody');
const btnCloseSuccess = document.getElementById('btnCloseSuccess');
const btnGoToDocs = document.getElementById('btnGoToDocs');

// Global alerts
const alertContainer = document.getElementById('alertContainer');

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Set max date for achievement to today's date
  const todayStr = new Date().toISOString().split('T')[0];
  if (dateOfAchievementInput) dateOfAchievementInput.setAttribute('max', todayStr);

  const replaceDateInput = document.getElementById('replaceDate');
  if (replaceDateInput) replaceDateInput.setAttribute('max', todayStr);

  // Bind event listeners
  setupEventListeners();

  // Load current user profile from server
  await loadCurrentUser();

  // Initial check: if already authenticated, can show portal or landing
  // By default, show Landing page as per design mockup, but allow instant login
  showLandingPage();
  await refreshAllData();
});

function setupEventListeners() {
  // Brand Logo Click -> Return to Landing
  brandLogo.addEventListener('click', () => {
    showLandingPage();
  });

  // Landing Page CTA Buttons
  btnNavLogin.addEventListener('click', () => openSigninModal('Student'));
  btnCtaStudent.addEventListener('click', () => openSigninModal('Student'));
  btnCtaFaculty.addEventListener('click', () => openSigninModal('Faculty'));
  btnCtaAdmin.addEventListener('click', () => openSigninModal('Admin'));

  // Signin Modal controls
  btnCloseSignin.addEventListener('click', closeSigninModal);
  signinModal.addEventListener('click', (e) => {
    if (e.target === signinModal) closeSigninModal();
  });

  // Password visibility toggle
  btnTogglePwd.addEventListener('click', () => {
    const isPwd = signinPassword.type === 'password';
    signinPassword.type = isPwd ? 'text' : 'password';
  });

  // Role Pill Selection in Signin Modal
  rolePills.forEach(pill => {
    pill.addEventListener('click', () => {
      rolePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedSigninRole = pill.dataset.role;
      if (selectedSigninRole === 'Student') {
        signinEmail.value = 'STU-2024-001';
      } else if (selectedSigninRole === 'Faculty') {
        signinEmail.value = 'FAC-101';
      } else {
        signinEmail.value = 'ADM-001';
      }
    });
  });

  // Signin Form Submit
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = signinEmail.value.trim();
    if (!userId) return;
    await switchUser(userId);
    closeSigninModal();
    showPortalDashboard();

    // Direct user to relevant tab
    if (selectedSigninRole === 'Faculty') {
      switchTab('facultyTab');
    } else if (selectedSigninRole === 'Admin') {
      switchTab('auditTab');
    } else {
      switchTab('uploadTab');
    }
  });

  // Sign Out
  btnSignOut.addEventListener('click', () => {
    showLandingPage();
  });

  // Role dropdown switcher in top header
  roleSelect.addEventListener('change', async (e) => {
    await switchUser(e.target.value);
  });

  // Tab navigation
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Real-time input validation triggers
  documentTitleInput.addEventListener('input', () => {
    titleCharCount.textContent = `${documentTitleInput.value.length} / 255`;
    validateForm();
  });
  documentCategorySelect.addEventListener('change', validateForm);
  dateOfAchievementInput.addEventListener('input', validateForm);
  dateOfAchievementInput.addEventListener('change', validateForm);
  issuingOrganizationInput.addEventListener('input', validateForm);

  // File selection
  fileInput.addEventListener('change', handleFileSelect);

  // Drag & drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelect();
    }
  });

  btnRemoveFile.addEventListener('click', (e) => {
    e.stopPropagation();
    removeSelectedFile();
  });

  // Form submission (with double submission guard)
  uploadForm.addEventListener('submit', handleUploadSubmit);
  btnResetForm.addEventListener('click', resetForm);

  // Refresh buttons
  document.getElementById('btnRefreshDocs').addEventListener('click', loadDocuments);
  document.getElementById('btnRefreshFaculty').addEventListener('click', loadFacultyData);
  document.getElementById('btnRefreshAudit').addEventListener('click', loadAuditLogs);

  // Modal close handlers
  btnClosePreview.addEventListener('click', () => previewModal.classList.add('hidden'));
  btnClosePreviewBtn.addEventListener('click', () => previewModal.classList.add('hidden'));

  btnCloseReplace.addEventListener('click', () => replaceModal.classList.add('hidden'));
  btnCancelReplace.addEventListener('click', () => replaceModal.classList.add('hidden'));
  replaceForm.addEventListener('submit', handleReplaceSubmit);

  btnCloseSuccess.addEventListener('click', () => successModal.classList.add('hidden'));
  btnGoToDocs.addEventListener('click', () => {
    successModal.classList.add('hidden');
    switchTab('documentsTab');
  });

  // Setup US02 Faculty Review handlers
  setupFacultyReviewListeners();
}

// -------------------------------------------------------------
// View Switching Logic (Landing vs Signin vs Portal)
// -------------------------------------------------------------
function showLandingPage() {
  currentView = 'landing';
  landingView.classList.remove('hidden');
  portalDashboardView.classList.add('hidden');
  guestNavControls.classList.remove('hidden');
  authNavControls.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showPortalDashboard() {
  currentView = 'portal';
  landingView.classList.add('hidden');
  portalDashboardView.classList.remove('hidden');
  guestNavControls.classList.add('hidden');
  authNavControls.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openSigninModal(role = 'Student') {
  selectedSigninRole = role;
  rolePills.forEach(p => {
    if (p.dataset.role === role) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  if (role === 'Student') {
    signinEmail.value = 'STU-2024-001';
  } else if (role === 'Faculty') {
    signinEmail.value = 'FAC-101';
  } else {
    signinEmail.value = 'ADM-001';
  }

  signinModal.classList.remove('hidden');
}

function closeSigninModal() {
  signinModal.classList.add('hidden');
}

// -------------------------------------------------------------
// Validation Logic (US01 Acceptance Criteria)
// -------------------------------------------------------------
function validateForm() {
  let isAllValid = true;

  // 1. Title validation
  const title = documentTitleInput.value.trim();
  if (!documentTitleInput.value) {
    titleFeedback.textContent = '';
    updateCheckItem(checkTitle, false, '⚪ Title provided');
    isAllValid = false;
  } else if (title === '') {
    titleFeedback.textContent = 'Whitespace-only title is treated as empty.';
    updateCheckItem(checkTitle, false, '❌ Whitespace-only title rejected');
    isAllValid = false;
  } else if (title.length < 2) {
    titleFeedback.textContent = 'Title must be at least 2 characters.';
    updateCheckItem(checkTitle, false, '❌ Title too short');
    isAllValid = false;
  } else {
    titleFeedback.textContent = '';
    updateCheckItem(checkTitle, true, '✅ Document Title valid');
  }

  // 2. Category validation
  const category = documentCategorySelect.value;
  if (!category) {
    categoryFeedback.textContent = '';
    updateCheckItem(checkCategory, false, '⚪ Category selected');
    isAllValid = false;
  } else {
    categoryFeedback.textContent = '';
    updateCheckItem(checkCategory, true, `✅ Category: ${category}`);
  }

  // 3. Date validation
  const rawDate = dateOfAchievementInput.value;
  if (!rawDate) {
    dateFeedback.textContent = '';
    updateCheckItem(checkDate, false, '⚪ Valid past/present date');
    isAllValid = false;
  } else {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const selectedDate = new Date(rawDate);

    if (isNaN(selectedDate.getTime())) {
      dateFeedback.textContent = 'Invalid date format.';
      updateCheckItem(checkDate, false, '❌ Invalid date');
      isAllValid = false;
    } else if (selectedDate > today) {
      dateFeedback.textContent = 'Future achievement date is not allowed.';
      updateCheckItem(checkDate, false, '❌ Future date disallowed');
      isAllValid = false;
    } else {
      dateFeedback.textContent = '';
      updateCheckItem(checkDate, true, '✅ Achievement date valid');
    }
  }

  // 4. Issuing Organization validation
  const org = issuingOrganizationInput.value.trim();
  if (!issuingOrganizationInput.value) {
    orgFeedback.textContent = '';
    updateCheckItem(checkOrg, false, '⚪ Issuing organization');
    isAllValid = false;
  } else if (org === '') {
    orgFeedback.textContent = 'Organization cannot be whitespace only.';
    updateCheckItem(checkOrg, false, '❌ Organization required');
    isAllValid = false;
  } else if (org.length < 2) {
    orgFeedback.textContent = 'Organization name must be at least 2 characters.';
    updateCheckItem(checkOrg, false, '❌ Organization too short');
    isAllValid = false;
  } else {
    orgFeedback.textContent = '';
    updateCheckItem(checkOrg, true, '✅ Organization valid');
  }

  // 5. File validation
  if (!selectedFile) {
    fileFeedback.textContent = '';
    updateCheckItem(checkFile, false, '⚪ Valid file (PDF/JPG/PNG ≤ 10 MB)');
    isAllValid = false;
  } else {
    const ext = '.' + selectedFile.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      fileFeedback.textContent = `Unsupported file type (${ext}). Only PDF, JPG, JPEG, and PNG files are allowed.`;
      updateCheckItem(checkFile, false, `❌ Unsupported file format (${ext})`);
      isAllValid = false;
    } else if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
      fileFeedback.textContent = `File size (${sizeMB} MB) exceeds maximum allowed limit of 10 MB.`;
      updateCheckItem(checkFile, false, `❌ Exceeds 10 MB (${sizeMB} MB)`);
      isAllValid = false;
    } else if (selectedFile.size === 0) {
      fileFeedback.textContent = 'Selected file is empty.';
      updateCheckItem(checkFile, false, '❌ Empty file');
      isAllValid = false;
    } else {
      fileFeedback.textContent = '';
      updateCheckItem(checkFile, true, `✅ File ready (${formatBytes(selectedFile.size)})`);
    }
  }

  // Enable / Disable button based on complete validation
  btnUpload.disabled = !isAllValid || isSubmitting;
  return isAllValid;
}

function updateCheckItem(element, isValid, text) {
  element.textContent = text;
  element.className = 'check-item ' + (isValid ? 'valid' : 'invalid');
}

// -------------------------------------------------------------
// File Selection & Drag-and-Drop
// -------------------------------------------------------------
function handleFileSelect() {
  if (fileInput.files && fileInput.files[0]) {
    selectedFile = fileInput.files[0];
    dropzoneContent.classList.add('hidden');
    filePreviewPill.classList.remove('hidden');

    previewFileName.textContent = selectedFile.name;
    previewFileSize.textContent = formatBytes(selectedFile.size);

    const ext = selectedFile.name.split('.').pop().toLowerCase();
    const iconEl = document.getElementById('filePreviewIcon');
    if (ext === 'pdf') {
      iconEl.textContent = '📕';
    } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
      iconEl.textContent = '🖼️';
    } else {
      iconEl.textContent = '⚠️';
    }
  } else {
    removeSelectedFile();
  }
  validateForm();
}

function removeSelectedFile() {
  selectedFile = null;
  fileInput.value = '';
  dropzoneContent.classList.remove('hidden');
  filePreviewPill.classList.add('hidden');
  validateForm();
}

function resetForm() {
  uploadForm.reset();
  removeSelectedFile();
  titleCharCount.textContent = '0 / 255';
  titleFeedback.textContent = '';
  categoryFeedback.textContent = '';
  dateFeedback.textContent = '';
  orgFeedback.textContent = '';
  fileFeedback.textContent = '';
  validateForm();
}

// -------------------------------------------------------------
// Form Submission & Double-Click Guard
// -------------------------------------------------------------
async function handleUploadSubmit(e) {
  e.preventDefault();

  // Prevent double submission
  if (isSubmitting) return;

  if (!validateForm()) {
    showAlert('Please complete all mandatory fields correctly before uploading.', 'danger');
    return;
  }

  // Set submitting state
  isSubmitting = true;
  btnUpload.disabled = true;
  uploadSpinner.classList.remove('hidden');
  uploadBtnText.textContent = 'Uploading & Securing...';

  const formData = new FormData();
  formData.append('title', documentTitleInput.value.trim());
  formData.append('category', documentCategorySelect.value);
  formData.append('dateOfAchievement', dateOfAchievementInput.value);
  formData.append('issuingOrganization', issuingOrganizationInput.value.trim());
  formData.append('file', selectedFile);

  try {
    const res = await fetch('/api/documents', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      let errMsg = data.message || 'Upload failed.';
      if (data.errors) {
        errMsg += ' ' + Object.values(data.errors).join('; ');
      }
      throw new Error(errMsg);
    }

    // Success! Show confirmation modal and reset form
    showSuccessConfirmation(data.document);
    resetForm();
    await refreshAllData();
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    isSubmitting = false;
    uploadSpinner.classList.add('hidden');
    uploadBtnText.textContent = 'Upload Document';
    validateForm();
  }
}

function showSuccessConfirmation(doc) {
  const formattedDate = new Date(doc.createdAt).toLocaleString();
  successModalBody.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <p>Your document has been securely stored in the private repository and submitted for advisor review.</p>
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px;">
        <p><strong>Title:</strong> ${escapeHtml(doc.title)}</p>
        <p><strong>Category:</strong> ${escapeHtml(doc.category)}</p>
        <p><strong>Status:</strong> <span class="status-badge status-pending">⏳ ${escapeHtml(doc.status)}</span></p>
        <p><strong>Issuing Organization:</strong> ${escapeHtml(doc.issuingOrganization)}</p>
        <p><strong>Recorded Timestamp:</strong> ${formattedDate}</p>
        <p><strong>Assigned Advisor Notified:</strong> ${escapeHtml(currentUser.assignedFacultyAdvisorName || 'Faculty Advisor')}</p>
      </div>
    </div>
  `;
  successModal.classList.remove('hidden');
}

// -------------------------------------------------------------
// Document List & Actions (View, Download, Replace)
// -------------------------------------------------------------
async function loadDocuments() {
  try {
    const res = await fetch('/api/documents');
    const data = await res.json();

    if (!res.ok) throw new Error(data.message || 'Failed to load documents');

    const docs = data.documents || [];
    myDocsCountBadge.textContent = docs.length;

    if (docs.length === 0) {
      documentsTableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="7">No documents uploaded yet. Use the "Upload Document" tab to submit your first certificate.</td>
        </tr>
      `;
      return;
    }

    documentsTableBody.innerHTML = docs.map(doc => {
      const uploadTime = new Date(doc.createdAt).toLocaleString();
      const statusClass = doc.status === 'Pending Approval' ? 'status-pending' : (doc.status === 'Approved' ? 'status-approved' : 'status-rejected');
      const isPending = doc.status === 'Pending Approval';

      return `
        <tr data-id="${doc.id}">
          <td>
            <strong>${escapeHtml(doc.title)}</strong>
            <div style="font-size:0.75rem; color:#64748b;">${escapeHtml(doc.originalFilename)} (${formatBytes(doc.fileSize)})</div>
          </td>
          <td><span class="badge">${escapeHtml(doc.category)}</span></td>
          <td>${escapeHtml(doc.dateOfAchievement)}</td>
          <td>${escapeHtml(doc.issuingOrganization)}</td>
          <td><span class="status-badge ${statusClass}">⏳ ${escapeHtml(doc.status)}</span></td>
          <td>${uploadTime}</td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn-action" onclick="viewDocument('${doc.id}', '${escapeHtml(doc.title)}', '${doc.mimeType}')" title="Preview document inline">
                👁️ View
              </button>
              <a href="/api/documents/${doc.id}/download" class="btn-action" download title="Download file">
                ⬇️ Download
              </a>
              ${isPending ? `
                <button class="btn-action" onclick="openReplaceModal('${doc.id}')" title="Replace document or update details">
                  🔄 Replace
                </button>
              ` : `
                <span style="font-size:0.75rem; color:#94a3b8;">Locked</span>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Inline View / Preview Document
window.viewDocument = function(id, title, mimeType) {
  document.getElementById('previewModalTitle').textContent = `Preview: ${title}`;
  btnDownloadPreview.href = `/api/documents/${id}/download`;

  previewModalBody.innerHTML = '<div class="preview-loading">Loading preview...</div>';
  previewModal.classList.remove('hidden');

  const viewUrl = `/api/documents/${id}/view`;
  if (mimeType === 'application/pdf') {
    previewModalBody.innerHTML = `
      <iframe src="${viewUrl}" style="width:100%; height:65vh; border:none; border-radius:6px;"></iframe>
    `;
  } else {
    previewModalBody.innerHTML = `
      <div style="display:flex; justify-content:center; align-items:center; min-height:400px; background:#0f172a10; border-radius:6px; padding:16px;">
        <img src="${viewUrl}" alt="${escapeHtml(title)}" style="max-width:100%; max-height:65vh; object-fit:contain; border-radius:4px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
      </div>
    `;
  }
};

// Open Replace Modal
window.openReplaceModal = async function(id) {
  try {
    const res = await fetch(`/api/documents/${id}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Cannot fetch document');

    const doc = data.document;
    document.getElementById('replaceDocId').value = doc.id;
    document.getElementById('replaceTitle').value = doc.title;
    document.getElementById('replaceCategory').value = doc.category;
    document.getElementById('replaceDate').value = doc.dateOfAchievement;
    document.getElementById('replaceOrg').value = doc.issuingOrganization;
    document.getElementById('replaceFileInput').value = '';
    document.getElementById('replaceFileFeedback').textContent = '';

    replaceModal.classList.remove('hidden');
  } catch (err) {
    showAlert(err.message, 'danger');
  }
};

// Handle Replace Submit
async function handleReplaceSubmit(e) {
  e.preventDefault();
  const docId = document.getElementById('replaceDocId').value;
  const title = document.getElementById('replaceTitle').value.trim();
  const category = document.getElementById('replaceCategory').value;
  const dateOfAchievement = document.getElementById('replaceDate').value;
  const issuingOrganization = document.getElementById('replaceOrg').value.trim();
  const fileInputEl = document.getElementById('replaceFileInput');

  if (!title || !category || !dateOfAchievement || !issuingOrganization) {
    showAlert('All required fields must be completed.', 'danger');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('category', category);
  formData.append('dateOfAchievement', dateOfAchievement);
  formData.append('issuingOrganization', issuingOrganization);

  if (fileInputEl.files && fileInputEl.files[0]) {
    const file = fileInputEl.files[0];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      document.getElementById('replaceFileFeedback').textContent = 'Invalid file type. Only PDF, JPG, JPEG, and PNG allowed.';
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      document.getElementById('replaceFileFeedback').textContent = 'File exceeds 10 MB limit.';
      return;
    }
    formData.append('file', file);
  }

  try {
    const res = await fetch(`/api/documents/${docId}/replace`, {
      method: 'PUT',
      body: formData
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Replacement failed');

    showAlert('Document successfully replaced and updated.', 'success');
    replaceModal.classList.add('hidden');
    await refreshAllData();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// Faculty Advisor View & Verification Operations (US02)
// -------------------------------------------------------------
let pendingDecisionData = null;
let isReviewingDecision = false;

// Filter and search elements
const facultySearchInput = document.getElementById('facultySearchInput');
const facultyCategoryFilter = document.getElementById('facultyCategoryFilter');
const facultyStatusFilter = document.getElementById('facultyStatusFilter');
const facultyStartDate = document.getElementById('facultyStartDate');
const facultyEndDate = document.getElementById('facultyEndDate');
const btnClearFacultyFilters = document.getElementById('btnClearFacultyFilters');

// Review panel elements
const facultyReviewModal = document.getElementById('facultyReviewModal');
const btnCloseFacultyReview = document.getElementById('btnCloseFacultyReview');
const btnBackFromReview = document.getElementById('btnBackFromReview');
const btnApproveDocument = document.getElementById('btnApproveDocument');
const btnRejectDocument = document.getElementById('btnRejectDocument');
const reviewCommentInput = document.getElementById('reviewCommentInput');
const reviewCommentFeedback = document.getElementById('reviewCommentFeedback');
const reviewFilePreview = document.getElementById('reviewFilePreview');
const reviewDownloadLink = document.getElementById('reviewDownloadLink');

// Decision confirmation elements
const decisionConfirmModal = document.getElementById('decisionConfirmModal');
const btnCloseConfirm = document.getElementById('btnCloseConfirm');
const btnCancelConfirm = document.getElementById('btnCancelConfirm');
const btnExecuteDecision = document.getElementById('btnExecuteDecision');
const decisionConfirmText = document.getElementById('decisionConfirmText');
const decisionConfirmCommentSummary = document.getElementById('decisionConfirmCommentSummary');

function setupFacultyReviewListeners() {
  if (facultySearchInput) {
    let debounceTimer;
    facultySearchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadFacultyData, 300);
    });
  }

  if (facultyCategoryFilter) facultyCategoryFilter.addEventListener('change', loadFacultyData);
  if (facultyStatusFilter) facultyStatusFilter.addEventListener('change', loadFacultyData);
  if (facultyStartDate) facultyStartDate.addEventListener('change', loadFacultyData);
  if (facultyEndDate) facultyEndDate.addEventListener('change', loadFacultyData);

  if (btnClearFacultyFilters) {
    btnClearFacultyFilters.addEventListener('click', () => {
      if (facultySearchInput) facultySearchInput.value = '';
      if (facultyCategoryFilter) facultyCategoryFilter.value = 'ALL';
      if (facultyStatusFilter) facultyStatusFilter.value = 'Pending Approval';
      if (facultyStartDate) facultyStartDate.value = '';
      if (facultyEndDate) facultyEndDate.value = '';
      loadFacultyData();
    });
  }

  if (btnCloseFacultyReview) {
    btnCloseFacultyReview.addEventListener('click', () => facultyReviewModal.classList.add('hidden'));
  }
  if (btnBackFromReview) {
    btnBackFromReview.addEventListener('click', () => facultyReviewModal.classList.add('hidden'));
  }

  // Approve Document Button Click -> Open Confirmation
  if (btnApproveDocument) {
    btnApproveDocument.addEventListener('click', () => {
      const docId = document.getElementById('reviewDocId').value;
      const comment = reviewCommentInput.value.trim();
      reviewCommentFeedback.textContent = '';
      promptDecisionConfirmation('Approve', docId, comment);
    });
  }

  // Reject Document Button Click -> Validate Comment & Open Confirmation
  if (btnRejectDocument) {
    btnRejectDocument.addEventListener('click', () => {
      const docId = document.getElementById('reviewDocId').value;
      const comment = reviewCommentInput.value.trim();

      if (!comment) {
        reviewCommentFeedback.textContent = 'A rejection reason is required before rejecting a submission.';
        reviewCommentInput.focus();
        return;
      }

      reviewCommentFeedback.textContent = '';
      promptDecisionConfirmation('Reject', docId, comment);
    });
  }

  // Confirmation Modal actions
  if (btnCloseConfirm) {
    btnCloseConfirm.addEventListener('click', () => {
      decisionConfirmModal.classList.add('hidden');
      pendingDecisionData = null;
    });
  }
  if (btnCancelConfirm) {
    btnCancelConfirm.addEventListener('click', () => {
      decisionConfirmModal.classList.add('hidden');
      pendingDecisionData = null;
    });
  }
  if (btnExecuteDecision) {
    btnExecuteDecision.addEventListener('click', handleExecuteDecision);
  }
}

function promptDecisionConfirmation(decision, docId, comment) {
  pendingDecisionData = { decision, docId, comment };
  decisionConfirmText.textContent = `Are you sure you want to mark this document as "${decision}"?`;
  decisionConfirmCommentSummary.innerHTML = `<strong>Decision:</strong> <span class="badge ${decision === 'Approve' ? 'badge-primary' : ''}">${decision}</span><br><strong>Comment:</strong> ${comment ? escapeHtml(comment) : '<em>None</em>'}`;
  decisionConfirmModal.classList.remove('hidden');
}

async function handleExecuteDecision() {
  if (!pendingDecisionData || isReviewingDecision) return;

  const { decision, docId, comment } = pendingDecisionData;
  isReviewingDecision = true;
  btnExecuteDecision.disabled = true;

  try {
    const res = await fetch(`/api/documents/${docId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comment })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Review submission failed');
    }

    showAlert(`Document successfully marked as ${decision}.`, 'success');
    decisionConfirmModal.classList.add('hidden');
    facultyReviewModal.classList.add('hidden');
    pendingDecisionData = null;

    // Refresh review queue, notifications and documents list immediately
    await refreshAllData();
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    isReviewingDecision = false;
    btnExecuteDecision.disabled = false;
  }
}

// Open Document Review Panel (TC_09)
window.openReviewPanel = async function(id) {
  try {
    const res = await fetch(`/api/faculty/documents/${id}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Cannot load document for review');
    }

    const doc = data.document;
    const history = data.history || [];

    document.getElementById('reviewDocId').value = doc.id;
    document.getElementById('reviewStudentName').textContent = doc.studentName || 'Student';
    document.getElementById('reviewRegNumber').textContent = doc.registrationNumber || doc.studentId;
    document.getElementById('reviewDocTitle').textContent = doc.title;
    document.getElementById('reviewCategory').textContent = doc.category;
    document.getElementById('reviewOrg').textContent = doc.issuingOrganization;
    document.getElementById('reviewUploadDate').textContent = new Date(doc.createdAt).toLocaleString();

    const statusBadge = document.getElementById('reviewCurrentStatus');
    statusBadge.textContent = doc.status;
    statusBadge.className = `status-badge ${doc.status === 'Pending Approval' ? 'status-pending' : (doc.status === 'Approved' ? 'status-approved' : 'status-rejected')}`;

    // Reset decision fields
    reviewCommentInput.value = '';
    reviewCommentFeedback.textContent = '';

    // Show/hide action buttons if already reviewed
    const isPending = doc.status === 'Pending Approval';
    btnApproveDocument.style.display = isPending ? 'inline-flex' : 'none';
    btnRejectDocument.style.display = isPending ? 'inline-flex' : 'none';
    reviewCommentInput.disabled = !isPending;

    // Set download link
    reviewDownloadLink.href = `/api/documents/${doc.id}/download`;

    // Render Preview Box
    renderReviewPreview(doc);

    // Render Review History (TC_39)
    renderReviewHistory(history);

    facultyReviewModal.classList.remove('hidden');
  } catch (err) {
    showAlert(err.message, 'danger');
  }
};

function renderReviewPreview(doc) {
  const previewUrl = `/api/documents/${doc.id}/preview`;

  if (doc.fileAvailable === false) {
    reviewFilePreview.innerHTML = `
      <div style="text-align:center; padding:32px; color:#b91c1c;">
        <p style="font-size:2rem; margin-bottom:8px;">⚠️</p>
        <strong>Document file is currently unavailable in storage.</strong>
        <p style="font-size:0.85rem; color:#64748b;">The document record exists but the binary attachment cannot be loaded.</p>
      </div>
    `;
    return;
  }

  if (doc.mimeType === 'application/pdf') {
    reviewFilePreview.innerHTML = `
      <iframe src="${previewUrl}" title="PDF Preview"></iframe>
    `;
  } else {
    reviewFilePreview.innerHTML = `
      <img src="${previewUrl}" alt="${escapeHtml(doc.title)}" onerror="this.parentElement.innerHTML='<p style=\'padding:20px; color:#b91c1c;\'>Image file unavailable</p>'">
    `;
  }
}

function renderReviewHistory(history) {
  const listEl = document.getElementById('reviewHistoryList');
  if (!history || history.length === 0) {
    listEl.innerHTML = '<p class="field-hint">No prior decisions recorded for this submission.</p>';
    return;
  }

  listEl.innerHTML = history.map(h => `
    <div class="review-history-item">
      <div class="flex-between">
        <strong>${escapeHtml(h.reviewerName)} (${escapeHtml(h.reviewerRole)})</strong>
        <span class="status-badge ${h.action === 'Approved' ? 'status-approved' : 'status-rejected'}">${escapeHtml(h.action)}</span>
      </div>
      <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${new Date(h.timestamp).toLocaleString()}</div>
      ${h.comments ? `<div style="margin-top:6px; background:#fff; padding:6px 10px; border-radius:6px; border:1px solid #e2e8f0;">${escapeHtml(h.comments)}</div>` : ''}
    </div>
  `).join('');
}

async function loadFacultyData() {
  try {
    // 1. Notifications for Faculty
    const notifRes = await fetch('/api/notifications');
    const notifData = await notifRes.json();
    const notifications = notifData.notifications || [];
    facultyNotifCountBadge.textContent = notifications.length;

    if (notifications.length === 0) {
      notificationsList.innerHTML = '<p class="empty-state">No notifications received yet.</p>';
    } else {
      notificationsList.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.read ? '' : 'unread'}">
          <div>
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-message">${escapeHtml(n.message)}</div>
          </div>
          <div class="notif-time">${new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      `).join('');
    }

    // 2. Assigned Submissions (with search and filters)
    let queryParams = new URLSearchParams();
    const searchVal = facultySearchInput ? facultySearchInput.value.trim() : '';
    const categoryVal = facultyCategoryFilter ? facultyCategoryFilter.value : 'ALL';
    const statusVal = facultyStatusFilter ? facultyStatusFilter.value : 'Pending Approval';
    const startDateVal = facultyStartDate ? facultyStartDate.value : '';
    const endDateVal = facultyEndDate ? facultyEndDate.value : '';

    if (searchVal) queryParams.set('search', searchVal);
    if (categoryVal) queryParams.set('category', categoryVal);
    if (statusVal) queryParams.set('status', statusVal);
    if (startDateVal) queryParams.set('startDate', startDateVal);
    if (endDateVal) queryParams.set('endDate', endDateVal);

    const docsRes = await fetch(`/api/faculty/documents?${queryParams.toString()}`);
    const docsData = await docsRes.json();
    const docs = docsData.documents || [];

    if (docs.length === 0) {
      facultyDocsTableBody.innerHTML = '<tr class="empty-row"><td colspan="7">No student submissions matching the filter criteria.</td></tr>';
    } else {
      facultyDocsTableBody.innerHTML = docs.map(d => {
        const statusClass = d.status === 'Pending Approval' ? 'status-pending' : (d.status === 'Approved' ? 'status-approved' : 'status-rejected');
        return `
          <tr>
            <td><strong>${escapeHtml(d.studentName || d.studentId)}</strong></td>
            <td><code>${escapeHtml(d.registrationNumber || d.studentId)}</code></td>
            <td>
              <strong>${escapeHtml(d.title)}</strong>
              <div style="font-size:0.75rem; color:#64748b;">${escapeHtml(d.issuingOrganization || '')}</div>
            </td>
            <td><span class="badge">${escapeHtml(d.category)}</span></td>
            <td>${new Date(d.createdAt).toLocaleString()}</td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(d.status)}</span></td>
            <td>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn-action" onclick="openReviewPanel('${d.id}')" title="Review submission">
                  📋 Review
                </button>
                <button class="btn-action" onclick="viewDocument('${d.id}', '${escapeHtml(d.title)}', '${d.mimeType}')" title="Preview file">
                  👁️ Preview
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Failed to load faculty data:', err);
  }
}

// -------------------------------------------------------------
// System Audit Logs
// -------------------------------------------------------------
async function loadAuditLogs() {
  try {
    const res = await fetch('/api/audit-logs');
    const data = await res.json();
    const logs = data.logs || [];

    if (logs.length === 0) {
      auditTableBody.innerHTML = '<tr class="empty-row"><td colspan="6">No audit records logged yet.</td></tr>';
      return;
    }

    auditTableBody.innerHTML = logs.map(l => `
      <tr>
        <td style="white-space:nowrap;">${new Date(l.timestamp).toLocaleString()}</td>
        <td><code>${escapeHtml(l.action)}</code></td>
        <td>${escapeHtml(l.actorId)}</td>
        <td><span class="badge">${escapeHtml(l.actorRole)}</span></td>
        <td><small>${escapeHtml(l.targetId || '-')}</small></td>
        <td><pre style="margin:0; font-size:0.75rem; max-width:300px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(JSON.stringify(l.details))}</pre></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load audit logs:', err);
  }
}

// -------------------------------------------------------------
// User / Persona Management
// -------------------------------------------------------------
async function loadCurrentUser() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      renderCurrentUser();
    }
  } catch (err) {
    console.error('Failed loading user:', err);
  }
}

async function switchUser(userId) {
  try {
    const res = await fetch('/api/auth/switch-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      renderCurrentUser();
      showAlert(`Switched to: ${currentUser.name} (${currentUser.role})`, 'success');
      await refreshAllData();
    }
  } catch (err) {
    showAlert('Error switching user: ' + err.message, 'danger');
  }
}

function renderCurrentUser() {
  if (!currentUser) return;
  userNameEl.textContent = currentUser.name;
  userRoleEl.textContent = `${currentUser.role} (${currentUser.id})`;
  const initials = currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  userAvatarEl.textContent = initials;
  roleSelect.value = currentUser.id;

  if (currentUser.role === 'Student') {
    advisorBanner.classList.remove('hidden');
    assignedAdvisorName.textContent = currentUser.assignedFacultyAdvisorName || 'Dr. Robert Smith';
  } else {
    advisorBanner.classList.add('hidden');
  }
}

// -------------------------------------------------------------
// Utilities & Helpers
// -------------------------------------------------------------
function switchTab(tabId) {
  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });
  tabButtons.forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  if (tabId === 'documentsTab') loadDocuments();
  if (tabId === 'facultyTab') loadFacultyData();
  if (tabId === 'auditTab') loadAuditLogs();
}

async function refreshAllData() {
  await Promise.all([loadDocuments(), loadFacultyData(), loadAuditLogs()]);
}

function showAlert(message, type = 'danger') {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" class="btn-remove-file" style="font-size:1.2rem;" onclick="this.parentElement.remove()">&times;</button>
  `;
  alertContainer.appendChild(alert);
  setTimeout(() => alert.remove(), 6000);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
