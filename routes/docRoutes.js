const express = require("express");
const upload = require("../middleware/uploadMiddleware");
const Document = require("../models/Document");
const authMiddleware = require("../middleware/auth");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const router = express.Router();

// Helper function to determine image format from data URL
const getImageFormat = (dataUrl) => {
  if (dataUrl.startsWith('data:image/png')) return 'png';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'jpeg';
  if (dataUrl.startsWith('data:image/gif')) return 'gif';
  // Default to png if can't determine
  return 'png';
};

// Helper function to generate signed PDF
const generateSignedPdf = async (filePath, signatures) => {
  try {
    // Read the original PDF
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Register fontkit for text rendering
    pdfDoc.registerFontkit(fontkit);
    
    // Embed standard fonts
    const helveticaFont = await pdfDoc.embedFont('Helvetica');

    // Add signatures to each page
    const pages = pdfDoc.getPages();
    
    for (const signature of signatures) {
      if (signature.page <= pages.length) {
        const page = pages[signature.page - 1];
        const { width, height } = page.getSize();
        
        // Use the exact coordinates from the frontend
        const pdfX = signature.x;
        const pdfY = signature.y;

        if (signature.signatureType === 'image' && signature.signature) {
          try {
            // Extract base64 data from data URL
            const base64Data = signature.signature.split(',')[1];
            const imageBytes = Buffer.from(base64Data, 'base64');
            
            // Determine image format
            const imageFormat = getImageFormat(signature.signature);
            
            let image;
            if (imageFormat === 'png') {
              image = await pdfDoc.embedPng(imageBytes);
            } else if (imageFormat === 'jpeg') {
              image = await pdfDoc.embedJpg(imageBytes);
            } else {
              // For other formats, try PNG first, then JPEG
              try {
                image = await pdfDoc.embedPng(imageBytes);
              } catch (pngError) {
                try {
                  image = await pdfDoc.embedJpg(imageBytes);
                } catch (jpgError) {
                  throw new Error('Unsupported image format');
                }
              }
            }
            
            // Scale the image appropriately
            const maxWidth = 150;
            const maxHeight = 60;
            const imageWidth = image.width;
            const imageHeight = image.height;
            
            // Calculate scale to fit within max dimensions
            const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
            const scaledWidth = imageWidth * scale;
            const scaledHeight = imageHeight * scale;
            
            page.drawImage(image, {
              x: pdfX,
              y: pdfY - scaledHeight, // Adjust for image height
              width: scaledWidth,
              height: scaledHeight,
            });
            
            console.log(`Successfully embedded ${imageFormat} image at (${pdfX}, ${pdfY})`);
            
          } catch (imageError) {
            console.error("Error embedding image:", imageError);
            console.log("Falling back to text signature");
            // Fallback to text signature
            page.drawText('[SIGNED]', {
              x: pdfX,
              y: pdfY,
              size: 12,
              font: helveticaFont,
              color: rgb(0, 0, 0),
            });
          }
        } else if (signature.signatureType === 'text') {
          page.drawText(signature.signature, {
            x: pdfX,
            y: pdfY,
            size: 12,
            font: helveticaFont,
            color: rgb(0, 0, 0),
          });
        } else {
          // Handle drawing signatures (canvas data)
          try {
            const base64Data = signature.signature.split(',')[1];
            const imageBytes = Buffer.from(base64Data, 'base64');
            
            // Canvas data is usually PNG
            const image = await pdfDoc.embedPng(imageBytes);
            
            // Scale the image appropriately
            const maxWidth = 150;
            const maxHeight = 60;
            const imageWidth = image.width;
            const imageHeight = image.height;
            
            const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
            const scaledWidth = imageWidth * scale;
            const scaledHeight = imageHeight * scale;
            
            page.drawImage(image, {
              x: pdfX,
              y: pdfY - scaledHeight,
              width: scaledWidth,
              height: scaledHeight,
            });
            
            console.log(`Successfully embedded drawn signature at (${pdfX}, ${pdfY})`);
            
          } catch (drawError) {
            console.error("Error embedding drawn signature:", drawError);
            page.drawText('[SIGNED]', {
              x: pdfX,
              y: pdfY,
              size: 12,
              font: helveticaFont,
              color: rgb(0, 0, 0),
            });
          }
        }
      }
    }

    return await pdfDoc.save();
  } catch (error) {
    console.error("Error generating signed PDF:", error);
    throw error;
  }
};

// Serve signed PDF files
router.get("/file/:filename", authMiddleware, async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../../uploads/signed', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    // Verify the user has access to this file
    const doc = await Document.findOne({ 
      $or: [
        { filePath: { $regex: filename } },
        { signedFilePath: { $regex: filename } }
      ],
      uploadedBy: req.user.id
    });

    if (!doc) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("Error serving file:", err);
    res.status(500).json({ message: "Error serving file", error: err.message });
  }
});

// Mark document as signed (generate signed PDF)
router.put("/:id/complete", authMiddleware, async (req, res) => {
  try {
    const { signatures, pdfWidth, pdfHeight } = req.body;
    const doc = await Document.findById(req.params.id);

    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized to update this document" });
    }

    // Add PDF dimensions to each signature
    const signaturesWithDimensions = signatures.map(sig => ({
      ...sig,
      pageWidth: pdfWidth,
      pageHeight: pdfHeight
    }));

    console.log("Processing signatures:", signaturesWithDimensions.length);

    // 1. Generate signed PDF
    const signedPdfBytes = await generateSignedPdf(doc.filePath, signaturesWithDimensions);
    
    // 2. Save the signed PDF
    const signedDir = path.join(__dirname, '../uploads/signed');
    if (!fs.existsSync(signedDir)) {
      fs.mkdirSync(signedDir, { recursive: true });
    }

    const signedFileName = `signed_${Date.now()}_${path.basename(doc.filePath)}`;
    const signedPathRelative = path.join('uploads', 'signed', signedFileName);
    const signedPath = path.join(__dirname, '../', signedPathRelative);

    fs.writeFileSync(signedPath, signedPdfBytes);

    // 3. Update document
    const updatedDoc = await Document.findByIdAndUpdate(
      req.params.id,
      { 
        signatures: signaturesWithDimensions,
        signedFilePath: signedPathRelative,
        status: "completed",
        signed: true,
        updatedAt: Date.now()
      },
      { new: true }
    );

    console.log("Document signed successfully, file saved at:", signedPath);

    res.json({ 
      message: "Document signed successfully", 
      doc: updatedDoc,
      signedFilePath: signedPathRelative
    });
  } catch (err) {
    console.error("Error completing document:", err);
    res.status(500).json({ message: "Failed to complete document", error: err.message });
  }
});

router.post("/upload", authMiddleware, upload.single("pdf"), async (req, res) => {
  try {
    const doc = new Document({
      originalName: req.file.originalname,
      filePath: req.file.path,
      uploadedBy: req.user.id,
      status: "pending"
    });

    await doc.save();
    res.status(201).json({ message: "File uploaded", doc });
  } catch (err) {
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// Get all documents for user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const docs = await Document.find({ uploadedBy: req.user.id }).sort({ createdAt: -1 });
    res.json({ docs });
  } catch (err) {
    res.status(500).json({ message: "Error fetching documents", error: err.message });
  }
});

// Get single document by ID
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    if (doc.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    res.json({ doc });
  } catch (err) {
    res.status(500).json({ message: "Error fetching document", error: err.message });
  }
});

// Delete document by ID
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    if (doc.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized to delete this document" });
    }

    // Delete original and signed file if they exist
    [doc.filePath, doc.signedFilePath].forEach(file => {
      if (file) {
        const fullPath = path.join(__dirname, '../', file);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    });

    await doc.deleteOne();
    res.json({ message: "Document deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete document", error: err.message });
  }
});

module.exports = router;