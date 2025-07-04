const express = require("express");
const upload = require("../middleware/uploadMiddleware");
const Document = require("../models/Document");
const authMiddleware = require("../middleware/auth");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const router = express.Router();

// Security middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    res.status(429).json({
      error: "Too many requests, please try again later."
    });
  }
});

// Apply security middleware
router.use(helmet());
router.use(limiter);

// Helper: Determine image format
const getImageFormat = (dataUrl) => {
  if (dataUrl.startsWith("data:image/png")) return "png";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "jpeg";
  return "png";
};

// Helper: Generate signed PDF with proper error handling
const generateSignedPdf = async (filePath, signatures) => {
  try {
    const absolutePath = path.join(__dirname, "../uploads", filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error("PDF file not found");
    }

    const pdfBytes = fs.readFileSync(absolutePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.registerFontkit(fontkit);
    const helveticaFont = await pdfDoc.embedFont("Helvetica");
    const pages = pdfDoc.getPages();

    for (const signature of signatures) {
      if (signature.page <= 0 || signature.page > pages.length) {
        throw new Error(`Invalid page number: ${signature.page}`);
      }

      const page = pages[signature.page - 1];
      const pdfX = signature.x;
      const pdfY = signature.y;

      try {
        if (signature.signatureType === "text") {
          page.drawText(signature.signature, {
            x: pdfX,
            y: pdfY,
            size: 12,
            font: helveticaFont,
            color: rgb(0, 0, 0),
          });
        } else if (["image", "draw"].includes(signature.signatureType)) {
          const base64Data = signature.signature?.split(",")[1];
          if (!base64Data) {
            throw new Error("Invalid signature data");
          }

          const imageBytes = Buffer.from(base64Data, "base64");
          const format = getImageFormat(signature.signature);
          const image = format === "jpeg"
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
        }
      } catch (error) {
        console.error("Signature render error:", error.message);
        page.drawText("[SIGNED]", {
          x: pdfX,
          y: pdfY,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
      }
    }

    return await pdfDoc.save();
  } catch (err) {
    console.error("PDF Generation Error:", err.message);
    throw err;
  }
};

// Middleware to validate document ownership
const validateDocumentOwner = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }
    if (doc.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized to access this document" });
    }
    req.document = doc;
    next();
  } catch (err) {
    next(err);
  }
};

// Routes
router.post("/upload", authMiddleware, upload.single("pdf"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No PDF file uploaded" });
    }

    const newDoc = new Document({
      originalName: req.file.originalname,
      filePath: `/uploads/pdf/${req.file.filename}`,
      uploadedBy: req.user.id,
      size: req.file.size,
      mimeType: req.file.mimetype
    });

    await newDoc.save();
    res.status(201).json({ 
      message: "Uploaded successfully", 
      doc: newDoc,
      size: newDoc.size,
      type: newDoc.mimeType 
    });
  } catch (err) {
    next(err);
  }
});

router.put("/:id/complete", authMiddleware, validateDocumentOwner, async (req, res, next) => {
  try {
    const { signatures, pdfWidth, pdfHeight } = req.body;
    
    if (!signatures || !Array.isArray(signatures)) {
      return res.status(400).json({ 
        message: "Invalid signatures provided" 
      });
    }

    const signaturesWithSize = signatures.map((sig) => ({
      ...sig,
      pageWidth: pdfWidth,
      pageHeight: pdfHeight,
    }));

    const signedBytes = await generateSignedPdf(req.document.filePath, signaturesWithSize);
    const signedFileName = `signed_${Date.now()}_${path.basename(req.document.filePath)}`;
    const signedFilePath = `signed/${signedFileName}`;
    const signedFullPath = path.join(__dirname, "../uploads", signedFilePath);

    // Create signed directory if it doesn't exist
    const signedDir = path.join(__dirname, "../uploads/signed");
    if (!fs.existsSync(signedDir)) {
      fs.mkdirSync(signedDir, { recursive: true });
    }

    fs.writeFileSync(signedFullPath, signedBytes);

    req.document.signatures = signaturesWithSize;
    req.document.signedFilePath = signedFilePath;
    req.document.status = "completed";
    req.document.signed = true;
    req.document.updatedAt = Date.now();

    await req.document.save();

    res.json({
      message: "Document signed successfully",
      doc: req.document,
      signedFilePath,
      size: signedBytes.length
    });
  } catch (err) {
    next(err);
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
