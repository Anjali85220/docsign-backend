const mongoose = require("mongoose");

const signatureSchema = new mongoose.Schema({
  x: Number,
  y: Number,
  page: Number,
  signature: String, // base64 or plain text
  signatureType: {
    type: String,
    enum: ["text", "image", "draw"],
    required: true
  },
  signed: { type: Boolean, default: false },
  fixed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const documentSchema = new mongoose.Schema(
  {
    originalName: String,
    filePath: String,
    signedFilePath: { type: String, default: "" }, // ✅ added for signed PDF
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
      default: "pending"
    },
    signed: {
      type: Boolean,
      default: false
    },
    signatures: [signatureSchema],
    // Optional additional fields
    annotations: { type: Array, default: [] }, // if needed
  },
  { timestamps: true }
);

// Add index for performance
documentSchema.index({ uploadedBy: 1, status: 1 });

const Document = mongoose.model("Document", documentSchema);
module.exports = Document;
