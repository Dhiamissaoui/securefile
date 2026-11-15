const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true },
    issuer: { type: String, required: true },
    issuerCN: { type: String, required: true },
    serial: { type: String, required: true, unique: true },
    fingerprint: { type: String, required: true },
    pem: { type: String, required: true },
    csrPem: { type: String, required: true },
    notBefore: { type: Date, required: true },
    notAfter: { type: Date, required: true },
    mode: { type: String, enum: ['valid', 'expired', 'rogue'], default: 'valid' },
    active: { type: Boolean, default: true },
    revoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

certificateSchema.index({ user: 1, active: 1 });

module.exports = mongoose.model('Certificate', certificateSchema);
