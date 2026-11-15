const path = require('path');
const { AppError } = require('./AppError');

const ALLOWED = {
  pdf: { mime: 'application/pdf', label: 'PDF' },
  png: { mime: 'image/png', label: 'Image PNG' },
  jpg: { mime: 'image/jpeg', label: 'Image JPEG' },
  jpeg: { mime: 'image/jpeg', label: 'Image JPEG' },
  txt: { mime: 'text/plain; charset=utf-8', label: 'Texte' },
  md: { mime: 'text/markdown; charset=utf-8', label: 'Markdown' },
  csv: { mime: 'text/csv; charset=utf-8', label: 'CSV' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' },
};

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv']);

// Busboy reads multipart filenames as latin1; restore UTF-8 names (accents, œ…).
function decodeFilename(name) {
  if (!/[ÃÂâ]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

function hasMagic(ext, buffer) {
  const hex = buffer.subarray(0, 8).toString('hex').toLowerCase();
  const ascii = buffer.subarray(0, 5).toString('latin1');
  switch (ext) {
    case 'pdf':
      return ascii === '%PDF-';
    case 'png':
      return hex.startsWith('89504e470d0a1a0a');
    case 'jpg':
    case 'jpeg':
      return hex.startsWith('ffd8ff');
    case 'docx':
    case 'xlsx':
      return hex.startsWith('504b0304');
    default:
      return true;
  }
}

function isUtf8Text(buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function validateUpload(file) {
  if (!file || !file.buffer || !file.originalname) {
    throw new AppError(400, 'FILE_MISSING', 'Aucun fichier reçu.');
  }
  if (file.size === 0) {
    throw new AppError(400, 'FILE_EMPTY', 'Le fichier est vide.');
  }

  const rawName = decodeFilename(file.originalname);
  if (/[\\/]/.test(rawName) || rawName !== path.basename(rawName)) {
    throw new AppError(400, 'FILE_NAME', 'Nom de fichier invalide (chemin interdit).');
  }
  if (/[\u0000-\u001F\u007F]/.test(rawName)) {
    throw new AppError(400, 'FILE_NAME', 'Nom de fichier invalide (caractères de contrôle).');
  }
  if (rawName.length > 180) {
    throw new AppError(400, 'FILE_NAME', 'Nom de fichier trop long (180 caractères maximum).');
  }

  const ext = path.extname(rawName).slice(1).toLowerCase();
  if (!ext || !ALLOWED[ext]) {
    throw new AppError(
      400,
      'FILE_TYPE',
      `Type de fichier refusé. Formats autorisés : ${Object.keys(ALLOWED).join(', ')}.`
    );
  }

  if (!hasMagic(ext, file.buffer)) {
    throw new AppError(400, 'FILE_SIGNATURE', 'Le contenu du fichier ne correspond pas à son extension.');
  }
  if (TEXT_EXTENSIONS.has(ext) && !isUtf8Text(file.buffer)) {
    throw new AppError(400, 'FILE_CONTENT', 'Le fichier texte doit être encodé en UTF-8 sans octets nuls.');
  }

  return {
    extension: ext,
    mimeType: ALLOWED[ext].mime,
    label: ALLOWED[ext].label,
    originalName: rawName.normalize('NFC'),
  };
}

function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

module.exports = { ALLOWED, validateUpload, contentDisposition };
