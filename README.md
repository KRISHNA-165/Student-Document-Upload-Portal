# AcademiaFlow · Student Document Upload & Verification Portal

An enterprise-grade, secure, and intuitive web application designed for academic institutions.

- **User Story US01**: Student Document Upload
- **User Story US02**: Faculty Review, Approval or Rejection
- **User Story US03**: Replace Rejected Document
- **User Story US04**: Faculty Submission and Resubmission Notifications & Student Document Tracking

---

## 🎨 Visual Design System (AcademiaFlow & Figma Specs)

The application faithfully implements the Figma design specifications:
- **Landing Page**:
  - Official **AcademiaFlow** branding and Quick Login.
  - Hero Section: *"Student Document Upload & Approval Portal"* with Student, Faculty, and Admin Login CTAs.
  - Interactive 3D perspective flow diagram of the verification lifecycle.
  - **Core Platform Capabilities**: 6 feature cards (Uncompromised Security, Total Transparency, Workflow Efficiency, Centralized Storage, Role-Based Access, Comprehensive Reporting).
  - **The Approval Lifecycle**: 6-step visual workflow (Register &rarr; Fill Details &rarr; Upload &rarr; Review &rarr; Approval &rarr; Archive).
- **Sign In Experience**:
  - Segmented role selector tabs: **`🎓 Student`**, **`👨‍🏫 Faculty`**, **`🛡️ Admin`**.
  - One-click demo credential switching.
- **Student Upload Workspace (US01)**:
  - Form validation with real-time feedback: **Document Title**, **Category**, **Date of Achievement**, **Issuing Organization**.
  - File drag-and-drop & file selector (**PDF, JPG, JPEG, PNG up to 10 MB** with magic byte checking).
  - Validation checklist: Upload button remains disabled until all fields are complete and valid.
  - Double-click guard preventing duplicate submissions.
  - Automatically records upload date/time, sets status to **`Pending Approval`**, and notifies assigned advisor.
  - **My Documents**: View/preview documents inline, download authenticated files, and replace documents while in *Pending Approval*.
- **Faculty Review Panel (US02)**:
  - Matching the exact **Faculty Review Panel** Figma frame:
    - **Header**: Document title with back button.
    - **Student & Metadata Card**: Student Name, Registration Number, Document Title, Category, Issuing Organization, Upload Date & Time, and Status badge.
    - **Document Attachment Preview**: Interactive embedded preview (PDF & Image viewer) with safe error handling if file is missing.
    - **Reviewer Remarks / Feedback**: Textarea for comments (mandatory for rejection, optional for approval).
    - **Decision Buttons**: `Approve Document` and `Reject Document` with confirmation dialogs.
    - **Decision History**: Audit history displaying reviewer name, role, decision, timestamp, and comments.
  - **Review Queue**: Real-time search by student name/ID/title, category filter, status filter, and upload date range.

---

## 📋 US02 Acceptance Criteria Verification

| Requirement | Implementation Details | Status |
|---|---|:---:|
| **Assigned Students Only** | Faculty can view and review documents submitted *only* by their assigned students (unassigned access blocked with 403). | ✅ Passed |
| **Required Display Fields** | Explicitly displays **Student Name**, **Registration Number**, **Document Title**, **Category**, **Upload Date**, and **Current Status**. | ✅ Passed |
| **Document Preview** | Streams file via authorized endpoint (`/api/documents/:id/preview`) with support for PDF, JPG, and PNG. | ✅ Passed |
| **Approve / Reject Decisions** | Faculty can Approve or Reject eligible `Pending Approval` documents. | ✅ Passed |
| **Immediate Status Update** | Document status changes immediately to `Approved` or `Rejected`. | ✅ Passed |
| **Rejection Reason** | Non-empty rejection reason is strictly required before rejecting a submission. | ✅ Passed |
| **Optional Approval Comment** | Approval comments are optional. | ✅ Passed |
| **Student Notification** | Student receives automated notification immediately upon decision with feedback. | ✅ Passed |
| **Review Action Recording** | Reviewer identity, decision action, timestamp, and comments are persisted in review history. | ✅ Passed |

---

## 📋 US03 Acceptance Criteria Verification (Replace Rejected Document)

| Requirement | Implementation Details | Status |
|---|---|:---:|
| **Allowed Only for Rejected Status** | Replacement is restricted strictly to documents with `Rejected` status. Blocked for `Pending Approval` (400) and `Approved` (400). | ✅ Passed |
| **New Replacement File Required** | A newly uploaded replacement file is mandatory for resubmission; submission without a file is blocked with 400. | ✅ Passed |
| **File Format & Size Limits** | Enforces PDF, JPG, JPEG, and PNG formats up to 10 MB maximum with magic byte signature verification. | ✅ Passed |
| **Metadata Update** | Student can update Document Title, Category, Date of Achievement, and Issuing Organization with full validation. | ✅ Passed |
| **Status Transition** | Document status transitions back to `Pending Approval` upon successful resubmission. | ✅ Passed |
| **Timestamp Recording** | Records new upload date and time (`updatedAt` and `resubmittedAt`). | ✅ Passed |
| **Faculty Notification** | Assigned Faculty Advisor receives an automated resubmission notification (`action: 'RESUBMITTED'`). | ✅ Passed |
| **Student Confirmation** | Student receives an automated notification confirming that the resubmission was received. | ✅ Passed |
| **Rejection History Retained** | All previous faculty rejection decisions, timestamps, and feedback reasons are preserved in history. | ✅ Passed |
| **Linkage Preserved** | Replacement updates the existing logical document and remains linked to the student profile (no duplicate records). | ✅ Passed |

---

## 📋 US04 Acceptance Criteria Verification (Faculty Notifications & Student Tracking)

| Requirement | Implementation Details | Status |
|---|---|:---:|
| **New Submission Notification** | Faculty receives an automated notification for every newly submitted student document. | ✅ Passed |
| **Complete Notification Payload** | Contains **Student Name**, **Document Title**, **Category**, and **Submission Date**. | ✅ Passed |
| **Resubmissions Clearly Identified** | Flagged with `isResubmission: true` and `eventType: 'RESUBMISSION'`. | ✅ Passed |
| **Faculty Notification Inbox** | Available via `GET /api/faculty/notifications` with unread counts and recent sorting. | ✅ Passed |
| **Selecting Opens Review** | `GET /api/faculty/notifications/:id/open` marks as read and returns document review data. | ✅ Passed |
| **Unread State by Default** | Newly created notifications are initialized as Unread (`read: false`). | ✅ Passed |
| **Marked Read on Open** | Notifications transition to Read (`read: true`, `readAt: timestamp`) when opened. | ✅ Passed |
| **Student Status Tracking** | Live status tracking (`Pending Approval`, `Approved`, `Rejected`), feedback visibility, filter & search. | ✅ Passed |

---

## 🧪 Comprehensive Automated Test Suites (163/163 Tests Passing)

### 1. US01 Specification Suite (`tests/tc_suite.test.js`)
- **40/40 Tests Passing**: Form presence, field validations, format restrictions (PDF, JPG, PNG vs EXE, DOCX, ZIP), 10 MB limit boundaries, future date checks, whitespace trimming, initial `Pending Approval` status, student profile linkage, view/download/replace, faculty notifications.

### 2. US02 Specification Suite (`tests/tc_us02_suite.test.js`)
- **40/40 Tests Passing**:
  - `TC_01`: Open Faculty Dashboard
  - `TC_02`: View assigned students submissions
  - `TC_03`: Verify student name is displayed
  - `TC_04`: Verify registration number is displayed
  - `TC_05`: Verify document title is displayed
  - `TC_06`: Verify category is displayed
  - `TC_07`: Verify upload date is displayed
  - `TC_08`: Verify current status is displayed
  - `TC_09`: Open a pending document for review
  - `TC_10`: Preview a supported PDF
  - `TC_11`: Preview a supported image
  - `TC_12`: Handle a missing file reference
  - `TC_13`: Approve a pending document
  - `TC_14`: Approve with an optional comment
  - `TC_15`: Approve without a comment
  - `TC_16`: Reject with a reason
  - `TC_17`: Prevent rejection without a reason
  - `TC_18`: Cancel approval confirmation
  - `TC_19`: Cancel rejection confirmation
  - `TC_20`: Update status immediately after approval
  - `TC_21`: Update status immediately after rejection
  - `TC_22`: Record reviewer identity
  - `TC_23`: Record review date and time automatically
  - `TC_24`: Prevent unauthorized faculty review
  - `TC_25`: Prevent student from using faculty review actions
  - `TC_26`: Prevent admin-only action by faculty
  - `TC_27`: Review only Pending Approval documents in pending queue
  - `TC_28`: Verify approved document leaves pending queue
  - `TC_29`: Verify rejected document leaves pending queue
  - `TC_30`: Prevent conflicting repeated decision
  - `TC_31`: Search pending reviews by student name
  - `TC_32`: Filter reviews by category
  - `TC_33`: Filter reviews by upload date range
  - `TC_34`: Handle unavailable review data with friendly error
  - `TC_35`: Prevent double-click duplicate approval
  - `TC_36`: Notify student after approval
  - `TC_37`: Notify student after rejection with feedback
  - `TC_38`: Save review comments accurately
  - `TC_39`: Maintain review history after decision
  - `TC_40`: Handle save failure during review

