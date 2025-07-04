const mongoose = require('mongoose');

const signatureSchema = new mongoose.Schema({
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
  },
  signer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  coordinates: {
    x: Number,
    y: Number,
    page: Number,
  },
  type: {
    type: String,
    enum: ['signature', 'initials', 'name', 'stamp'],
    default: 'signature',
  },
  value: {
    type: String,
    default: '',
  },
  fontStyle: {
    type: String,
    default: 'Cursive',
  },
  color: {
    type: String,
    default: '#000000',
  },
  status: {
    type: String,
    enum: ['pending', 'signed'],
    default: 'pending',
  },
  image: {
    type: String, // optional base64 or URL (for signature image if drawn/uploaded)
  },
}, { timestamps: true });

module.exports = mongoose.model('Signature', signatureSchema);
