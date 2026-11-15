const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AppError } = require('../utils/AppError');
const {
  sha256,
  hmac,
  generateFileKey,
  encryptBuffer,
  decryptBuffer,
  wrapKeyFor,
  unwrapKeyFor,
} = require('../utils/crypto');

const STORAGE_DIR = path.join(__dirname, '..', 'storage', 'encrypted');
const STORED_NAME_RE = /^[a-f0-9]{32}\.bin$/;

fs.mkdirSync(STORAGE_DIR, { recursive: true });

function storedPath(name) {
  if (!STORED_NAME_RE.test(name)) throw new AppError(500, 'STORAGE', 'Référence de stockage invalide.');
  const full = path.join(STORAGE_DIR, name);
  if (!full.startsWith(STORAGE_DIR + path.sep)) throw new AppError(500, 'STORAGE', 'Chemin interdit.');
  return full;
}

function writeCiphertext(ciphertext) {
  const name = `${crypto.randomBytes(16).toString('hex')}.bin`;
  fs.writeFileSync(storedPath(name), ciphertext, { mode: 0o600 });
  return name;
}

function readCiphertext(name) {
  try {
    return fs.readFileSync(storedPath(name));
  } catch {
    throw new AppError(410, 'FILE_GONE', 'Le fichier chiffré est introuvable sur le serveur.');
  }
}

function removeCiphertext(name) {
  try {
    fs.unlinkSync(storedPath(name));
  } catch {
    /* already removed */
  }
}

function metadataHmac({ sha256Hex, ownerId, originalName, size }) {
  return hmac(`${sha256Hex}|${ownerId}|${originalName}|${size}`);
}

function wrapForOwner(publicKeyPem, fileKey) {
  return wrapKeyFor(publicKeyPem, fileKey);
}

function encryptAndStore({ buffer, ownerId, ownerPublicKeyPem, originalName, mimeType, extension, comment }) {
  const fileKey = generateFileKey();
  const { ciphertext, iv, authTag } = encryptBuffer(buffer, fileKey);
  const storedName = writeCiphertext(ciphertext);
  const sha256Hex = sha256(buffer);
  return {
    storedName,
    fileKey,
    iv,
    authTag,
    sha256: sha256Hex,
    hmac: metadataHmac({ sha256Hex, ownerId, originalName, size: buffer.length }),
    keyWrap: wrapForOwner(ownerPublicKeyPem, fileKey),
    mimeType,
    extension,
    size: buffer.length,
    comment,
  };
}

// Unwraps the per-file key with the viewer's private key and authenticates the ciphertext.
function unwrapFileKey({ file, userId, privateKeyPem }) {
  if (!privateKeyPem) {
    throw new AppError(
      401,
      'RELOGIN_REQUIRED',
      'Votre clé privée n’est plus déverrouillée. Reconnectez-vous pour continuer.'
    );
  }
  const wrap = file.keyWraps.find((w) => String(w.user) === String(userId));
  if (!wrap) throw new AppError(403, 'NO_KEY', 'Vous ne détenez pas la clé de ce fichier.');
  try {
    return unwrapKeyFor(privateKeyPem, wrap.wrappedKey);
  } catch {
    throw new AppError(403, 'KEY_UNWRAP', 'Impossible de déverrouiller la clé du fichier avec votre clé privée.');
  }
}

function decryptFileForViewer({ file, userId, privateKeyPem }) {
  const fileKey = unwrapFileKey({ file, userId, privateKeyPem });
  const ciphertext = readCiphertext(file.storedName);
  try {
    return decryptBuffer(ciphertext, file.iv, file.authTag, fileKey);
  } catch {
    throw new AppError(
      409,
      'GCM_AUTH_FAILED',
      'Échec d’authentification AES-GCM : le fichier chiffré a été modifié.'
    );
  }
}

module.exports = {
  STORAGE_DIR,
  writeCiphertext,
  readCiphertext,
  removeCiphertext,
  metadataHmac,
  encryptAndStore,
  unwrapFileKey,
  decryptFileForViewer,
  storedPath,
};
