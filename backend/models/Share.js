const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema(
  {
    file: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    wrappedKey: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

shareSchema.index({ file: 1, recipient: 1 }, { unique: true });

module.exports = mongoose.model('Share', shareSchema);