### 3. US03 Specification Suite (`tests/tc_us03_suite.test.js`)
- **40/40 Tests Passing**:
  - `TC_01`: Display Replace option for rejected document
  - `TC_02`: Hide Replace option for approved document
  - `TC_03`: Display rejection feedback
  - `TC_04`: Open resubmission form
  - `TC_05`: Pre-fill existing document metadata
  - `TC_06`: Replace with a valid PDF
  - `TC_07`: Replace with a valid JPG
  - `TC_08`: Replace with a valid PNG
  - `TC_09`: Reject unsupported replacement file
  - `TC_10`: Reject replacement file above size limit
  - `TC_11`: Require replacement file when needed
  - `TC_12`: Require valid document title
  - `TC_13`: Require document category
  - `TC_14`: Require issuing organization
  - `TC_15`: Validate achievement date
  - `TC_16`: Preserve existing document linkage
  - `TC_17`: Update document to Pending Approval
  - `TC_18`: Show resubmission success message
  - `TC_19`: Update modified/resubmission timestamp
  - `TC_20`: Notify faculty about resubmission
  - `TC_21`: Notify student that resubmission was received
  - `TC_22`: Retain rejection history
  - `TC_23`: Prevent duplicate resubmission on double-click
  - `TC_24`: Cancel replacement before submitting
  - `TC_25`: Confirm replacement if confirmation is required
  - `TC_26`: Cancel replacement confirmation
  - `TC_27`: Prevent replacing a document under review
  - `TC_28`: Prevent unauthorized replacement (Student A vs Student B)
  - `TC_29`: Prevent faculty from replacing student file
  - `TC_30`: Handle missing original document
  - `TC_31`: Handle replacement upload network failure
  - `TC_32`: Handle server failure while saving replacement
  - `TC_33`: Verify replacement file can be previewed
  - `TC_34`: Verify replacement file can be downloaded
  - `TC_35`: Verify old file is not shown as current
  - `TC_36`: Verify faculty sees latest resubmission
  - `TC_37`: Verify resubmission appears in student list
  - `TC_38`: Verify document title after replacement
  - `TC_39`: Verify category after replacement
  - `TC_40`: Prevent replacement of another user's file through direct request

### 4. US04 Specification Suite (`tests/tc_us04_suite.test.js`)
- **43/43 Tests Passing**:
  - `TC_01`: Open My Documents page
  - `TC_02`: Display uploaded documents
  - `TC_03`: Display document title
  - `TC_04`: Display document category
  - `TC_05`: Display submission date
  - `TC_06`: Display Pending Approval status
  - `TC_07`: Display Approved status
  - `TC_08`: Display Rejected status
  - `TC_09`: Open document details
  - `TC_10`: Display faculty feedback for rejected document
  - `TC_11`: Hide rejection feedback for unrelated document
  - `TC_12`: Filter documents by Pending Approval
  - `TC_13`: Filter documents by Approved
  - `TC_14`: Filter documents by Rejected
  - `TC_15`: Clear status filter
  - `TC_16`: Search by exact document title
  - `TC_17`: Search by partial document title
  - `TC_18`: Search with no matching title
  - `TC_19`: Search is case-insensitive where supported
  - `TC_20`: Handle blank search input
  - `TC_21`: Sort documents by newest first
  - `TC_22`: Sort documents by oldest first
  - `TC_23`: Verify status after faculty approval
  - `TC_24`: Verify status after faculty rejection
  - `TC_25`: Verify status after resubmission
  - `TC_26`: Refresh status after page reload
  - `TC_27`: Verify dashboard status counts
  - `TC_28`: Open document preview from list
  - `TC_29`: Download a listed document
  - `TC_30`: Display empty state for no documents
  - `TC_31`: Prevent viewing another student's status
  - `TC_32`: Verify status label consistency
  - `TC_33`: Verify status color/visual indicator
  - `TC_34`: Handle unavailable document record
  - `TC_35`: Handle status service/network error
  - `TC_36`: Prevent duplicate document rows
  - `TC_37`: Display status update timestamp if supported
  - `TC_38`: Verify student notification matches status
  - `TC_39`: Verify document list pagination or scrolling
  - `TC_40`: Verify status tracking after logout and login
  - `US04_A01`: Faculty receives notification with student name, title, category, date
  - `US04_A02`: Resubmissions clearly identified in notification
  - `US04_A03`: Opening notification marks as Read and returns review details

```
ℹ tests 163 | suites 4 | pass 163 | fail 0 | cancelled 0 | skipped 0 | todo 0
```

---

## 🚀 How to Run Locally

### Run All 163 Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm run test:us01    # Runs 40 tests for US01
npm run test:us02    # Runs 40 tests for US02
npm run test:us03    # Runs 40 tests for US03
npm run test:us04    # Runs 43 tests for US04
```

### Start Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.
