# AcademiaFlow · Student Document Upload & Verification Portal

An enterprise-grade, secure, and intuitive web application designed for academic institutions.

- **User Story US01**: Student Document Upload
- **User Story US02**: Faculty Review, Approval or Rejection

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

## 🧪 Comprehensive Automated Test Suites (80/80 Tests Passing)

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

```
ℹ tests 80 | suites 2 | pass 80 | fail 0 | cancelled 0 | skipped 0 | todo 0
```

---

## 🚀 How to Run Locally

### Run All 80 Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm run test:us01    # Runs 40 tests for US01
npm run test:us02    # Runs 40 tests for US02
```

### Start Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.
