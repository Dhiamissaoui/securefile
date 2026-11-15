const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    username: { type: String, required: true, trim: true, minlength: 3, maxlength: 24 },
    passwordHash: { type: String, required: true },
    publicKeyPem: { type: String, required: true },
    privateKey: {
      salt: { type: String, required: true },
      iv: { type: String, required: true },
      tag: { type: String, required: true },
      data: { type: String, required: true },
    },
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model('User', userSchema);
