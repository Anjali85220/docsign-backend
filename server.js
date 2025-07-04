const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// Import routes
const docRoutes = require("./routes/docRoutes");
const authRoutes = require("./routes/authRoutes");
const protectedRoutes = require("./routes/protectedRoutes");
const signatureRoutes = require("./routes/signatureRoutes");

// Initialize Express app
const app = express();

// ✅ Allow both localhost and production frontend
const allowedOrigins = [
  "http://localhost:3000",
  "https://docsign-frontend.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/pdf", express.static(path.join(__dirname, "uploads/pdf")));
app.use("/signed", express.static(path.join(__dirname, "uploads/signed")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api", protectedRoutes);
app.use("/api/docs", docRoutes);
app.use("/api/signatures", signatureRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack);
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
