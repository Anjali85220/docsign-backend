const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Create necessary upload folders
const uploadsDir = path.join(__dirname, "uploads");
const pdfDir = path.join(uploadsDir, "pdf");
const signedDir = path.join(uploadsDir, "signed");

if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
  console.log("Created folder: uploads/pdf");
}
if (!fs.existsSync(signedDir)) {
  fs.mkdirSync(signedDir, { recursive: true });
  console.log("Created folder: uploads/signed");
}

// Import routes (with fallback safety)
let docRoutes, authRoutes, signatureRoutes, protectedRoutes;

try {
  docRoutes = require("./routes/docRoutes");
} catch (e) {
  console.error("❌ Failed to load docRoutes:", e.message);
}
try {
  authRoutes = require("./routes/authRoutes");
} catch (e) {
  console.error("❌ Failed to load authRoutes:", e.message);
}
try {
  signatureRoutes = require("./routes/signatureRoutes");
} catch (e) {
  console.error("❌ Failed to load signatureRoutes:", e.message);
}
try {
  protectedRoutes = require("./routes/protectedRoutes");
} catch (e) {
  console.warn("⚠️ Skipping optional protectedRoutes:", e.message);
}

// Initialize Express app
const app = express();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "https://docsign-frontend.vercel.app",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/pdf', express.static(path.join(__dirname, 'uploads/pdf')));
app.use('/signed', express.static(path.join(__dirname, 'uploads/signed')));

// API Routes
if (authRoutes) app.use("/api/auth", authRoutes);
if (protectedRoutes) app.use("/api", protectedRoutes);
if (docRoutes) app.use("/api/docs", docRoutes);
if (signatureRoutes) app.use("/api/signatures", signatureRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

// Error middleware
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  });
};

startServer();

// Graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("MongoDB connection closed");
  process.exit(0);
});
