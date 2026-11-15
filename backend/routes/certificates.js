const express = require('express');
const Certificate = require('../models/Certificate');
const { AppError, wrap } = require('../utils/AppError');
const { reissueCertificate, verifyCertificate, getCAInfo, checkCsr } = require('../utils/pki');
const { requireAuth } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const audit = require('../services/audit');
const { certificateView } = require('../utils/serialize');

const router = express.Router();
const MODES = new Set(['valid', 'expired', 'rogue']);

router.get(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    const certs = await Certificate.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    const active = certs.find((c) => c.active) || null;
    const ca = getCAInfo();
    const revoked = await Certificate.find({ revoked: true }).select('serial revokedAt subject').lean();
    res.json({
      certificates: certs.map((c) => certificateView(c, { active: c.active })),
      active: active ? certificateView(active, { active: true }) : null,
      ca: {
        subject: ca.subject,
        fingerprint: ca.fingerprint,
        notBefore: ca.notBefore,
        notAfter: ca.notAfter,
        pem: ca.pem,
      },
      crl: revoked.map((r) => ({ serial: r.serial, revokedAt: r.revokedAt, subject: r.subject })),
    });
  })
);

router.get('/ca.pem', (req, res) => {
  const ca = getCAInfo();
  res.setHeader('Content-Type', 'application/x-pem-file');
  res.setHeader('Content-Disposition', 'attachment; filename="securefile-ca.crt.pem"');
  res.send(ca.pem);
});

router.get(
  '/mine.pem',
  requireAuth,
  wrap(async (req, res) => {
    const cert = await Certificate.findOne({ user: req.user._id, active: true }).sort({ createdAt: -1 });
    if (!cert) throw new AppError(404, 'NO_CERT', 'Aucun certificat actif.');
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="securefile-certificat.pem"');
    res.send(cert.pem);
  })
);

router.get(
  '/chain.pem',
  requireAuth,
  wrap(async (req, res) => {
    const cert = await Certificate.findOne({ user: req.user._id, active: true }).sort({ createdAt: -1 });
    if (!cert) throw new AppError(404, 'NO_CERT', 'Aucun certificat actif.');
    const ca = getCAInfo();
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="securefile-chaine.pem"');
    res.send(`${cert.pem}\n${ca.pem}`);
  })
);

router.post(
  '/check',
  requireAuth,
  requireCsrf,
  wrap(async (req, res) => {
    const { pem } = req.body || {};
    if (typeof pem !== 'string' || pem.length < 100 || pem.length > 20000 || !pem.includes('BEGIN CERTIFICATE')) {
      throw new AppError(400, 'PEM', 'Certificat PEM invalide.');
    }
    let certDoc = null;
    try {
      const { describeCertificate } = require('../utils/pki');
      const details = describeCertificate(pem);
      certDoc = await Certificate.findOne({ serial: details.serial }).lean();
      const report = verifyCertificate(pem, { revoked: !!certDoc?.revoked });
      res.json({ report, inLocalDatabase: !!certDoc });
    } catch {
      throw new AppError(400, 'PEM', 'Certificat illisible ou mal formé.');
    }
  })
);

router.post(
  '/reissue',
  requireAuth,
  requireCsrf,
  wrap(async (req, res) => {
    const mode = String(req.body.mode || 'valid');
    if (!MODES.has(mode)) throw new AppError(400, 'MODE', 'Mode de réémission inconnu.');
    if (!req.privateKeyPem) {
      throw new AppError(401, 'RELOGIN_REQUIRED', 'Reconnectez-vous pour signer la nouvelle demande (CSR).');
    }

    const material = reissueCertificate({
      privateKeyPem: req.privateKeyPem,
      publicKeyPem: req.user.publicKeyPem,
      username: req.user.username,
      email: req.user.email,
      mode,
    });
    if (!checkCsr(material.csrPem)) {
      throw new AppError(500, 'CSR', 'Échec de la vérification du CSR.');
    }

    await Certificate.updateMany({ user: req.user._id, active: true }, { $set: { active: false } });
    const cert = await Certificate.create({
      user: req.user._id,
      subject: material.subject,
      issuer: material.issuer,
      issuerCN: material.issuerCN,
      serial: material.serial,
      fingerprint: material.fingerprint,
      pem: material.certPem,
      csrPem: material.csrPem,
      notBefore: material.notBefore,
      notAfter: material.notAfter,
      mode,
      active: true,
    });

    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'cert_reissued',
      resourceType: 'certificate',
      resourceId: cert.serial,
      resourceOwner: req.user._id,
      outcome: mode === 'valid' ? 'success' : 'warning',
      meta: { mode, serial: cert.serial, issuer: material.issuerCN },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    const report = verifyCertificate(cert.pem, { revoked: false, expectedEmail: req.user.email });
    res.status(201).json({ certificate: certificateView(cert, { active: true }), report });
  })
);

router.post(
  '/revoke',
  requireAuth,
  requireCsrf,
  wrap(async (req, res) => {
    const active = await Certificate.find({ user: req.user._id, active: true });
    if (!active.length) throw new AppError(404, 'NO_CERT', 'Aucun certificat actif.');
    await Certificate.updateMany(
      { user: req.user._id, active: true },
      { $set: { revoked: true, revokedAt: new Date() } }
    );
    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'cert_revoked',
      resourceType: 'certificate',
      resourceId: active[0].serial,
      resourceOwner: req.user._id,
      outcome: 'warning',
      meta: { serials: active.map((c) => c.serial) },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ ok: true, revoked: active.length });
  })
);

module.exports = router;
