function publicUser(user) {
  if (!user) return null;
  if (typeof user === 'string') return { id: user };
  return {
    id: String(user._id || user.id),
    username: user.username,
    email: user.email,
  };
}

function fileView(file, { viewerId, shares = [], signer = null } = {}) {
  const ownerId = String(file.owner?._id || file.owner);
  const isOwner = String(viewerId) === ownerId;
  return {
    id: String(file._id),
    name: file.originalName,
    extension: file.extension,
    mimeType: file.mimeType,
    size: file.size,
    comment: file.comment,
    createdAt: file.createdAt,
    sha256: file.sha256,
    owner: publicUser(file.owner),
    isOwner,
    permissions: {
      download: true,
      verify: true,
      sign: isOwner,
      share: isOwner,
      delete: isOwner,
      revoke: isOwner,
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      keyBits: 256,
      iv: file.iv,
      authTag: file.authTag,
      keyWraps: file.keyWraps?.length || 0,
      keyWrapping: 'RSA-OAEP-SHA256',
      encryptedOnDisk: true,
    },
    signed: file.signed?.signature
      ? {
          by: signer ? publicUser(signer) : null,
          signedAt: file.signed.signedAt,
          certSerial: file.signed.certSerial,
          signedHash: file.signed.signedHash,
          signature: file.signed.signature,
        }
      : null,
    sharedWith: shares.map((s) => ({
      user: publicUser(s.recipient),
      sharedAt: s.createdAt,
    })),
    lastVerification: file.lastVerification || null,
  };
}

function certificateView(cert, { active = false } = {}) {
  return {
    id: String(cert._id),
    subject: cert.subject,
    issuer: cert.issuer,
    issuerCN: cert.issuerCN,
    serial: cert.serial,
    fingerprint: cert.fingerprint,
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
    mode: cert.mode,
    active: cert.active,
    isActive: active,
    revoked: cert.revoked,
    revokedAt: cert.revokedAt,
    createdAt: cert.createdAt,
    pem: cert.pem,
    csrPem: cert.csrPem,
  };
}

function auditView(log) {
  return {
    id: String(log._id),
    seq: log.seq,
    action: log.action,
    outcome: log.outcome,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    meta: log.meta,
    ip: log.ip,
    createdAt: log.createdAt,
    prevHash: log.prevHash,
    hash: log.hash,
  };
}

module.exports = { publicUser, fileView, certificateView, auditView };
