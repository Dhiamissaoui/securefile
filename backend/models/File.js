const mongoose = require('mongoose');

const keyWrapSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    wrappedKey: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const signatureSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    signature: String,
    signedHash: String,
    certSerial: String,
    signedAt: Date,
  },
  { _id: false }
);

const verificationSchema = new mongoose.Schema(
  {
    at: Date,
    ok: Boolean,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const fileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalName: { type: String, required: true, maxlength: 180 },
    storedName: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    extension: { type: String, required: true },
    size: { type: Number, required: true },
    comment: { type: String, default: '', maxlength: 500 },
    sha256: { type: String, required: true },
    hmac: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyWraps: { type: [keyWrapSchema], default: [] },
    signed: { type: signatureSchema, default: null },
    lastVerification: { type: verificationSchema, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

fileSchema.index({ createdAt: -1 });

module.exports = mongoose.model('File', fileSchema);
