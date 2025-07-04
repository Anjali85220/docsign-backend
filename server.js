const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Initialize Express app
const app = express();

// ✅ Ensure uploads folders exist
const uploadsDir = path.join(__dirname, "uploads");
const pdfDir = path.join(uploadsDir, "pdf");
const signedDir = path.join(uploadsDir, "signed");

if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
  console.log("📁 Created uploads/pdf");
}
if (!fs.existsSync(signedDir)) {
  fs.mkdirSync(signedDir, { recursive: true });
  console.log("📁 Created uploads/signed");
}

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "https://docsign-frontend.vercel.app",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/pdf", express.static(path.join(__dirname, "uploads/pdf")));
app.use("/signed", express.static(path.join(__dirname, "uploads/signed")));

// ✅ Import routes safely
let docRoutes = null;
let authRoutes = null;
let signatureRoutes = null;
let protectedRoutes = null;

try {
  docRoutes = require("./routes/docRoutes");
  authRoutes = require("./routes/authRoutes");
  signatureRoutes = require("./routes/signatureRoutes");
  protectedRoutes = require("./routes/protectedRoutes");
} catch (err) {
  console.error("❌ Error loading routes:", err.message);
}

// ✅ Use routes only if they're valid functions
if (authRoutes && typeof authRoutes === "function") app.use("/api/auth", authRoutes);
if (protectedRoutes && typeof protectedRoutes === "function") app.use("/api", protectedRoutes);
if (docRoutes && typeof docRoutes === "function") app.use("/api/docs", docRoutes);
if (signatureRoutes && typeof signatureRoutes === "function") app.use("/api/signatures", signatureRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err.stack);
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
  console.log("🔌 MongoDB connection closed");
  process.exit(0);
});
