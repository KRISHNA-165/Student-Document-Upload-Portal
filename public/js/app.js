// Client-side Application for AcademiaFlow Portal (US01)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

// State
let currentUser = null;
let authToken = sessionStorage.getItem('af_token') || null;
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

  // Signin Form Submit (US06: Validate registered credentials, error message on failure)
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const signinAlert = document.getElementById('signinAlert');
    if (signinAlert) signinAlert.classList.add('hidden');

    const identifier = signinEmail.value.trim();
    const password = signinPassword.value.trim();

    if (!identifier || !password) {
      if (signinAlert) {
        signinAlert.textContent = 'Please enter both username/email and password';
        signinAlert.classList.remove('hidden');
      }
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, role: selectedSigninRole })
      });
      const data = await res.json();

      if (!res.ok) {
        if (signinAlert) {
          signinAlert.textContent = data.message || 'Invalid username/email or password';
          signinAlert.classList.remove('hidden');
        }
        return;
      }

      authToken = data.token;
      sessionStorage.setItem('af_token', authToken);
      currentUser = data.user;
      closeSigninModal();
      showPortalDashboard();
      renderCurrentUser();

      // Direct student to Dashboard (TC_01)
      if (currentUser.role === 'Faculty') {
        switchTab('facultyTab');
      } else if (currentUser.role === 'Admin') {
        switchTab('auditTab');
      } else {
        switchTab('dashboardTab');
      }

      showAlert(`Welcome back, ${currentUser.name}!`, 'success');
      await refreshAllData();
    } catch (err) {
      if (signinAlert) {
        signinAlert.textContent = 'Network error during sign in. Please try again.';
        signinAlert.classList.remove('hidden');
      }
    }
  });

  // Sign Out (US06: Terminate active session)
  btnSignOut.addEventListener('click', async () => {
    try {
      if (authToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      }
    } catch (err) {
      console.warn('Logout warning:', err.message);
    }
    authToken = null;
    currentUser = null;
    sessionStorage.removeItem('af_token');
    showLandingPage();
    showAlert('You have been logged out securely.', 'info');
  });

  // Role dropdown switcher in top header
  roleSelect.addEventListener('change', async (e) => {
    await switchUser(e.target.value);
  });

  // Quick Action buttons on Student Dashboard (TC_16, TC_17, TC_18)
  const btnQuickUpload = document.getElementById('btnQuickUpload');
  if (btnQuickUpload) btnQuickUpload.addEventListener('click', () => switchTab('uploadTab'));

  const btnQuickMyDocs = document.getElementById('btnQuickMyDocs');
  if (btnQuickMyDocs) btnQuickMyDocs.addEventListener('click', () => switchTab('documentsTab'));

  const btnQuickNotifs = document.getElementById('btnQuickNotifs');
  if (btnQuickNotifs) btnQuickNotifs.addEventListener('click', () => switchTab('notificationsTab'));

  const btnViewAllDocs = document.getElementById('btnViewAllDocs');
  if (btnViewAllDocs) btnViewAllDocs.addEventListener('click', () => switchTab('documentsTab'));

  const btnEmptyUpload = document.getElementById('btnEmptyUpload');
  if (btnEmptyUpload) btnEmptyUpload.addEventListener('click', () => switchTab('uploadTab'));

  const btnRefreshDashboard = document.getElementById('btnRefreshDashboard');
  if (btnRefreshDashboard) btnRefreshDashboard.addEventListener('click', loadStudentDashboard);

  const btnRetryDashboard = document.getElementById('btnRetryDashboard');
  if (btnRetryDashboard) btnRetryDashboard.addEventListener('click', loadStudentDashboard);

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

  // Reports & Analytics Controls (US09)
  const btnRefreshReport = document.getElementById('btnRefreshReport');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnResetReportFilters = document.getElementById('btnResetReportFilters');
  const btnEmptyResetReport = document.getElementById('btnEmptyResetReport');
  const btnRetryReport = document.getElementById('btnRetryReport');
  const reportCategoryFilter = document.getElementById('reportCategoryFilter');
  const reportStatusFilter = document.getElementById('reportStatusFilter');
  const reportStartDate = document.getElementById('reportStartDate');
  const reportEndDate = document.getElementById('reportEndDate');

  if (btnRefreshReport) btnRefreshReport.addEventListener('click', loadReportsData);
  if (btnExportCSV) btnExportCSV.addEventListener('click', () => exportReport('csv'));
  if (btnExportExcel) btnExportExcel.addEventListener('click', () => exportReport('excel'));
  if (reportCategoryFilter) reportCategoryFilter.addEventListener('change', loadReportsData);
  if (reportStatusFilter) reportStatusFilter.addEventListener('change', loadReportsData);
  if (reportStartDate) reportStartDate.addEventListener('change', loadReportsData);
  if (reportEndDate) reportEndDate.addEventListener('change', loadReportsData);

  function resetReportFilters() {
    if (reportStartDate) reportStartDate.value = '';
    if (reportEndDate) reportEndDate.value = '';
    if (reportCategoryFilter) reportCategoryFilter.value = 'ALL';
    if (reportStatusFilter) reportStatusFilter.value = 'ALL';
    const dateErrorEl = document.getElementById('reportDateError');
    if (dateErrorEl) dateErrorEl.classList.add('hidden');
    loadReportsData();
  }
  if (btnResetReportFilters) btnResetReportFilters.addEventListener('click', resetReportFilters);
  if (btnEmptyResetReport) btnEmptyResetReport.addEventListener('click', resetReportFilters);
  if (btnRetryReport) btnRetryReport.addEventListener('click', loadReportsData);

  // Student Document Filters (US08: TC_01 - TC_40)
  const studentSearchInput = document.getElementById('studentSearchInput');
  const studentCategoryFilter = document.getElementById('studentCategoryFilter');
  const studentStatusFilter = document.getElementById('studentStatusFilter');
  const studentStartDate = document.getElementById('studentStartDate');
  const studentEndDate = document.getElementById('studentEndDate');
  const studentSortFilter = document.getElementById('studentSortFilter');
  const btnClearStudentFilters = document.getElementById('btnClearStudentFilters');
  const btnResetNoResults = document.getElementById('btnResetNoResults');
  const btnEmptyUploadDocs = document.getElementById('btnEmptyUploadDocs');
  const btnRetryStudentSearch = document.getElementById('btnRetryStudentSearch');
  const btnStudentPrevPage = document.getElementById('btnStudentPrevPage');
  const btnStudentNextPage = document.getElementById('btnStudentNextPage');

  let studentDebounceTimer;
  if (studentSearchInput) {
    studentSearchInput.addEventListener('input', () => {
      clearTimeout(studentDebounceTimer);
      studentDebounceTimer = setTimeout(() => loadDocuments(1), 250);
    });
  }
  if (studentCategoryFilter) studentCategoryFilter.addEventListener('change', () => loadDocuments(1));
  if (studentStatusFilter) studentStatusFilter.addEventListener('change', () => loadDocuments(1));
  if (studentStartDate) studentStartDate.addEventListener('change', () => loadDocuments(1));
  if (studentEndDate) studentEndDate.addEventListener('change', () => loadDocuments(1));
  if (studentSortFilter) studentSortFilter.addEventListener('change', () => loadDocuments(1));

  function resetAllStudentFilters() {
    if (studentSearchInput) studentSearchInput.value = '';
    if (studentCategoryFilter) studentCategoryFilter.value = 'All';
    if (studentStatusFilter) studentStatusFilter.value = 'All';
    if (studentStartDate) studentStartDate.value = '';
    if (studentEndDate) studentEndDate.value = '';
    if (studentSortFilter) studentSortFilter.value = 'newest';
    const dateErrorEl = document.getElementById('studentDateError');
    if (dateErrorEl) dateErrorEl.classList.add('hidden');
    loadDocuments(1);
  }

  if (btnClearStudentFilters) btnClearStudentFilters.addEventListener('click', resetAllStudentFilters);
  if (btnResetNoResults) btnResetNoResults.addEventListener('click', resetAllStudentFilters);
  if (btnEmptyUploadDocs) btnEmptyUploadDocs.addEventListener('click', () => switchTab('uploadTab'));
  if (btnRetryStudentSearch) btnRetryStudentSearch.addEventListener('click', () => loadDocuments(studentCurrentPage));

  if (btnStudentPrevPage) {
    btnStudentPrevPage.addEventListener('click', () => {
      if (studentCurrentPage > 1) loadDocuments(studentCurrentPage - 1);
    });
  }
  if (btnStudentNextPage) {
    btnStudentNextPage.addEventListener('click', () => {
      if (studentCurrentPage < studentTotalPages) loadDocuments(studentCurrentPage + 1);
    });
  }

  // Student Notifications Filters & Actions (US05 / TC_01 - TC_40)
  const btnRefreshNotifs = document.getElementById('btnRefreshNotifs');
  const btnMarkAllNotifsRead = document.getElementById('btnMarkAllNotifsRead');
  const notifSearchInput = document.getElementById('notifSearchInput');
  const notifTypeFilter = document.getElementById('notifTypeFilter');
  const btnClearNotifFilters = document.getElementById('btnClearNotifFilters');

  if (btnRefreshNotifs) btnRefreshNotifs.addEventListener('click', loadStudentNotifications);
  if (btnMarkAllNotifsRead) btnMarkAllNotifsRead.addEventListener('click', markAllStudentNotifsRead);
  if (notifSearchInput) notifSearchInput.addEventListener('input', loadStudentNotifications);
  if (notifTypeFilter) notifTypeFilter.addEventListener('change', loadStudentNotifications);
  if (btnClearNotifFilters) {
    btnClearNotifFilters.addEventListener('click', () => {
      if (notifSearchInput) notifSearchInput.value = '';
      if (notifTypeFilter) notifTypeFilter.value = 'All';
      loadStudentNotifications();
    });
  }

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

  // Setup US07 Admin User Management handlers
  setupAdminUserListeners();
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
// Document List & Actions (View, Download, Replace) - US08
// -------------------------------------------------------------
let studentCurrentPage = 1;
let studentTotalPages = 1;

