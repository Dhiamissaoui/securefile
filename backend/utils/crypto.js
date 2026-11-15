const crypto = require('crypto');
const config = require('../config');

const GCM_IV_BYTES = 12;
const KEY_BYTES = 32;

function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(data) {
  return crypto.createHmac('sha256', config.hmacKey).update(data).digest('hex');
}

function constantEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function generateFileKey() {
  return crypto.randomBytes(KEY_BYTES);
}

// AES-256-GCM: one random 96-bit nonce per encryption, authentication tag kept aside.
function encryptBuffer(plain, key) {
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { ciphertext, iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}

function decryptBuffer(ciphertext, ivB64, tagB64, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ---------- Key wrapping (hybrid encryption) ----------
// Each file has its own random AES key. It is wrapped per recipient with RSA-OAEP-SHA256,
// so revoking a share removes the only copy of the key that recipient can open.
function wrapKeyFor(publicKeyPem, rawKey) {
  return crypto
    .publicEncrypt({ key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, rawKey)
    .toString('base64');
}

function unwrapKeyFor(privateKeyPem, wrappedB64) {
  return crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(wrappedB64, 'base64')
  );
}

// ---------- Digital signature: RSA-PSS 3072, SHA-256 ----------
function signHash(sha256Hex, privateKeyPem) {
  const payload = Buffer.from(`sha256:${sha256Hex}`, 'utf8');
  return crypto
    .sign('sha256', payload, {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    })
    .toString('base64');
}

function verifyHashSignature(sha256Hex, signatureB64, publicKeyPem) {
  try {
    const payload = Buffer.from(`sha256:${sha256Hex}`, 'utf8');
    return crypto.verify(
      'sha256',
      payload,
      { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(signatureB64, 'base64')
    );
  } catch {
    return false;
  }
}

// ---------- Password-derived protection of the user's private key ----------
function deriveKey(password, saltHex) {
  return crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), KEY_BYTES, { N: 16384, r: 8, p: 1 });
}

function encryptPrivateKey(privateKeyPem, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = deriveKey(password, salt);
  const { ciphertext, iv, authTag } = encryptBuffer(Buffer.from(privateKeyPem, 'utf8'), key);
  return { salt, iv, tag: authTag, data: ciphertext.toString('base64') };
}

function decryptPrivateKey(blob, password) {
  const key = deriveKey(password, blob.salt);
  const plain = decryptBuffer(Buffer.from(blob.data, 'base64'), blob.iv, blob.tag, key);
  return plain.toString('utf8');
}

// ---------- Text hygiene ----------
function sanitizeText(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  GCM_IV_BYTES,
  randomHex,
  sha256,
  hmac,
  constantEqual,
  generateFileKey,
  encryptBuffer,
  decryptBuffer,
  wrapKeyFor,
  unwrapKeyFor,
  signHash,
  verifyHashSignature,
  deriveKey,
  encryptPrivateKey,
  decryptPrivateKey,
  sanitizeText,
  escapeHtml,
};
