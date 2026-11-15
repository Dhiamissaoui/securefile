const express = require('express');
const path = require('path');
const File = require('../models/File');
const Share = require('../models/Share');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const { AppError, wrap } = require('../utils/AppError');
const { validateEmail, validateString } = require('../utils/validators');
const { sanitizeText, sha256, wrapKeyFor, signHash } = require('../utils/crypto');
const { validateUpload, contentDisposition } = require('../utils/files');
const { verifyCertificate } = require('../utils/pki');
const {
  encryptAndStore,
  metadataHmac,
  removeCiphertext,
  unwrapFileKey,
  decryptFileForViewer,
} = require('../services/fileService');
const { getFileAccess, buildVerificationReport } = require('../services/verification');
const { upload, uploadAny } = require('../middleware/upload');
const { requireAuth } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const vault = require('../services/keyVault');
const audit = require('../services/audit');
const { fileView } = require('../utils/serialize');

const router = express.Router();

async function serializeOwned(files, userId) {
  const ids = files.map((f) => f._id);
  const shares = ids.length
    ? await Share.find({ file: { $in: ids } }).populate('recipient', 'username email')
    : [];
  const grouped = new Map();
  for (const s of shares) {
    const key = String(s.file);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(s);
  }
  return files.map((f) =>
    fileView(f, {
      viewerId: userId,
      shares: grouped.get(String(f._id)) || [],
      signer: f.signed?.by,
    })
  );
}

router.get(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    const userId = req.user._id;
    const owned = await File.find({ owner: userId })
      .sort({ createdAt: -1 })
      .populate('owner', 'username email')
      .populate('signed.by', 'username email');

    const receivedShares = await Share.find({ recipient: userId }).populate({
      path: 'file',
      populate: [
        { path: 'owner', select: 'username email' },
        { path: 'signed.by', select: 'username email' },
      ],
    });

    const receivedFiles = receivedShares
      .map((s) => s.file)
      .filter(Boolean)
      .map((f) => fileView(f, { viewerId: userId, shares: [], signer: f.signed?.by }));

    const ownedViews = await serializeOwned(owned, userId);
    const files = [...ownedViews, ...receivedFiles].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({
      files,
      counts: {
        owned: ownedViews.length,
        sharedWithMe: receivedFiles.length,
        signed: ownedViews.filter((f) => f.signed).length,
        total: files.length,
      },
    });
  })
);

router.post(
  '/',
  requireAuth,
  requireCsrf,
  upload.single('file'),
  wrap(async (req, res) => {
    const meta = validateUpload(req.file);
    const commentCheck = validateString(req.body.comment || '', { min: 0, max: 500 });
    if (commentCheck.error) throw new AppError(400, 'COMMENT', commentCheck.error);
    const comment = sanitizeText(commentCheck.value || '', 500);

    const stored = encryptAndStore({
      buffer: req.file.buffer,
      ownerId: req.user._id,
      ownerPublicKeyPem: req.user.publicKeyPem,
      originalName: meta.originalName,
      mimeType: meta.mimeType,
      extension: meta.extension,
      comment,
    });

    let file;
    try {
      file = await File.create({
        owner: req.user._id,
        originalName: meta.originalName,
        storedName: stored.storedName,
        mimeType: stored.mimeType,
        extension: stored.extension,
        size: stored.size,
        comment,
        sha256: stored.sha256,
        hmac: stored.hmac,
        iv: stored.iv,
        authTag: stored.authTag,
        keyWraps: [{ user: req.user._id, wrappedKey: stored.keyWrap }],
      });
    } catch (err) {
      removeCiphertext(stored.storedName);
      throw err;
    }

    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'file_uploaded',
      resourceType: 'file',
      resourceId: file._id,
      resourceOwner: req.user._id,
      outcome: 'success',
      meta: { fileName: file.originalName, size: file.size, extension: file.extension },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    await file.populate('owner', 'username email');
    res.status(201).json(fileView(file, { viewerId: req.user._id, signer: null }));
  })
);