async function loadDocuments(page = 1) {
  if (typeof page === 'number') studentCurrentPage = page;
  try {
    const searchEl = document.getElementById('studentSearchInput');
    const categoryEl = document.getElementById('studentCategoryFilter');
    const statusEl = document.getElementById('studentStatusFilter');
    const startEl = document.getElementById('studentStartDate');
    const endEl = document.getElementById('studentEndDate');
    const sortEl = document.getElementById('studentSortFilter');
    const dateErrorEl = document.getElementById('studentDateError');
    const loadingEl = document.getElementById('studentSearchLoading');
    const errorEl = document.getElementById('studentSearchError');
    const visibleCountEl = document.getElementById('studentVisibleCount');
    const totalCountEl = document.getElementById('studentTotalCount');
    const activeBadgeEl = document.getElementById('studentActiveFiltersBadge');
    const emptyDocsState = document.getElementById('studentEmptyDocsState');
    const noResultsState = document.getElementById('studentNoResultsState');
    const tableWrapper = document.getElementById('studentTableWrapper');
    const pageInfo = document.getElementById('studentPageInfo');
    const prevBtn = document.getElementById('btnStudentPrevPage');
    const nextBtn = document.getElementById('btnStudentNextPage');

    if (errorEl) errorEl.classList.add('hidden');

    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';

    // Date range validation (TC_15)
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      if (dateErrorEl) dateErrorEl.classList.remove('hidden');
      return;
    } else {
      if (dateErrorEl) dateErrorEl.classList.add('hidden');
    }

    if (loadingEl) loadingEl.classList.remove('hidden');

    const params = new URLSearchParams();
    const searchVal = searchEl ? searchEl.value.trim() : '';
    const categoryVal = categoryEl ? categoryEl.value : 'All';
    const statusVal = statusEl ? statusEl.value : 'All';
    const sortVal = sortEl ? sortEl.value : 'newest';

    const hasActiveFilters = Boolean(
      searchVal ||
      (categoryVal && categoryVal !== 'All') ||
      (statusVal && statusVal !== 'All') ||
      startDate ||
      endDate
    );

    if (activeBadgeEl) {
      if (hasActiveFilters) activeBadgeEl.classList.remove('hidden');
      else activeBadgeEl.classList.add('hidden');
    }

    if (searchVal) params.set('search', searchVal);
    if (categoryVal && categoryVal !== 'All') params.set('category', categoryVal);
    if (statusVal && statusVal !== 'All') params.set('status', statusVal);
    if (startDate) params.set('from', startDate);
    if (endDate) params.set('to', endDate);
    if (sortVal) params.set('sort', sortVal);
    params.set('page', studentCurrentPage);
    params.set('limit', 10);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/documents${queryStr}`);
    const data = await res.json();

    if (loadingEl) loadingEl.classList.add('hidden');

    if (!res.ok) throw new Error(data.message || 'Failed to load documents');

    const docs = data.documents || [];
    const total = data.total !== undefined ? data.total : docs.length;
    studentTotalPages = data.totalPages || Math.ceil(total / 10) || 1;

    myDocsCountBadge.textContent = total;
    if (visibleCountEl) visibleCountEl.textContent = docs.length;
    if (totalCountEl) totalCountEl.textContent = total;

    // Update pagination
    if (pageInfo) pageInfo.textContent = `Page ${studentCurrentPage} of ${Math.max(1, studentTotalPages)}`;
    if (prevBtn) prevBtn.disabled = studentCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = studentCurrentPage >= studentTotalPages;

    // Update dashboard summary counters (TC_17)
    if (data.summary) {
      const summaryTotal = document.getElementById('summaryTotal');
      const summaryPending = document.getElementById('summaryPending');
      const summaryApproved = document.getElementById('summaryApproved');
      const summaryRejected = document.getElementById('summaryRejected');
      if (summaryTotal) summaryTotal.textContent = data.summary.total;
      if (summaryPending) summaryPending.textContent = data.summary.pending;
      if (summaryApproved) summaryApproved.textContent = data.summary.approved;
      if (summaryRejected) summaryRejected.textContent = data.summary.rejected;
    }

    if (docs.length === 0) {
      if (tableWrapper) tableWrapper.classList.add('hidden');
      const isCompletelyEmpty = !hasActiveFilters && (!data.summary || data.summary.total === 0);
      if (isCompletelyEmpty) {
        if (emptyDocsState) emptyDocsState.classList.remove('hidden');
        if (noResultsState) noResultsState.classList.add('hidden');
      } else {
        if (emptyDocsState) emptyDocsState.classList.add('hidden');
        if (noResultsState) noResultsState.classList.remove('hidden');
      }
      documentsTableBody.innerHTML = '<tr class="empty-row"><td colspan="7">No documents found. No documents uploaded yet.</td></tr>';
      return;
    }

    if (tableWrapper) tableWrapper.classList.remove('hidden');
    if (emptyDocsState) emptyDocsState.classList.add('hidden');
    if (noResultsState) noResultsState.classList.add('hidden');

    documentsTableBody.innerHTML = docs.map(doc => {
      const uploadTime = new Date(doc.createdAt).toLocaleString();
      const statusClass = doc.status === 'Pending Approval' ? 'status-pending' : (doc.status === 'Approved' ? 'status-approved' : 'status-rejected');
      const isRejected = doc.status === 'Rejected';
      const isPending = doc.status === 'Pending Approval';
      const isApproved = doc.status === 'Approved';

      return `
        <tr data-id="${doc.id}">
          <td>
            <strong>${escapeHtml(doc.title)}</strong>
            <div style="font-size:0.75rem; color:#64748b;">${escapeHtml(doc.originalFilename)} (${formatBytes(doc.fileSize)})</div>
            ${isRejected && doc.lastReviewComment ? `
              <div style="margin-top: 6px; padding: 4px 8px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px; font-size: 0.75rem; color: #991b1b;">
                <strong>Advisor Feedback:</strong> ${escapeHtml(doc.lastReviewComment)}
              </div>
            ` : ''}
          </td>
          <td><span class="badge">${escapeHtml(doc.category)}</span></td>
          <td>${escapeHtml(doc.dateOfAchievement)}</td>
          <td>${escapeHtml(doc.issuingOrganization)}</td>
          <td><span class="status-badge ${statusClass}">⏳ ${escapeHtml(doc.status)}</span></td>
          <td>${uploadTime}</td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              <button class="btn-action" onclick="viewDocument('${doc.id}', '${escapeHtml(doc.title)}', '${doc.mimeType}')" title="Preview document inline">
                👁️ View
              </button>
              <a href="/api/documents/${doc.id}/download" class="btn-action" download title="Download file">
                ⬇️ Download
              </a>
              ${isRejected ? `
                <button class="btn-action btn-replace" onclick="openReplaceModal('${doc.id}')" title="Replace rejected document and resubmit">
                  🔄 Replace
                </button>
              ` : isApproved ? `
                <span style="font-size:0.75rem; color:#10b981; font-weight:500;">✓ Approved</span>
              ` : `
                <span style="font-size:0.75rem; color:#94a3b8;">Under Review</span>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    const loadingEl = document.getElementById('studentSearchLoading');
    if (loadingEl) loadingEl.classList.add('hidden');
    const errorEl = document.getElementById('studentSearchError');
    const errorMsgEl = document.getElementById('studentSearchErrorMessage');
    if (errorEl) {
      errorEl.classList.remove('hidden');
      if (errorMsgEl) errorMsgEl.textContent = err.message || 'Failed to load documents';
    } else {
      showAlert(err.message, 'danger');
    }
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

    // Show faculty rejection feedback banner if available (TC_03, TC_05)
    const banner = document.getElementById('replaceRejectionBanner');
    const reasonEl = document.getElementById('replaceRejectionReason');
    if (banner && reasonEl) {
      if (doc.lastReviewComment) {
        reasonEl.textContent = doc.lastReviewComment;
        banner.style.display = 'block';
      } else {
        banner.style.display = 'none';
      }
    }

    const btnSubmit = document.getElementById('btnSubmitReplace');
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Submit Replacement';
    }

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
  const btnSubmit = document.getElementById('btnSubmitReplace');

  if (!title || !category || !dateOfAchievement || !issuingOrganization) {
    showAlert('All required fields must be completed.', 'danger');
    return;
  }

  // Mandatory file requirement for US03 resubmission (TC_11)
  if (!fileInputEl.files || !fileInputEl.files[0]) {
    document.getElementById('replaceFileFeedback').textContent = 'A replacement file is required for resubmission.';
    showAlert('A replacement file is required for resubmission.', 'danger');
    return;
  }

  const file = fileInputEl.files[0];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    document.getElementById('replaceFileFeedback').textContent = 'Invalid file type. Only PDF, JPG, JPEG, and PNG allowed.';
    showAlert('Invalid file type. Only PDF, JPG, JPEG, and PNG allowed.', 'danger');
    return;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    document.getElementById('replaceFileFeedback').textContent = 'File exceeds 10 MB limit.';
    showAlert('File exceeds 10 MB limit.', 'danger');
    return;
  }

  // Confirmation dialog (TC_25, TC_26)
  const confirmed = window.confirm('Are you sure you want to resubmit this document? This will replace the file and send it to your Faculty Advisor for review.');
  if (!confirmed) {
    return;
  }

  // Prevent duplicate resubmission on double click (TC_23)
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting replacement...';
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('category', category);
  formData.append('dateOfAchievement', dateOfAchievement);
  formData.append('issuingOrganization', issuingOrganization);
  formData.append('file', file);

  try {
    const res = await fetch(`/api/documents/${docId}/replacement`, {
      method: 'PUT',
      body: formData
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Replacement failed');

    showAlert('Replacement document submitted successfully! Status changed to Pending Approval.', 'success');
    replaceModal.classList.add('hidden');
    await refreshAllData();
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Submit Replacement';
    }
  }
}

// -------------------------------------------------------------
// Faculty Advisor View & Verification Operations (US02)
// -------------------------------------------------------------
let pendingDecisionData = null;
let isReviewingDecision = false;

// Filter and search elements (US08)
const facultySearchInput = document.getElementById('facultySearchInput');
const facultyStudentFilter = document.getElementById('facultyStudentFilter');
const facultyCategoryFilter = document.getElementById('facultyCategoryFilter');
const facultyStatusFilter = document.getElementById('facultyStatusFilter');
const facultyStartDate = document.getElementById('facultyStartDate');
const facultyEndDate = document.getElementById('facultyEndDate');
const facultySortFilter = document.getElementById('facultySortFilter');
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

let hasLoadedAssignedStudents = false;
async function loadAssignedStudentsForFaculty() {
  if (!facultyStudentFilter) return;
  try {
    const res = await fetch('/api/faculty/assigned-students');
    if (!res.ok) return;
    const data = await res.json();
    const students = data.students || [];
    const currentVal = facultyStudentFilter.value;
    facultyStudentFilter.innerHTML = '<option value="ALL">All Assigned Students</option>' +
      students.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.id)})</option>`).join('');
    if (students.some(s => s.id === currentVal)) {
      facultyStudentFilter.value = currentVal;
    }
    hasLoadedAssignedStudents = true;
  } catch (e) {
    console.warn('Could not load assigned students list:', e);
  }
}

