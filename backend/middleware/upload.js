const multer = require('multer');
const path = require('path');
const config = require('../config');
const { ALLOWED } = require('../utils/files');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 10, parts: 12 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').slice(1).toLowerCase();
    if (!ext || !ALLOWED[ext]) {
      const err = new Error('FILE_TYPE');
      err.code = 'FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

const uploadAny = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

module.exports = { upload, uploadAny };
