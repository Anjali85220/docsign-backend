const express = require("express");
const upload = require("../middleware/uploadMiddleware");
const Document = require("../models/Document");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.post("/upload", authMiddleware, upload.single("pdf"), async (req, res) => {
  try {
    const doc = new Document({
      originalName: req.file.originalname,
      filePath: req.file.path,
      uploadedBy: req.user.id,
    });

    await doc.save();
    res.status(201).json({ message: "File uploaded", doc });
  } catch (err) {
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});
// GET /api/docs/:id
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ message: "Error fetching document", error: err.message });
  }
});
// GET /api/docs — Get all files uploaded by logged-in user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const docs = await Document.find({ uploadedBy: req.user.id }).sort({ createdAt: -1 });
    res.json({ docs });
  } catch (err) {
    res.status(500).json({ message: "Error fetching documents", error: err.message });
  }
});
// DELETE /api/docs/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    // ✅ Fix: Check if uploadedBy exists before toString
    if (!doc.uploadedBy || doc.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized to delete this document" });
    }

    // Delete file from filesystem
    const fs = require("fs");
    fs.unlink(doc.filePath, (err) => {
      if (err) console.warn("File not found or already deleted:", err.message);
    });

    await doc.deleteOne();
    res.json({ message: "Document deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err.message);
    res.status(500).json({ message: "Failed to delete document", error: err.message });
  }
});

module.exports = router;
