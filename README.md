# 🛠️ DocSign Backend

This is the **Express + MongoDB** backend for the DocSign digital signature application. It handles user authentication and will support PDF upload, signing, audit logging, and sharing.

## 🔧 Tech Stack

- Node.js
- Express.js
- MongoDB + Mongoose
- JSON Web Token (JWT)
- bcryptjs
- dotenv
- Multer (for PDF uploads)
- PDF-Lib (for embedding signatures)
- IP (for audit trail logging)
- CORS

## ✅ Completed Features

### 🔐 Authentication
- [x] User registration and login
- [x] Secure password hashing with bcrypt
- [x] JWT token generation
- [x] Auth middleware to protect routes

### 📂 Document Upload
- [x] PDF upload using Multer
- [x] Store file metadata (filename, path, owner)
- [x] Fetch all documents for a user
- [x] Serve PDF files from `/uploads`

### ✍️ Signature & Placement
- [x] Save signature data: coordinates, type (draw, upload, typed), and user ID
- [x] Embed visual signatures on the PDF using `pdf-lib`
- [x] Confirm signature before finalization
- [x] Generate downloadable signed PDF

### 📜 Audit Trail
- [x] Log who signed (user only)
- [x] Timestamp of signature
- [x] IP address of signer
- [x] Store audit log in MongoDB for each document

---

## 📁 Folder Structure

backend/
├── controllers/
│ ├── authController.js
│ ├── documentController.js
│ └── signatureController.js
├── middleware/
│ ├── auth.js
│ └── auditLogger.js
├── models/
│ ├── User.js
│ ├── Document.js
│ ├── Signature.js
│ └── AuditLog.js
├── routes/
│ ├── authRoutes.js
│ ├── documentRoutes.js
│ └── signatureRoutes.js
├── uploads/
│ └── signed/
├── .env
├── server.js
└── package.json

yaml
Copy
Edit


## 🖼️ API Screenshots

### 🔐 Register API (POST `/api/auth/register`)

![Register API](./screenshots/register-api.png)

---

### 🔐 Login API (POST `/api/auth/login`)

![Login API](./screenshots/login-api.png)

---

## 🧪 Environment Variables

Create a `.env` file:

