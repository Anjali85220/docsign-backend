const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const Document = require("../models/Document");
const authMiddleware = require("../middleware/auth");
const { PDFDocument } = require('pdf-lib');

// Helper function to add annotations to PDF
const addAnnotationsToPdf = async (filePath, annotations) => {
  try {
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    const pages = pdfDoc.getPages();
    annotations.forEach(annotation => {
      if (annotation.page <= pages.length) {
        const page = pages[annotation.page - 1];
        // Implement your annotation rendering logic here
        // This is a simplified example
        page.drawText(annotation.text || 'SIGNED', {
          x: annotation.x,
          y: annotation.y,
          size: 12,
        });
      }
    });
    
    return await pdfDoc.save();
  } catch (error) {
    console.error("Error adding annotations to PDF:", error);
    throw error;
  }
};

// POST /api/docs/:id/sign
router.post("/:id/sign", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { annotations } = req.body;

  try {
    const doc = await Document.findById(id);

    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    if (doc.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // 1. Generate signed PDF with annotations
    const signedPdfBytes = await addAnnotationsToPdf(doc.filePath, annotations);
    
    // 2. Save the signed PDF
    const signedDir = path.join(__dirname, "../uploads/signed");
    if (!fs.existsSync(signedDir)) {
      fs.mkdirSync(signedDir, { recursive: true });
    }

    const signedFileName = `signed_${Date.now()}_${doc.originalName}`;
    const signedPathRelative = `uploads/signed/${signedFileName}`;
    const signedPath = path.join(__dirname, "../", signedPathRelative);

    fs.writeFileSync(signedPath, signedPdfBytes);

    // 3. Update document
    doc.annotations = annotations;
    doc.signed = true;
    doc.status = "completed";
    doc.signedFilePath = signedPathRelative;
    await doc.save();

    res.json({ 
  message: "Signatures saved successfully", 
  doc,
  signedPdfUrl: `https://docsign-backend.onrender.com/uploads/signed/${signedFileName}` // ✅ Correct public path
});

  } catch (error) {
    console.error("Error saving annotations:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;