router.get(
  '/:id/download',
  requireAuth,
  wrap(async (req, res) => {
    const { file, isOwner } = await getFileAccess(req.params.id, req.user._id);
    const plain = decryptFileForViewer({
      file,
      userId: req.user._id,
      privateKeyPem: req.privateKeyPem,
    });

    const computed = sha256(plain);
    const hmacOk =
      metadataHmac({
        sha256Hex: file.sha256,
        ownerId: file.owner,
        originalName: file.originalName,
        size: file.size,
      }) === file.hmac;

    if (computed !== file.sha256 || !hmacOk) {
      await audit.record({
        actorId: req.user._id,
        actorEmail: req.user.email,
        action: 'integrity_failed',
        resourceType: 'file',
        resourceId: file._id,
        resourceOwner: file.owner,
        outcome: 'warning',
        meta: { fileName: file.originalName, shaOk: computed === file.sha256, hmacOk },
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      throw new AppError(409, 'INTEGRITY', 'Téléchargement bloqué : échec de vérification d’intégrité.');
    }

    file.lastVerification = { at: new Date(), ok: true, by: req.user._id };
    await file.save();

    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'file_downloaded',
      resourceType: 'file',
      resourceId: file._id,
      resourceOwner: file.owner,
      outcome: 'success',
      meta: { fileName: file.originalName, integrity: 'verified', owner: isOwner },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', contentDisposition(file.originalName));
    res.setHeader('Content-Length', plain.length);
    res.setHeader('X-Integrity-Status', 'verified');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.send(plain);
  })
);

router.post(
  '/:id/share',
  requireAuth,
  requireCsrf,
  wrap(async (req, res) => {
    const { file, isOwner } = await getFileAccess(req.params.id, req.user._id);
    if (!isOwner) throw new AppError(403, 'FORBIDDEN', 'Seul le propriétaire peut partager ce fichier.');

    const emailError = validateEmail(req.body.email);
    if (emailError) throw new AppError(400, 'EMAIL', emailError);
    const email = req.body.email.trim().toLowerCase();

    const target = await User.findOne({ email });
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'Aucun utilisateur avec cette adresse email.');
    if (String(target._id) === String(req.user._id)) {
      throw new AppError(400, 'SELF_SHARE', 'Vous ne pouvez pas partager un fichier avec vous-même.');
    }
    const existing = await Share.findOne({ file: file._id, recipient: target._id });
    if (existing) throw new AppError(409, 'ALREADY_SHARED', 'Ce fichier est déjà partagé avec cet utilisateur.');

    const fileKey = unwrapFileKey({ file, userId: req.user._id, privateKeyPem: req.privateKeyPem });
    const wrappedKey = wrapKeyFor(target.publicKeyPem, fileKey);

    const share = await Share.create({
      file: file._id,
      owner: req.user._id,
      recipient: target._id,
      wrappedKey,
    });
    file.keyWraps.push({ user: target._id, wrappedKey });
    await file.save();

    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'file_shared',
      resourceType: 'file',
      resourceId: file._id,
      resourceOwner: file.owner,
      outcome: 'success',
      meta: { fileName: file.originalName, recipient: target.username },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      share: { user: { id: String(target._id), username: target.username, email: target.email }, sharedAt: share.createdAt },
    });
  })
);

router.delete(
  '/:id/share/:userId',
  requireAuth,
  requireCsrf,
  wrap(async (req, res) => {
    const { file, isOwner } = await getFileAccess(req.params.id, req.user._id);
    if (!isOwner) throw new AppError(403, 'FORBIDDEN', 'Seul le propriétaire peut révoquer un partage.');

    const share = await Share.findOne({ file: file._id, recipient: req.params.userId });
    if (!share) throw new AppError(404, 'SHARE_NOT_FOUND', 'Partage introuvable.');
    await share.deleteOne();
    file.keyWraps = file.keyWraps.filter((w) => String(w.user) !== String(req.params.userId));
    await file.save();

    const target = await User.findById(req.params.userId).select('username').lean();
    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'share_revoked',
      resourceType: 'file',
      resourceId: file._id,
      resourceOwner: file.owner,
      outcome: 'success',
      meta: { fileName: file.originalName, recipient: target?.username || 'inconnu' },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  requireAuth,
  requireCsrf,
  wrap(async (req, res) => {
    const { file, isOwner } = await getFileAccess(req.params.id, req.user._id);
    if (!isOwner) throw new AppError(403, 'FORBIDDEN', 'Seul le propriétaire peut supprimer ce fichier.');

    await Share.deleteMany({ file: file._id });
    await file.deleteOne();
    removeCiphertext(file.storedName);

    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'file_deleted',
      resourceType: 'file',
      resourceId: file._id,
      resourceOwner: req.user._id,
      outcome: 'success',
      meta: { fileName: file.originalName },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ ok: true });
  })
);

