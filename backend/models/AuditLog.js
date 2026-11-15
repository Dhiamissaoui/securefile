const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true, unique: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorEmail: { type: String, default: null },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, default: null },
    resourceId: { type: String, default: null },
    resourceOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    outcome: { type: String, enum: ['success', 'failure', 'warning'], default: 'success' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 200 },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { versionKey: false }
);

auditSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditSchema);