function setupFacultyReviewListeners() {
  if (facultySearchInput) {
    let debounceTimer;
    facultySearchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadFacultyData, 300);
    });
  }

  if (facultyStudentFilter) facultyStudentFilter.addEventListener('change', loadFacultyData);
  if (facultyCategoryFilter) facultyCategoryFilter.addEventListener('change', loadFacultyData);
  if (facultyStatusFilter) facultyStatusFilter.addEventListener('change', loadFacultyData);
  if (facultyStartDate) facultyStartDate.addEventListener('change', loadFacultyData);
  if (facultyEndDate) facultyEndDate.addEventListener('change', loadFacultyData);
  if (facultySortFilter) facultySortFilter.addEventListener('change', loadFacultyData);

  if (btnClearFacultyFilters) {
    btnClearFacultyFilters.addEventListener('click', () => {
      if (facultySearchInput) facultySearchInput.value = '';
      if (facultyStudentFilter) facultyStudentFilter.value = 'ALL';
      if (facultyCategoryFilter) facultyCategoryFilter.value = 'ALL';
      if (facultyStatusFilter) facultyStatusFilter.value = 'ALL';
      if (facultyStartDate) facultyStartDate.value = '';
      if (facultyEndDate) facultyEndDate.value = '';
      if (facultySortFilter) facultySortFilter.value = 'newest';
      const dateErrorEl = document.getElementById('facultyDateError');
      if (dateErrorEl) dateErrorEl.classList.add('hidden');
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

// Open Faculty Notification & Link directly to Document Review (US04)
window.openFacultyNotification = async function(id) {
  try {
    const res = await fetch(`/api/faculty/notifications/${id}/open`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Cannot open notification');
    }

    // Refresh notifications list to update read badge and unread count
    await loadFacultyData();

    // Open review modal for the linked document
    if (data.document && data.document.id) {
      window.openReviewPanel(data.document.id);
    }
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
    // 1. Notifications for Faculty (US04)
    let notifRes = await fetch('/api/faculty/notifications');
    if (!notifRes.ok) notifRes = await fetch('/api/notifications');
    const notifData = await notifRes.json();
    const notifications = notifData.notifications || [];
    const unreadCount = notifData.unreadCount !== undefined ? notifData.unreadCount : notifications.filter(n => !n.read).length;
    facultyNotifCountBadge.textContent = unreadCount > 0 ? `${unreadCount} unread` : notifications.length;

    if (notifications.length === 0) {
      notificationsList.innerHTML = '<p class="empty-state">No notifications received yet.</p>';
    } else {
      notificationsList.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.read ? '' : 'unread'}" onclick="openFacultyNotification('${n.id}')" style="cursor:pointer;" title="Click to open linked document review">
          <div style="width:100%;">
            <div class="notif-title" style="display:flex; justify-content:space-between; align-items:center;">
              <span style="display:flex; align-items:center; gap:6px;">
                ${n.isResubmission ? '<span class="badge" style="background:#fef3c7; color:#92400e; font-size:0.7rem; font-weight:700;">🔄 RESUBMISSION</span>' : '<span class="badge" style="background:#dbeafe; color:#1e40af; font-size:0.7rem; font-weight:700;">📄 SUBMISSION</span>'}
                <strong>${escapeHtml(n.title)}</strong>
                ${!n.read ? '<span class="badge" style="background:#fee2e2; color:#b91c1c; font-size:0.65rem;">NEW</span>' : ''}
              </span>
              <span class="notif-time" style="font-size:0.75rem; color:#94a3b8;">${new Date(n.submissionDate || n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style="font-size:0.8rem; color:#475569; margin:4px 0 2px 0;">
              Student: <strong>${escapeHtml(n.studentName || n.senderId || 'Student')}</strong> &bull; Category: <span class="badge" style="font-size:0.7rem;">${escapeHtml(n.category || 'General')}</span> &bull; Submitted: ${new Date(n.submissionDate || n.createdAt).toLocaleDateString()}
            </div>
            <div class="notif-message" style="font-size:0.85rem; color:#64748b;">${escapeHtml(n.message)}</div>
          </div>
        </div>
      `).join('');
    }

    // 2. Assigned Submissions (with search and filters - US08)
    await loadAssignedStudentsForFaculty();

    const dateErrorEl = document.getElementById('facultyDateError');
    const startDateVal = facultyStartDate ? facultyStartDate.value : '';
    const endDateVal = facultyEndDate ? facultyEndDate.value : '';

    if (startDateVal && endDateVal && new Date(startDateVal) > new Date(endDateVal)) {
      if (dateErrorEl) dateErrorEl.classList.remove('hidden');
      return;
    } else {
      if (dateErrorEl) dateErrorEl.classList.add('hidden');
    }

    let queryParams = new URLSearchParams();
    const searchVal = facultySearchInput ? facultySearchInput.value.trim() : '';
    const studentVal = facultyStudentFilter ? facultyStudentFilter.value : 'ALL';
    const categoryVal = facultyCategoryFilter ? facultyCategoryFilter.value : 'ALL';
    const statusVal = facultyStatusFilter ? facultyStatusFilter.value : 'ALL';
    const sortVal = facultySortFilter ? facultySortFilter.value : 'newest';

    if (searchVal) queryParams.set('search', searchVal);
    if (studentVal && studentVal !== 'ALL') queryParams.set('studentId', studentVal);
    if (categoryVal && categoryVal !== 'ALL') queryParams.set('category', categoryVal);
    if (statusVal && statusVal !== 'ALL') queryParams.set('status', statusVal);
    if (startDateVal) queryParams.set('startDate', startDateVal);
    if (endDateVal) queryParams.set('endDate', endDateVal);
    if (sortVal) queryParams.set('sort', sortVal);

    const docsRes = await fetch(`/api/faculty/documents?${queryParams.toString()}`);
    const docsData = await docsRes.json();
    const docs = docsData.documents || [];

    const visibleCount = document.getElementById('facultyVisibleCount');
    const totalCount = document.getElementById('facultyTotalCount');
    if (visibleCount) visibleCount.textContent = docs.length;
    if (totalCount) totalCount.textContent = docsData.total !== undefined ? docsData.total : docs.length;

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
// Reports & Analytics (US09: TC_01 - TC_40)
// -------------------------------------------------------------
async function loadReportsData() {
  const loadingEl = document.getElementById('reportLoadingState');
  const errorEl = document.getElementById('reportErrorState');
  const errorMsgEl = document.getElementById('reportErrorMessage');
  const dateErrorEl = document.getElementById('reportDateError');
  const generatedTimeEl = document.getElementById('reportGeneratedTime');
  const startEl = document.getElementById('reportStartDate');
  const endEl = document.getElementById('reportEndDate');
  const categoryEl = document.getElementById('reportCategoryFilter');
  const statusEl = document.getElementById('reportStatusFilter');
  const tableWrapper = document.getElementById('reportTableWrapper');
  const emptyState = document.getElementById('reportEmptyState');
  const tableBody = document.getElementById('reportTableBody');

  if (errorEl) errorEl.classList.add('hidden');

  const startDate = startEl ? startEl.value : '';
  const endDate = endEl ? endEl.value : '';

  // Date range validation (TC_09)
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    if (dateErrorEl) dateErrorEl.classList.remove('hidden');
    return;
  } else {
    if (dateErrorEl) dateErrorEl.classList.add('hidden');
  }

  if (loadingEl) loadingEl.classList.remove('hidden');

  try {
    const params = new URLSearchParams();
    if (startDate) params.set('from', startDate);
    if (endDate) params.set('to', endDate);
    if (categoryEl && categoryEl.value !== 'ALL') params.set('category', categoryEl.value);
    if (statusEl && statusEl.value !== 'ALL') params.set('status', statusEl.value);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/reports${queryStr}`);
    const data = await res.json();

    if (loadingEl) loadingEl.classList.add('hidden');

    if (!res.ok) throw new Error(data.message || 'Failed to generate report');

    // Update generation timestamp (TC_39, TC_40)
    if (generatedTimeEl) {
      const genDate = new Date(data.generatedAt);
      generatedTimeEl.textContent = `Generated: ${genDate.toLocaleTimeString()}`;
    }

    // Update summary metric cards (TC_03 - TC_07)
    const metrics = data.metrics || {};
    const totalDocsEl = document.getElementById('reportTotalDocs');
    const pendingDocsEl = document.getElementById('reportPendingDocs');
    const approvedDocsEl = document.getElementById('reportApprovedDocs');
    const rejectedDocsEl = document.getElementById('reportRejectedDocs');
    const approvalRateEl = document.getElementById('reportApprovalRate');

    if (totalDocsEl) totalDocsEl.textContent = metrics.totalDocuments || 0;
    if (pendingDocsEl) pendingDocsEl.textContent = metrics.pendingDocuments || 0;
    if (approvedDocsEl) approvedDocsEl.textContent = metrics.approvedDocuments || 0;
    if (rejectedDocsEl) rejectedDocsEl.textContent = metrics.rejectedDocuments || 0;
    if (approvalRateEl) approvalRateEl.textContent = `${metrics.approvalRatePercentage || 0}%`;

    // Visual Distribution Charts (TC_14, TC_15, TC_34)
    const statusBarsEl = document.getElementById('reportStatusBars');
    const chartSummaryEl = document.getElementById('reportChartSummary');
    const charts = data.charts || {};

    if (chartSummaryEl) {
      chartSummaryEl.textContent = `Pending: ${metrics.pendingDocuments || 0}, Approved: ${metrics.approvedDocuments || 0}, Rejected: ${metrics.rejectedDocuments || 0}`;
    }

    if (statusBarsEl && charts.statusDistribution) {
      statusBarsEl.innerHTML = charts.statusDistribution.map(s => `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;">
            <span><strong>${escapeHtml(s.status)}</strong></span>
            <span>${s.count} (${s.percentage}%)</span>
          </div>
          <div style="background:#e2e8f0; border-radius:9999px; height:8px; overflow:hidden;">
            <div style="background:${s.color}; width:${s.percentage}%; height:100%; border-radius:9999px;"></div>
          </div>
        </div>
      `).join('');
    }

    const categoryBarsEl = document.getElementById('reportCategoryBars');
    if (categoryBarsEl && charts.categoryDistribution) {
      categoryBarsEl.innerHTML = charts.categoryDistribution.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; padding:4px 0; border-bottom:1px solid #f1f5f9;">
          <span class="badge">${escapeHtml(c.category)}</span>
          <span style="font-weight:600; color:#334155;">${c.count} records (${c.percentage}%)</span>
        </div>
      `).join('') || '<p style="color:#94a3b8; font-size:0.8rem;">No categories recorded.</p>';
    }

    // Detail rows (TC_16, TC_29, TC_30)
    const details = data.details || [];
    const detailsCountEl = document.getElementById('reportDetailsCount');
    if (detailsCountEl) detailsCountEl.textContent = details.length;

    if (details.length === 0) {
      if (tableWrapper) tableWrapper.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      if (tableBody) tableBody.innerHTML = '';
      return;
    }

    if (tableWrapper) tableWrapper.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    if (tableBody) {
      tableBody.innerHTML = details.map(d => {
        const statusClass = d.status === 'Pending Approval' ? 'status-pending' : (d.status === 'Approved' ? 'status-approved' : 'status-rejected');
        return `
          <tr>
            <td><code>${escapeHtml(d.id)}</code></td>
            <td><strong>${escapeHtml(d.title)}</strong></td>
            <td>${escapeHtml(d.studentName)}</td>
            <td><code>${escapeHtml(d.registrationNumber)}</code></td>
            <td><span class="badge">${escapeHtml(d.category)}</span></td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(d.status)}</span></td>
            <td>${d.uploadDate ? new Date(d.uploadDate).toLocaleDateString() : ''}</td>
            <td>${escapeHtml(d.issuingOrganization || '-')}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) {
      errorEl.classList.remove('hidden');
      if (errorMsgEl) errorMsgEl.textContent = err.message || 'Error loading report';
    } else {
      showAlert(err.message, 'danger');
    }
  }
}

function exportReport(format) {
  const startEl = document.getElementById('reportStartDate');
  const endEl = document.getElementById('reportEndDate');
  const categoryEl = document.getElementById('reportCategoryFilter');
  const statusEl = document.getElementById('reportStatusFilter');

  const params = new URLSearchParams();
  params.set('format', format);
  if (startEl && startEl.value) params.set('from', startEl.value);
  if (endEl && endEl.value) params.set('to', endEl.value);
  if (categoryEl && categoryEl.value !== 'ALL') params.set('category', categoryEl.value);
  if (statusEl && statusEl.value !== 'ALL') params.set('status', statusEl.value);

  window.location.href = `/api/reports/export?${params.toString()}`;
}

// -------------------------------------------------------------
// User / Persona Management
// -------------------------------------------------------------
async function loadCurrentUser() {
  try {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch('/api/auth/me', { headers });
    const data = await res.json();
    if (res.ok && data.user) {
      currentUser = data.user;
      renderCurrentUser();
      return true;
    } else {
      currentUser = null;
      authToken = null;
      sessionStorage.removeItem('af_token');
      return false;
    }
  } catch (err) {
    console.error('Failed loading user:', err);
    return false;
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
      if (data.token) {
        authToken = data.token;
        sessionStorage.setItem('af_token', authToken);
      }
      renderCurrentUser();
      if (currentUser.role === 'Faculty') {
        switchTab('facultyTab');
      } else if (currentUser.role === 'Admin') {
        switchTab('adminUsersTab');
      } else {
        switchTab('dashboardTab');
      }
      showAlert(`Switched session to: ${currentUser.name} (${currentUser.role})`, 'success');
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

  const tabDashboardBtn = document.getElementById('tabDashboardBtn');
  const tabFacultyBtn = document.getElementById('tabFacultyBtn');
  const tabAuditBtn = document.getElementById('tabAuditBtn');
  const tabAdminUsersBtn = document.getElementById('tabAdminUsersBtn');
  const tabUploadBtn = document.getElementById('tabUploadBtn');
  const tabDocumentsBtn = document.getElementById('tabDocumentsBtn');
  const tabNotificationsBtn = document.getElementById('tabNotificationsBtn');
  const tabReportsBtn = document.getElementById('tabReportsBtn');

  // Role-Based Control & Tab Isolation (TC_02, TC_38, TC_40)
  if (currentUser.role === 'Student') {
    advisorBanner.classList.remove('hidden');
    assignedAdvisorName.textContent = currentUser.assignedFacultyAdvisorName || 'Dr. Robert Smith';
    if (tabDashboardBtn) tabDashboardBtn.classList.remove('hidden');
    if (tabUploadBtn) tabUploadBtn.classList.remove('hidden');
    if (tabDocumentsBtn) tabDocumentsBtn.classList.remove('hidden');
    if (tabNotificationsBtn) tabNotificationsBtn.classList.remove('hidden');
    if (tabFacultyBtn) tabFacultyBtn.classList.add('hidden');
    if (tabAdminUsersBtn) tabAdminUsersBtn.classList.add('hidden');
    if (tabAuditBtn) tabAuditBtn.classList.add('hidden');
    if (tabReportsBtn) tabReportsBtn.classList.add('hidden'); // TC_02
  } else if (currentUser.role === 'Faculty') {
    advisorBanner.classList.add('hidden');
    if (tabDashboardBtn) tabDashboardBtn.classList.add('hidden');
    if (tabFacultyBtn) tabFacultyBtn.classList.remove('hidden');
    if (tabAdminUsersBtn) tabAdminUsersBtn.classList.add('hidden');
    if (tabAuditBtn) tabAuditBtn.classList.add('hidden');
    if (tabReportsBtn) tabReportsBtn.classList.remove('hidden');
  } else {
    // Administrator
    advisorBanner.classList.add('hidden');
    if (tabDashboardBtn) tabDashboardBtn.classList.add('hidden');
    if (tabUploadBtn) tabUploadBtn.classList.add('hidden');
    if (tabFacultyBtn) tabFacultyBtn.classList.remove('hidden');
    if (tabAdminUsersBtn) tabAdminUsersBtn.classList.remove('hidden');
    if (tabAuditBtn) tabAuditBtn.classList.remove('hidden');
    if (tabReportsBtn) tabReportsBtn.classList.remove('hidden');
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

  if (tabId === 'dashboardTab') loadStudentDashboard();
  if (tabId === 'documentsTab') loadDocuments();
  if (tabId === 'notificationsTab') loadStudentNotifications();
  if (tabId === 'facultyTab') loadFacultyData();
  if (tabId === 'adminUsersTab') loadAdminUsers();
  if (tabId === 'auditTab') loadAuditLogs();
  if (tabId === 'reportsTab') loadReportsData();
}

async function refreshAllData() {
  await Promise.all([
    loadStudentDashboard(),
    loadDocuments(),
    loadStudentNotifications(),
    loadFacultyData(),
    loadAdminUsers(),
    loadAuditLogs(),
    loadReportsData()
  ]);
}

// -------------------------------------------------------------
// Student Dashboard Operations (US06 & TC_01 - TC_40)
// -------------------------------------------------------------
async function loadStudentDashboard() {
  const loadingEl = document.getElementById('dashboardLoading');
  const errorEl = document.getElementById('dashboardError');
  const errorMsgEl = document.getElementById('dashboardErrorMessage');
  const emptyStateEl = document.getElementById('dashEmptyState');
  const recentListEl = document.getElementById('dashRecentUploadsList');
  const greetingEl = document.getElementById('dashStudentName');

  const totalEl = document.getElementById('dashTotalDocs');
  const pendingEl = document.getElementById('dashPendingDocs');
  const approvedEl = document.getElementById('dashApprovedDocs');
  const rejectedEl = document.getElementById('dashRejectedDocs');
  const notifBadgeEl = document.getElementById('dashNotifBadge');

  if (!recentListEl) return;

  // Show loading state (TC_24)
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (errorEl) errorEl.classList.add('hidden');

  try {
    const headers = { 'Accept': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    else if (currentUser) headers['x-user-id'] = currentUser.id;

    const res = await fetch('/api/student/dashboard', { headers });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401 && (data.code === 'SESSION_EXPIRED' || data.message.includes('expired'))) {
        if (loadingEl) loadingEl.classList.add('hidden');
        showLandingPage();
        showAlert('Session expired due to inactivity. Please log in again.', 'danger');
        openSigninModal('Student');
        return;
      }
      throw new Error(data.message || 'Failed to load dashboard data');
    }

    if (loadingEl) loadingEl.classList.add('hidden');

    // Personalized welcome greeting (TC_02)
    if (greetingEl) {
      greetingEl.textContent = (data.student && data.student.name) || (currentUser && currentUser.name) || 'Student';
    }

    // Dashboard Statistics (TC_03, TC_04, TC_05, TC_06, TC_07, TC_27, TC_29)
    if (totalEl) totalEl.textContent = data.counts.total;
    if (pendingEl) pendingEl.textContent = data.counts.pending;
    if (approvedEl) approvedEl.textContent = data.counts.approved;
    if (rejectedEl) rejectedEl.textContent = data.counts.rejected;
    if (notifBadgeEl) notifBadgeEl.textContent = data.unreadNotificationCount;

    // Recent Uploads Rendering (TC_08, TC_09, TC_10, TC_11, TC_12, TC_30, TC_31)
    const uploads = data.recentUploads || [];
    if (uploads.length === 0) {
      // Empty state for student with no uploads (TC_08)
      if (emptyStateEl) emptyStateEl.classList.remove('hidden');
      recentListEl.innerHTML = '';
    } else {
      if (emptyStateEl) emptyStateEl.classList.add('hidden');
      recentListEl.innerHTML = `
        <table class="recent-table" aria-label="Recent Uploads">
          <thead>
            <tr>
              <th scope="col">Document Title</th>
              <th scope="col">Category</th>
              <th scope="col">Upload Date</th>
              <th scope="col">Status</th>
              <th scope="col" class="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            ${uploads.map(doc => {
              let badgeClass = 'badge-pending';
              let icon = '⏳';
              if (doc.status === 'Approved') {
                badgeClass = 'badge-approved';
                icon = '✅';
              } else if (doc.status === 'Rejected') {
                badgeClass = 'badge-rejected';
                icon = '❌';
              }
              const safeTitle = escapeHtml(doc.title);
              const safeOrg = escapeHtml(doc.issuingOrganization || '');
              const safeCategory = escapeHtml(doc.category || '');
              const displayDate = doc.formattedDate || (doc.uploadDate ? new Date(doc.uploadDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A');

              return `
                <tr class="recent-row" tabindex="0" role="button" aria-label="View details for ${safeTitle}" data-doc-id="${doc.id}">
                  <td class="recent-title-cell">
                    <span class="recent-title-text" title="${safeTitle}">${safeTitle}</span>
                    <span class="recent-org-sub">${safeOrg}</span>
                  </td>
                  <td><span class="badge badge-light">${safeCategory}</span></td>
                  <td>${displayDate}</td>
                  <td>
                    <span class="badge-status ${badgeClass}" aria-label="Status: ${doc.status}">
                      <span>${icon}</span>
                      <span>${doc.status}</span>
                    </span>
                  </td>
                  <td class="text-right">
                    <button type="button" class="af-btn af-btn-outline btn-sm btn-recent-preview" data-id="${doc.id}" aria-label="Preview document ${safeTitle}">
                      👁️ View
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;

      // Attach row and preview click handlers (TC_30, TC_34)
      recentListEl.querySelectorAll('.recent-row, .btn-recent-preview').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const docId = el.dataset.docId || el.dataset.id;
          if (docId) openDocumentPreview(docId);
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const docId = el.dataset.docId || el.dataset.id;
            if (docId) openDocumentPreview(docId);
          }
        });
      });
    }
  } catch (err) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) {
      errorEl.classList.remove('hidden');
      if (errorMsgEl) errorMsgEl.textContent = err.message || 'Failed to load dashboard data';
    }
  }
}

