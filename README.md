# AcademiaFlow · Student Document Upload & Verification Portal
## User Story US01: Student Document Upload

An enterprise-grade, secure, and intuitive web application designed for academic institutions to allow students to upload achievement certificates and internship documents, store them securely in private storage, and submit them for Faculty Advisor verification.

---

## 🎨 Visual Design & Architecture

The application design matches the **AcademiaFlow** institutional design system:
- **Landing Page**:
  - Header with official **AcademiaFlow** branding and Quick Login.
  - Hero Section: *"Student Document Upload & Approval Portal"* with Student, Faculty, and Admin Login CTAs.
  - Interactive 3D perspective flow diagram of the verification lifecycle.
  - **Core Platform Capabilities**: 6 modular feature cards detailing Uncompromised Security, Total Transparency, Workflow Efficiency, Centralized Storage, Role-Based Access, and Comprehensive Reporting.
  - **The Approval Lifecycle**: 6-step visual path (Register &rarr; Fill Details &rarr; Upload &rarr; Review &rarr; Approval &rarr; Archive).
- **Sign In Experience**:
  - Institutional login modal matching the exact design with segmented role pills: **`🎓 Student`**, **`👨‍🏫 Faculty`**, **`🛡️ Admin`**.
  - Direct persona switching for seamless demonstration.
- **Student Upload Workspace (US01)**:
  - Form validation with real-time feedback: **Document Title**, **Category**, **Date of Achievement**, **Issuing Organization**.
  - File drag-and-drop & file selector (PDF, JPG, JPEG, PNG up to 10 MB).
  - Validation checklist: Upload button remains strictly disabled until all fields are complete and valid.
  - Double-submission guard preventing duplicate submissions on rapid clicks.
  - Document status automatically assigned as **`Pending Approval`**.
  - Automatic timestamping and linkage to student profile.
- **Document Management**:
  - **My Documents**: View/preview documents inline (PDF iframe / image modal), download authenticated files, and replace documents while in *Pending Approval* state.
- **Faculty Advisor Portal**:
  - Real-time notification inbox: Faculty Advisors receive instant notifications upon student uploads.
  - Submissions review list.
- **System Audit Log**:
  - Immutable audit trail recording upload and replacement actions.

---

## 📋 Acceptance Criteria Verification

| Requirement | Implementation Details | Status |
|---|---|:---:|
| **Allowed File Types** | Accepts **PDF, JPG, JPEG, and PNG** files only. Rejects EXE, DOCX, ZIP, etc. Validates both extension and file magic bytes signatures (`%PDF-`, `FF D8 FF`, `89 50 4E 47`). | ✅ Passed |
| **Maximum File Size** | Strict **10 MB limit** (10,485,760 bytes). Files exceeding 10 MB are rejected with clear error communication; files exactly at 10 MB are accepted. | ✅ Passed |
| **Mandatory Fields** | `Document Title`, `Category`, `Date of Achievement`, `Issuing Organization`, and document `file` are all required. | ✅ Passed |
| **Upload Button State** | Upload button remains disabled until all mandatory fields are valid. Becomes enabled once complete. | ✅ Passed |
| **Initial Status** | Automatically set to **`Pending Approval`**. | ✅ Passed |
| **Timestamping** | Upload date and time are recorded automatically at the moment of submission. | ✅ Passed |
| **View / Download / Replace** | Student can preview inline, download authorized file, or replace document while in permitted status. | ✅ Passed |
| **Faculty Notification** | Assigned Faculty Advisor receives an automated notification upon document submission. | ✅ Passed |
| **Student Profile Linkage** | Document record remains associated with the student profile (`studentId`, `studentName`). | ✅ Passed |

---

## 🧪 Automated Test Suite (TC_01 to TC_40)

All 40 formal test cases specified in the test catalog are fully implemented and passing:

```
▶ US01 - Student Document Upload Specification Tests (TC_01 to TC_40)
  ✔ TC_01: Validate upload form opens (Upload form displayed with all required fields)
  ✔ TC_02: Validate Document Title field is present
  ✔ TC_03: Validate Category field is present
  ✔ TC_04: Validate Date of Achievement field is present
  ✔ TC_05: Validate Issuing Organization field is present
  ✔ TC_06: Upload a valid PDF file
  ✔ TC_07: Upload a valid JPG file
  ✔ TC_08: Upload a valid JPEG file
  ✔ TC_09: Upload a valid PNG file
  ✔ TC_10: Reject an unsupported EXE file
  ✔ TC_11: Reject an unsupported DOCX file
  ✔ TC_12: Reject an unsupported ZIP file
  ✔ TC_13: Reject file exceeding 10 MB (12 MB file rejected with 10 MB limit feedback)
  ✔ TC_14: Accept file at configured 10 MB limit (exact 10 * 1024 * 1024 bytes)
  ✔ TC_15: Reject empty Document Title
  ✔ TC_16: Reject empty Category
  ✔ TC_17: Reject empty Date of Achievement
  ✔ TC_18: Reject empty Issuing Organization
  ✔ TC_19: Reject submission with all required fields empty
  ✔ TC_20: Keep Upload disabled until fields are complete
  ✔ TC_21: Enable Upload after required fields are complete
  ✔ TC_22: Reject future achievement date if disallowed
  ✔ TC_23: Accept a valid past achievement date (2024-06-15)
  ✔ TC_24: Handle invalid date input (e.g. 2024-15-40)
  ✔ TC_25: Accept a long but valid document title
  ✔ TC_26: Trim whitespace-only title and block upload
  ✔ TC_27: Trim whitespace around organization name cleanly
  ✔ TC_28: Upload certificate with special characters in title
  ✔ TC_29: Upload achievement certificate category
  ✔ TC_30: Upload internship document category
  ✔ TC_31: Prevent double submission on repeated click
  ✔ TC_32: Show upload success confirmation
  ✔ TC_33: Set initial status to Pending Approval
  ✔ TC_34: Record upload date and time automatically
  ✔ TC_35: Link uploaded document to student profile
  ✔ TC_36: Show uploaded document in document list
  ✔ TC_37: Allow viewing uploaded document when permitted
  ✔ TC_38: Allow downloading uploaded document when permitted
  ✔ TC_39: Allow replacing document only when permitted (in Pending Approval status)
  ✔ TC_40: Notify Faculty Advisor after upload

ℹ tests 40 | suites 1 | pass 40 | fail 0
```

---

## 🚀 How to Run

### 1. Run the Automated Test Suite
```bash
npm test
```

### 2. Start the Application Server
```bash
npm start
```
The application will be accessible at:
```
http://localhost:3000
```

### 3. Exploring Personas
- **Student Persona**: `John Doe (STU-2024-001)` — Uploads documents, tracks Pending Approval status, views/downloads/replaces certificates.
- **Faculty Advisor Persona**: `Dr. Robert Smith (FAC-101)` — Receives automated submission notifications and reviews student records.
- **Admin Persona**: `Administrator` — Views system security audit trails and platform logs.

