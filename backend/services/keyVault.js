// Session-scoped vault for decrypted private keys.
// Private keys are encrypted at rest with a password-derived key (scrypt) and
// only decrypted in memory at login; a server restart forces a re-login.
const vault = new Map();

module.exports = {
  set(sessionId, privateKeyPem) {
    vault.set(String(sessionId), privateKeyPem);
  },
  get(sessionId) {
    return vault.get(String(sessionId)) || null;
  },
  remove(sessionId) {
    vault.delete(String(sessionId));
  },
  clear() {
    vault.clear();
  },
};