// -------------------------------------------------------------
// Student Notifications Operations (US05 & TC_01 - TC_40)
// -------------------------------------------------------------
async function loadStudentNotifications() {
  const notifsListEl = document.getElementById('studentNotificationsList');
  const countBadge = document.getElementById('studentNotifCount');
  if (!notifsListEl) return;

  try {
    const searchEl = document.getElementById('notifSearchInput');
    const typeEl = document.getElementById('notifTypeFilter');

    const params = new URLSearchParams();
    if (searchEl && searchEl.value.trim()) params.set('search', searchEl.value.trim());
    if (typeEl && typeEl.value !== 'All') params.set('type', typeEl.value);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/notifications${queryStr}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Cannot load notifications');

    const notifs = data.notifications || [];
    const unreadCount = data.unreadCount !== undefined ? data.unreadCount : notifs.filter(n => !n.read).length;
    if (countBadge) {
      countBadge.textContent = unreadCount > 0 ? `${unreadCount} unread` : notifs.length;
    }

    if (notifs.length === 0) {
      notifsListEl.innerHTML = '<p class="empty-state">No notifications matching your filter criteria.</p>';
      return;
    }

    notifsListEl.innerHTML = notifs.map(n => `
      <div class="notification-item ${n.read ? '' : 'unread'}" style="cursor:pointer;" onclick="openStudentNotification('${n.id}')">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
          <div style="flex:1;">
            <div class="notif-title" style="display:flex; align-items:center; gap:8px;">
              ${n.title && n.title.includes('Approved') ? '<span class="status-badge status-approved" style="font-size:0.7rem;">✓ APPROVED</span>' : '<span class="status-badge status-rejected" style="font-size:0.7rem;">✕ REJECTED</span>'}
              <strong>${escapeHtml(n.title)}</strong>
              ${!n.read ? '<span class="badge" style="background:#fee2e2; color:#b91c1c; font-size:0.65rem;">UNREAD</span>' : '<span class="badge" style="background:#f1f5f9; color:#64748b; font-size:0.65rem;">READ</span>'}
            </div>
            <div style="font-size:0.8rem; color:#475569; margin:4px 0 2px 0;">
              Document: <strong>${escapeHtml(n.documentTitle || 'Document')}</strong> &bull; Received: ${new Date(n.createdAt).toLocaleString()}
            </div>
            <div class="notif-message" style="margin-top:4px; font-size:0.875rem;">${escapeHtml(n.message)}</div>
          </div>
          <div style="margin-left:12px; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <span class="notif-time" style="font-size:0.75rem; color:#94a3b8;">${new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            ${!n.read ? `<button class="btn btn-secondary btn-sm" style="font-size:0.7rem; padding:2px 6px;" onclick="event.stopPropagation(); markNotifRead('${n.id}')">Mark Read</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    if (notifsListEl) notifsListEl.innerHTML = `<p class="field-feedback error" style="display:block;">${escapeHtml(err.message)}</p>`;
  }
}

window.markNotifRead = async function(id) {
  try {
    const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error marking read');
    await loadStudentNotifications();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
};

window.markAllStudentNotifsRead = async function() {
  try {
    const res = await fetch('/api/notifications/read-all', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error marking all read');
    showAlert('All notifications marked as read', 'success');
    await loadStudentNotifications();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
};

window.openStudentNotification = async function(id) {
  try {
    const res = await fetch(`/api/notifications/${id}/open`);
    const data = await res.json();
    await loadStudentNotifications();
    if (!data.document) {
      showAlert('The document linked to this notification is no longer available.', 'warning');
      return;
    }
    // Switch to documents tab and show doc preview
    switchTab('documentsTab');
    if (data.document.id) {
      viewDocument(data.document.id, data.document.title, data.document.mimeType);
    }
  } catch (err) {
    showAlert(err.message, 'danger');
  }
};

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

// =============================================================
// ADMIN USER & FACULTY MANAGEMENT (US07 & TC_01 - TC_40)
// =============================================================
let adminUsersCurrentPage = 1;
let adminUsersSortOrder = 'asc';
let pendingAdminAction = null;

function setupAdminUserListeners() {
  const btnAddUserModal = document.getElementById('btnAddUserModalBtn');
  const btnCloseCreateUser = document.getElementById('btnCloseCreateUser');
  const btnCancelCreateUser = document.getElementById('btnCancelCreateUser');
  const createUserForm = document.getElementById('createUserForm');

  const btnCloseEditUser = document.getElementById('btnCloseEditUser');
  const btnCancelEditUser = document.getElementById('btnCancelEditUser');
  const editUserForm = document.getElementById('editUserForm');

  const btnCloseAssignAdvisor = document.getElementById('btnCloseAssignAdvisor');
  const btnCancelAssignAdvisor = document.getElementById('btnCancelAssignAdvisor');
  const assignAdvisorForm = document.getElementById('assignAdvisorForm');

  const btnCloseConfirmAdmin = document.getElementById('btnCloseConfirmAdmin');
  const btnCancelAdminAction = document.getElementById('btnCancelAdminAction');
  const btnExecuteAdminAction = document.getElementById('btnExecuteAdminAction');

  const adminSearch = document.getElementById('adminUserSearch');
  const roleFilter = document.getElementById('adminRoleFilter');
  const statusFilter = document.getElementById('adminStatusFilter');
  const btnClearFilters = document.getElementById('btnClearAdminFilters');
  const btnRefresh = document.getElementById('btnRefreshAdminUsers');
  const btnRetry = document.getElementById('btnRetryAdminUsers');

  const prevBtn = document.getElementById('btnAdminPrevPage');
  const nextBtn = document.getElementById('btnAdminNextPage');
  const thSortName = document.getElementById('thSortName');

  // Open Create User Modal
  if (btnAddUserModal) {
    btnAddUserModal.addEventListener('click', async () => {
      const modal = document.getElementById('createUserModal');
      const form = document.getElementById('createUserForm');
      const alertEl = document.getElementById('createUserAlert');
      if (alertEl) alertEl.classList.add('hidden');
      if (form) form.reset();
      await populateFacultyAdvisorDropdown('newUserAdvisor');
      if (modal) modal.classList.remove('hidden');
    });
  }

  // Close Create User Modal
  if (btnCloseCreateUser) btnCloseCreateUser.addEventListener('click', () => {
    document.getElementById('createUserModal')?.classList.add('hidden');
  });
  if (btnCancelCreateUser) btnCancelCreateUser.addEventListener('click', () => {
    document.getElementById('createUserModal')?.classList.add('hidden');
  });

  // Submit Create User Form (TC_18 - TC_22)
  if (createUserForm) {
    createUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('createUserAlert');
      if (alertEl) alertEl.classList.add('hidden');

      const name = document.getElementById('newUserName')?.value.trim();
      const email = document.getElementById('newUserEmail')?.value.trim();
      const role = document.getElementById('newUserRole')?.value;
      const department = document.getElementById('newUserDept')?.value.trim();
      const semester = document.getElementById('newUserSemester')?.value.trim();
      const advisorId = document.getElementById('newUserAdvisor')?.value || null;

      if (!name || !email) {
        if (alertEl) {
          alertEl.textContent = 'Name and email are required fields';
          alertEl.classList.remove('hidden');
        }
        return;
      }

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        else if (currentUser) headers['x-user-id'] = currentUser.id;

        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, email, role, department, semester, assignedFacultyAdvisorId: advisorId })
        });
        const data = await res.json();

        if (!res.ok) {
          if (alertEl) {
            alertEl.textContent = data.message || 'Error creating user account';
            alertEl.classList.remove('hidden');
          }
          return;
        }

        document.getElementById('createUserModal')?.classList.add('hidden');
        showAlert(`Account for '${data.user.name}' created successfully!`, 'success');
        await loadAdminUsers(1);
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = err.message || 'Network error while creating account';
          alertEl.classList.remove('hidden');
        }
      }
    });
  }

  // Close Edit User Modal & Discard Changes (TC_25)
  if (btnCloseEditUser) btnCloseEditUser.addEventListener('click', () => {
    document.getElementById('editUserModal')?.classList.add('hidden');
  });
  if (btnCancelEditUser) btnCancelEditUser.addEventListener('click', () => {
    document.getElementById('editUserModal')?.classList.add('hidden');
  });

  // Submit Edit User Form (TC_23 - TC_25, TC_31)
  if (editUserForm) {
    editUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('editUserAlert');
      if (alertEl) alertEl.classList.add('hidden');

      const id = document.getElementById('editUserId')?.value;
      const name = document.getElementById('editUserName')?.value.trim();
      const email = document.getElementById('editUserEmail')?.value.trim();
      const role = document.getElementById('editUserRole')?.value;
      const status = document.getElementById('editUserStatus')?.value;
      const department = document.getElementById('editUserDept')?.value.trim();
      const semester = document.getElementById('editUserSemester')?.value.trim();
      const advisorId = document.getElementById('editUserAdvisor')?.value || null;

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        else if (currentUser) headers['x-user-id'] = currentUser.id;

        const res = await fetch(`/api/admin/users/${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ name, email, role, status, department, semester, assignedFacultyAdvisorId: advisorId })
        });
        const data = await res.json();

        if (!res.ok) {
          if (alertEl) {
            alertEl.textContent = data.message || 'Error saving user updates';
            alertEl.classList.remove('hidden');
          }
          return;
        }

        document.getElementById('editUserModal')?.classList.add('hidden');
        showAlert(`User '${data.user.name}' updated successfully!`, 'success');
        await loadAdminUsers(adminUsersCurrentPage);
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = err.message || 'Network error while updating user';
          alertEl.classList.remove('hidden');
        }
      }
    });
  }

  // Close Assign Advisor Modal
  if (btnCloseAssignAdvisor) btnCloseAssignAdvisor.addEventListener('click', () => {
    document.getElementById('assignAdvisorModal')?.classList.add('hidden');
  });
  if (btnCancelAssignAdvisor) btnCancelAssignAdvisor.addEventListener('click', () => {
    document.getElementById('assignAdvisorModal')?.classList.add('hidden');
  });

  // Submit Assign Advisor Form (US07 AC 3 & 4)
  if (assignAdvisorForm) {
    assignAdvisorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('assignAdvisorAlert');
      if (alertEl) alertEl.classList.add('hidden');

      const studentId = document.getElementById('assignAdvisorStudentId')?.value;
      const facultyId = document.getElementById('assignAdvisorSelect')?.value;

      if (!facultyId) {
        if (alertEl) {
          alertEl.textContent = 'Please select a Faculty Advisor';
          alertEl.classList.remove('hidden');
        }
        return;
      }

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        else if (currentUser) headers['x-user-id'] = currentUser.id;

        const res = await fetch(`/api/admin/students/${studentId}/advisor`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ facultyId })
        });
        const data = await res.json();

        if (!res.ok) {
          if (alertEl) {
            alertEl.textContent = data.message || 'Error assigning advisor';
            alertEl.classList.remove('hidden');
          }
          return;
        }

        document.getElementById('assignAdvisorModal')?.classList.add('hidden');
        showAlert(data.message, 'success');
        await loadAdminUsers(adminUsersCurrentPage);
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = err.message || 'Network error while assigning advisor';
          alertEl.classList.remove('hidden');
        }
      }
    });
  }

  // Confirm Admin Action Dialog controls (TC_27, TC_39)
  if (btnCloseConfirmAdmin) btnCloseConfirmAdmin.addEventListener('click', () => {
    document.getElementById('confirmAdminActionModal')?.classList.add('hidden');
    pendingAdminAction = null;
  });
  if (btnCancelAdminAction) btnCancelAdminAction.addEventListener('click', () => {
    document.getElementById('confirmAdminActionModal')?.classList.add('hidden');
    pendingAdminAction = null;
  });
  if (btnExecuteAdminAction) {
    btnExecuteAdminAction.addEventListener('click', async () => {
      if (!pendingAdminAction) return;
      const { type, userId, targetStatus, userName } = pendingAdminAction;
      document.getElementById('confirmAdminActionModal')?.classList.add('hidden');
      pendingAdminAction = null;

      if (type === 'TOGGLE_STATUS') {
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
          else if (currentUser) headers['x-user-id'] = currentUser.id;

          const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: targetStatus })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Failed to update account status');

          showAlert(`Account for '${userName}' has been set to ${targetStatus}.`, 'success');
          await loadAdminUsers(adminUsersCurrentPage);
        } catch (err) {
          showAlert(err.message, 'danger');
        }
      }
    });
  }

  // Filters & Search handlers (TC_08 - TC_13)
  if (adminSearch) adminSearch.addEventListener('input', () => loadAdminUsers(1));
  if (roleFilter) roleFilter.addEventListener('change', () => loadAdminUsers(1));
  if (statusFilter) statusFilter.addEventListener('change', () => loadAdminUsers(1));

  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', () => {
      if (adminSearch) adminSearch.value = '';
      if (roleFilter) roleFilter.value = 'All';
      if (statusFilter) statusFilter.value = 'All';
      loadAdminUsers(1);
    });
  }

  if (btnRefresh) btnRefresh.addEventListener('click', () => loadAdminUsers(adminUsersCurrentPage));
  if (btnRetry) btnRetry.addEventListener('click', () => loadAdminUsers(adminUsersCurrentPage));

  // Sort by Name (TC_14)
  if (thSortName) {
    thSortName.addEventListener('click', () => {
      adminUsersSortOrder = adminUsersSortOrder === 'asc' ? 'desc' : 'asc';
      const ind = document.getElementById('sortNameIndicator');
      if (ind) ind.textContent = adminUsersSortOrder === 'asc' ? '▲' : '▼';
      loadAdminUsers(1);
    });
  }

  // Pagination (TC_15)
  if (prevBtn) prevBtn.addEventListener('click', () => {
    if (adminUsersCurrentPage > 1) loadAdminUsers(adminUsersCurrentPage - 1);
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    loadAdminUsers(adminUsersCurrentPage + 1);
  });
}

// Populate Faculty Advisors dropdown in modals
async function populateFacultyAdvisorDropdown(selectElementId, selectedId = null) {
  const selectEl = document.getElementById(selectElementId);
  if (!selectEl) return;

  try {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    else if (currentUser) headers['x-user-id'] = currentUser.id;

    const res = await fetch('/api/admin/users?role=Faculty', { headers });
    const data = await res.json();
    const facultyList = data.users || [];

    selectEl.innerHTML = '<option value="">-- None / Select Advisor --</option>' +
      facultyList.map(f => `
        <option value="${f.id}" ${selectedId === f.id ? 'selected' : ''}>
          ${escapeHtml(f.name)} (${escapeHtml(f.department || 'Faculty')})
        </option>
      `).join('');
  } catch (err) {
    console.error('Failed to populate faculty advisors:', err);
  }
}

// Load Admin Users List (TC_03 - TC_15)
async function loadAdminUsers(page = 1) {
  const tableBody = document.getElementById('adminUsersTableBody');
  const loadingEl = document.getElementById('adminUsersLoading');
  const errorEl = document.getElementById('adminUsersError');
  const errorMsgEl = document.getElementById('adminUsersErrorMessage');
  const emptyEl = document.getElementById('adminUsersEmptyState');
  const pageInfoEl = document.getElementById('adminUsersPageInfo');
  const prevBtn = document.getElementById('btnAdminPrevPage');
  const nextBtn = document.getElementById('btnAdminNextPage');

  if (!tableBody) return;
  adminUsersCurrentPage = page;

  const search = document.getElementById('adminUserSearch')?.value.trim() || '';
  const role = document.getElementById('adminRoleFilter')?.value || 'All';
  const status = document.getElementById('adminStatusFilter')?.value || 'All';

  if (loadingEl) loadingEl.classList.remove('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');

  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (role !== 'All') params.set('role', role);
    if (status !== 'All') params.set('status', status);
    params.set('sort', 'name');
    params.set('sortOrder', adminUsersSortOrder);
    params.set('page', page);
    params.set('limit', 10);

    const headers = { 'Accept': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    else if (currentUser) headers['x-user-id'] = currentUser.id;

    const res = await fetch(`/api/admin/users?${params.toString()}`, { headers });
    const data = await res.json();

    if (!res.ok) throw new Error(data.message || 'Failed to load users');

    if (loadingEl) loadingEl.classList.add('hidden');

    const users = data.users || [];
    if (users.length === 0) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="7">No matching accounts found.</td></tr>';
      if (emptyEl) emptyEl.classList.remove('hidden');
      if (pageInfoEl) pageInfoEl.textContent = 'Showing 0-0 of 0 users';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    if (pageInfoEl) {
      const start = (data.page - 1) * data.limit + 1;
      const end = Math.min(start + data.count - 1, data.total);
      pageInfoEl.textContent = `Showing ${start}-${end} of ${data.total} users`;
    }

    if (prevBtn) prevBtn.disabled = data.page <= 1;
    if (nextBtn) nextBtn.disabled = data.page >= data.totalPages;

    tableBody.innerHTML = users.map(user => {
      const safeName = escapeHtml(user.name);
      const safeEmail = escapeHtml(user.email);
      const safeRole = escapeHtml(user.role);
      const safeStatus = escapeHtml(user.status || 'Active');
      const safeDept = escapeHtml(user.department || 'N/A');
      const safeSem = escapeHtml(user.semester || '');
      const advisorText = user.role === 'Student' 
        ? (user.assignedFacultyAdvisorName ? `👨‍🏫 ${escapeHtml(user.assignedFacultyAdvisorName)}` : '<span style="color:#f59e0b;">⚠️ Unassigned</span>')
        : (user.role === 'Faculty' ? 'Faculty Advisor' : 'System Admin');

      const statusBadge = safeStatus === 'Active'
        ? '<span class="badge-status badge-approved"><span>✅</span><span>Active</span></span>'
        : '<span class="badge-status badge-rejected"><span>⛔</span><span>Disabled</span></span>';

      const toggleActionText = safeStatus === 'Active' ? 'Disable' : 'Enable';
      const toggleActionClass = safeStatus === 'Active' ? 'btn-danger' : 'btn-success';

      return `
        <tr class="user-row" data-id="${user.id}">
          <td>
            <strong>${safeName}</strong>
            <br><small style="color:#64748b;">ID: ${escapeHtml(user.id)}</small>
          </td>
          <td>${safeEmail}</td>
          <td><span class="badge badge-light">${safeRole}</span></td>
          <td>${statusBadge}</td>
          <td>${safeDept} ${safeSem ? `<small>(${safeSem})</small>` : ''}</td>
          <td>${advisorText}</td>
          <td class="text-right" style="white-space:nowrap;">
            <button type="button" class="btn btn-secondary btn-sm btn-edit-user" data-id="${user.id}" aria-label="Edit user ${safeName}">✏️ Edit</button>
            ${user.role === 'Student' ? `<button type="button" class="btn btn-secondary btn-sm btn-assign-advisor" data-id="${user.id}" data-name="${safeName}" data-advisor-id="${user.assignedFacultyAdvisorId || ''}" aria-label="Assign advisor for ${safeName}">👨‍🏫 Assign</button>` : ''}
            ${user.id !== 'ADM-001' ? `<button type="button" class="btn ${toggleActionClass} btn-sm btn-toggle-status" data-id="${user.id}" data-name="${safeName}" data-status="${safeStatus}" aria-label="${toggleActionText} user ${safeName}">${toggleActionText}</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    // Attach actions
    tableBody.querySelectorAll('.btn-edit-user').forEach(btn => {
      btn.addEventListener('click', () => openEditUserModal(btn.dataset.id));
    });
    tableBody.querySelectorAll('.btn-assign-advisor').forEach(btn => {
      btn.addEventListener('click', () => openAssignAdvisorModal(btn.dataset.id, btn.dataset.name, btn.dataset.advisorId));
    });
    tableBody.querySelectorAll('.btn-toggle-status').forEach(btn => {
      btn.addEventListener('click', () => confirmToggleStatus(btn.dataset.id, btn.dataset.name, btn.dataset.status));
    });

  } catch (err) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) {
      errorEl.classList.remove('hidden');
      if (errorMsgEl) errorMsgEl.textContent = err.message || 'Failed to load user accounts.';
    }
  }
}

// Open Edit User Modal (TC_16, TC_17, TC_23)
async function openEditUserModal(userId) {
  try {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    else if (currentUser) headers['x-user-id'] = currentUser.id;

    const res = await fetch(`/api/admin/users/${userId}`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Cannot load user details');

    const user = data.user;
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.name;
    document.getElementById('editUserEmail').value = user.email;
    document.getElementById('editUserRole').value = user.role;
    document.getElementById('editUserStatus').value = user.status || 'Active';
    document.getElementById('editUserDept').value = user.department || '';
    document.getElementById('editUserSemester').value = user.semester || '';

    await populateFacultyAdvisorDropdown('editUserAdvisor', user.assignedFacultyAdvisorId);

    document.getElementById('editUserAlert')?.classList.add('hidden');
    document.getElementById('editUserModal')?.classList.remove('hidden');
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Open Assign Faculty Advisor Modal (US07 AC 3 & 4)
async function openAssignAdvisorModal(studentId, studentName, currentAdvisorId) {
  document.getElementById('assignAdvisorStudentId').value = studentId;
  document.getElementById('assignAdvisorStudentName').textContent = studentName;
  document.getElementById('assignAdvisorAlert')?.classList.add('hidden');

  await populateFacultyAdvisorDropdown('assignAdvisorSelect', currentAdvisorId);
  document.getElementById('assignAdvisorModal')?.classList.remove('hidden');
}

// Confirm Toggle Status (Active / Disabled) with Modal (TC_26, TC_27, TC_29, TC_39)
function confirmToggleStatus(userId, userName, currentStatus) {
  const targetStatus = currentStatus === 'Active' ? 'Disabled' : 'Active';
  const actionText = targetStatus === 'Disabled' ? 'deactivate' : 'reactivate';

  pendingAdminAction = {
    type: 'TOGGLE_STATUS',
    userId,
    userName,
    targetStatus
  };

  document.getElementById('confirmAdminActionTitle').textContent = `Confirm Account ${targetStatus === 'Disabled' ? 'Deactivation' : 'Reactivation'}`;
  document.getElementById('confirmAdminActionMsg').textContent = `Are you sure you want to ${actionText} the account for ${userName}? ${targetStatus === 'Disabled' ? 'The user will no longer be able to log in to the portal.' : 'The user will regain access to their institutional account.'}`;

  document.getElementById('confirmAdminActionModal')?.classList.remove('hidden');
}

