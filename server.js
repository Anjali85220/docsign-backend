const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const docRoutes = require("./routes/docRoutes.js");
const authRoutes = require("./routes/authRoutes");
const protectedRoutes = require("./routes/protectedRoutes"); // Optional

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ✅ Serve uploaded PDFs statically
app.use("/uploads", express.static("uploads"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", protectedRoutes); // Optional
app.use("/api/docs", docRoutes);

const PORT = process.env.PORT || 5000;

// DB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log("MongoDB connected");
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})
.catch(err => console.error("MongoDB connection error:", err));