router.post(
  '/:id/sign',
  requireAuth,
  requireCsrf,
  wrap(async (req, res) => {
    const { file, isOwner } = await getFileAccess(req.params.id, req.user._id);
    if (!isOwner) throw new AppError(403, 'FORBIDDEN', 'Seul le propriétaire peut signer ce fichier.');
    if (!req.privateKeyPem) {
      throw new AppError(401, 'RELOGIN_REQUIRED', 'Reconnectez-vous pour déverrouiller votre clé privée.');
    }

    const cert = await Certificate.findOne({ user: req.user._id, active: true }).sort({ createdAt: -1 });
    if (!cert) throw new AppError(409, 'NO_CERT', 'Aucun certificat actif : impossible de signer.');
    const certCheck = verifyCertificate(cert.pem, { revoked: cert.revoked });
    if (!certCheck.valid) {
      throw new AppError(409, 'CERT_INVALID', `Signature refusée : ${certCheck.reasons[0]}`);
    }

    let plain;
    try {
      plain = decryptFileForViewer({ file, userId: req.user._id, privateKeyPem: req.privateKeyPem });
    } catch (err) {
      throw err;
    }
    const computed = sha256(plain);
    const hmacOk =
      metadataHmac({
        sha256Hex: file.sha256,
        ownerId: file.owner,
        originalName: file.originalName,
        size: file.size,
      }) === file.hmac;
    if (computed !== file.sha256 || !hmacOk) {
      await audit.record({
        actorId: req.user._id,
        actorEmail: req.user.email,
        action: 'integrity_failed',
        resourceType: 'file',
        resourceId: file._id,
        resourceOwner: file.owner,
        outcome: 'warning',
        meta: { fileName: file.originalName, operation: 'sign' },
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      throw new AppError(
        409,
        'INTEGRITY',
        'Signature refusée : le fichier ne correspond plus à son empreinte enregistrée.'
      );
    }

    const signature = signHash(computed, req.privateKeyPem);
    file.signed = {
      by: req.user._id,
      signature,
      signedHash: computed,
      certSerial: cert.serial,
      signedAt: new Date(),
    };
    await file.save();

    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'file_signed',
      resourceType: 'file',
      resourceId: file._id,
      resourceOwner: req.user._id,
      outcome: 'success',
      meta: { fileName: file.originalName, certSerial: cert.serial },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      signed: {
        by: { id: String(req.user._id), username: req.user.username, email: req.user.email },
        signedAt: file.signed.signedAt,
        certSerial: cert.serial,
        signature,
        signedHash: computed,
      },
    });
  })
);

router.get(
  '/:id/verify',
  requireAuth,
  wrap(async (req, res) => {
    const { file } = await getFileAccess(req.params.id, req.user._id);
    const report = await buildVerificationReport({
      file,
      userId: req.user._id,
      privateKeyPem: req.privateKeyPem,
      requestMeta: req.clientMeta,
    });
    res.json(report);
  })
);

router.post(
  '/:id/verify-local',
  requireAuth,
  requireCsrf,
  uploadAny.single('file'),
  wrap(async (req, res) => {
    const { file } = await getFileAccess(req.params.id, req.user._id);
    if (!req.file) throw new AppError(400, 'FILE_MISSING', 'Aucun fichier local fourni.');

    const computed = sha256(req.file.buffer);
    const match = computed === file.sha256;
    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'local_file_verified',
      resourceType: 'file',
      resourceId: file._id,
      resourceOwner: file.owner,
      outcome: match ? 'success' : 'warning',
      meta: {
        fileName: file.originalName,
        localName: sanitizeText(req.file.originalname, 120),
        match,
      },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      match,
      computed,
      reference: file.sha256,
      localFileName: sanitizeText(req.file.originalname, 120),
      referenceFileName: file.originalName,
      localSize: req.file.size,
      referenceSize: file.size,
      checkedAt: new Date().toISOString(),
    });
  })
);

router.get(
  '/:id/raw',
  requireAuth,
  wrap(async (req, res) => {
    const { file } = await getFileAccess(req.params.id, req.user._id);
    res.json({
      id: String(file._id),
      name: file.originalName,
      sha256: file.sha256,
      signature: file.signed?.signature || null,
      signedHash: file.signed?.signedHash || null,
      certSerial: file.signed?.certSerial || null,
      encryption: { iv: file.iv, authTag: file.authTag, keyWraps: file.keyWraps.length },
    });
  })
);

module.exports = router;
