const express = require("express");
const upload = require("../middleware/uploadMiddleware");
const Document = require("../models/Document");
const authMiddleware = require("../middleware/auth");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

const router = express.Router();

// Helper: Determine image format
const getImageFormat = (dataUrl) => {
  if (dataUrl.startsWith("data:image/png")) return "png";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "jpeg";
  return "png";
};

// Helper: Generate signed PDF
const generateSignedPdf = async (filePath, signatures) => {
  try {
    const absolutePath = path.join(__dirname, "../uploads", filePath);
    const pdfBytes = fs.readFileSync(absolutePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.registerFontkit(fontkit);
    const helveticaFont = await pdfDoc.embedFont("Helvetica");
    const pages = pdfDoc.getPages();

    for (const signature of signatures) {
      if (signature.page <= pages.length) {
        const page = pages[signature.page - 1];
        const pdfX = signature.x;
        const pdfY = signature.y;

        try {
          const base64Data = signature.signature?.split(",")[1];
          const imageBytes = Buffer.from(base64Data, "base64");
          let image = null;

          if (["image", "draw"].includes(signature.signatureType)) {
            const format = getImageFormat(signature.signature);
            image = format === "jpeg"
              ? await pdfDoc.embedJpg(imageBytes)
              : await pdfDoc.embedPng(imageBytes);

            const maxWidth = 150;
            const maxHeight = 60;
            const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
            const scaledWidth = image.width * scale;
            const scaledHeight = image.height * scale;

            page.drawImage(image, {
              x: pdfX,
              y: pdfY - scaledHeight,
              width: scaledWidth,
              height: scaledHeight,
            });
          } else if (signature.signatureType === "text") {
            page.drawText(signature.signature, {
              x: pdfX,
              y: pdfY,
              size: 12,
              font: helveticaFont,
              color: rgb(0, 0, 0),
            });
          }
        } catch (error) {
          console.error("Signature render fallback:", error.message);
          page.drawText("[SIGNED]", {
            x: pdfX,
            y: pdfY,
            size: 12,
            font: helveticaFont,
            color: rgb(0, 0, 0),
          });
        }
      }
    }

    return await pdfDoc.save();
  } catch (err) {
    console.error("PDF Generation Error:", err.message);
    throw err;
  }
};

router.post("/upload", authMiddleware, upload.single("pdf"), async (req, res) => {
  try {
    const newDoc = new Document({
      originalName: req.file.originalname,
      filePath: `/uploads/pdf/${req.file.filename}`,
      userId: req.user.id,
    });
    await newDoc.save();
    res.status(201).json({ message: "Uploaded successfully", doc: newDoc });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// ✅ Sign Document
router.put("/:id/complete", authMiddleware, async (req, res) => {
  try {
    const { signatures, pdfWidth, pdfHeight } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.uploadedBy.toString() !== req.user.id)
      return res.status(403).json({ message: "Unauthorized" });

    const signaturesWithSize = signatures.map((sig) => ({
      ...sig,
      pageWidth: pdfWidth,
      pageHeight: pdfHeight,
    }));

    const signedBytes = await generateSignedPdf(doc.filePath, signaturesWithSize);

    const signedFileName = `signed_${Date.now()}_${path.basename(doc.filePath)}`;
    const signedFilePath = `signed/${signedFileName}`;
    const signedFullPath = path.join(__dirname, "../uploads", signedFilePath);
    fs.writeFileSync(signedFullPath, signedBytes);

    doc.signatures = signaturesWithSize;
    doc.signedFilePath = signedFilePath;
    doc.status = "completed";
    doc.signed = true;
    doc.updatedAt = Date.now();
    await doc.save();

    res.json({
      message: "Document signed successfully",
      doc,
      signedFilePath,
    });
  } catch (err) {
    console.error("Sign PDF Error:", err.message);
    res.status(500).json({ message: "Failed to complete document", error: err.message });
  }
});

// 📥 Get All Documents
router.get("/", authMiddleware, async (req, res) => {
  try {
    const docs = await Document.find({ uploadedBy: req.user.id }).sort({ createdAt: -1 });
    res.json({ docs });
  } catch (err) {
    res.status(500).json({ message: "Error fetching documents", error: err.message });
  }
});

// 📄 Get Single Document
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.uploadedBy.toString() !== req.user.id)
      return res.status(403).json({ message: "Unauthorized access" });

    res.json({ doc });
  } catch (err) {
    res.status(500).json({ message: "Error fetching document", error: err.message });
  }
});

// 🗑 Delete Document
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.uploadedBy.toString() !== req.user.id)
      return res.status(403).json({ message: "Unauthorized to delete this document" });

    [doc.filePath, doc.signedFilePath].forEach((file) => {
      if (file) {
        const fullPath = path.join(__dirname, "../uploads", file);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      }
    });

    await doc.deleteOne();
    res.json({ message: "Document deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete document", error: err.message });
  }
});

module.exports = router;
