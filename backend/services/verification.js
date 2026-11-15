const File = require('../models/File');
const Share = require('../models/Share');
const Certificate = require('../models/Certificate');
const { AppError } = require('../utils/AppError');
const { sha256, verifyHashSignature } = require('../utils/crypto');
const { metadataHmac, decryptFileForViewer } = require('./fileService');
const { verifyCertificate } = require('../utils/pki');

async function getFileAccess(fileId, userId) {
  const file = await File.findById(fileId);
  if (!file) throw new AppError(404, 'FILE_NOT_FOUND', 'Fichier introuvable.');
  if (String(file.owner) === String(userId)) return { file, isOwner: true };
  const share = await Share.findOne({ file: file._id, recipient: userId });
  if (!share) {
    throw new AppError(403, 'FORBIDDEN', 'Accès refusé : ce fichier ne vous appartient pas et ne vous est pas partagé.');
  }
  return { file, isOwner: false, share };
}

async function signerCertificate(file) {
  if (!file.signed?.by) return null;
  if (file.signed.certSerial) {
    const signing = await Certificate.findOne({ serial: file.signed.certSerial }).lean();
    if (signing) return signing;
  }
  return Certificate.findOne({ user: file.signed.by, active: true }).sort({ createdAt: -1 }).lean();
}

// Full three-level verification: AES-GCM, SHA-256, HMAC, signature, X.509 certificate.
async function buildVerificationReport({ file, userId, privateKeyPem, requestMeta = {} }) {
  const report = {
    fileId: String(file._id),
    fileName: file.originalName,
    checkedAt: new Date().toISOString(),
    checks: {
      aesGcm: { ok: false, label: 'Chiffrement AES-256-GCM', message: '' },
      sha256: { ok: false, label: 'Empreinte SHA-256', stored: file.sha256, computed: null, message: '' },
      hmac: { ok: false, label: 'HMAC-SHA-256 (métadonnées)', stored: file.hmac, computed: null, message: '' },
      signature: { present: !!file.signed?.signature, ok: false, label: 'Signature RSA-PSS', message: '' },
      certificate: { ok: false, label: 'Certificat X.509', message: '', reasons: [] },
    },
    signer: null,
    verdict: false,
    verdictLabel: 'Échec de vérification',
  };

  let plaintext = null;
  try {
    plaintext = decryptFileForViewer({ file, userId, privateKeyPem });
    report.checks.aesGcm.ok = true;
    report.checks.aesGcm.message = 'Tag d’authentification GCM valide : le fichier chiffré est intact.';
    report.checks.sha256.computed = sha256(plaintext);
    report.checks.sha256.ok = report.checks.sha256.computed === file.sha256;
    report.checks.sha256.message = report.checks.sha256.ok
      ? 'Empreinte identique à la référence enregistrée au dépôt.'
      : 'Empreinte différente : le contenu a été modifié après le dépôt.';
  } catch (err) {
    report.checks.aesGcm.message =
      err.code === 'GCM_AUTH_FAILED'
        ? 'Échec : le fichier chiffré a été modifié sur le disque (tag GCM invalide).'
        : err.message;
    report.checks.sha256.message = 'Impossible de calculer l’empreinte : déchiffrement refusé.';
    report.checks.hmac.message = 'Impossible de contrôler le HMAC : déchiffrement refusé.';
  }

  const computedHmac = metadataHmac({
    sha256Hex: file.sha256,
    ownerId: file.owner,
    originalName: file.originalName,
    size: file.size,
  });
  report.checks.hmac.computed = computedHmac;
  report.checks.hmac.ok = computedHmac === file.hmac;
  report.checks.hmac.message = report.checks.hmac.ok
    ? 'Métadonnées cohérentes avec le sceau HMAC du serveur.'
    : 'HMAC invalide : les métadonnées (empreinte, nom, taille) ont été modifiées en base.';

  if (file.signed?.signature) {
    const cert = await signerCertificate(file);
    if (!cert) {
      report.checks.signature.message = 'Signature présente mais certificat du signataire introuvable.';
      report.checks.certificate.message = 'Certificat introuvable.';
    } else {
      const signer = await require('../models/User').findById(file.signed.by).lean();
      report.signer = signer
        ? { username: signer.username, email: signer.email }
        : { username: 'Inconnu', email: '' };

      const certCheck = verifyCertificate(cert.pem, {
        revoked: cert.revoked,
        expectedEmail: signer?.email,
        expectedPublicKeyPem: signer?.publicKeyPem,
      });
      report.checks.certificate.ok = certCheck.valid;
      report.checks.certificate.reasons = certCheck.reasons;
      report.checks.certificate.message = certCheck.valid
        ? 'Certificat signé par l’AC locale, valide et non révoqué.'
        : certCheck.reasons[0] || 'Certificat non valide.';
      report.checks.certificate.details = certCheck.details;

      if (!plaintext) {
        report.checks.signature.ok = false;
        report.checks.signature.message =
          'Signature non vérifiable : le fichier doit d’abord être déchiffré intact.';
      } else {
        report.checks.signature.ok = verifyHashSignature(
          report.checks.sha256.computed,
          file.signed.signature,
          certCheck.details.publicKeyPem
        );
        report.checks.signature.message = report.checks.signature.ok
          ? 'Signature RSA-PSS valide : l’empreinte correspond à la clé publique du certificat.'
          : 'Signature invalide : signataire, empreinte ou certificat incohérent.';
      }
      report.signatureMeta = {
        signedAt: file.signed.signedAt,
        certSerial: file.signed.certSerial,
        signedHash: file.signed.signedHash,
      };
    }
  } else {
    report.checks.signature.message = 'Fichier non signé.';
    report.checks.certificate.message = 'Aucun certificat associé.';
  }

  const allOk =
    report.checks.aesGcm.ok &&
    report.checks.sha256.ok &&
    report.checks.hmac.ok &&
    (!file.signed?.signature || (report.checks.signature.ok && report.checks.certificate.ok));
  report.verdict = allOk;
  report.verdictLabel = allOk ? 'Intégrité et authenticité vérifiées' : 'Échec de vérification';

  file.lastVerification = { at: new Date(), ok: allOk, by: userId };
  await file.save();

  const { record } = require('./audit');
  await record({
    actorId: userId,
    actorEmail: requestMeta.actorEmail,
    action: allOk ? 'file_verified' : 'integrity_failed',
    resourceType: 'file',
    resourceId: file._id,
    resourceOwner: file.owner,
    outcome: allOk ? 'success' : 'warning',
    meta: {
      fileName: file.originalName,
      aesOk: report.checks.aesGcm.ok,
      shaOk: report.checks.sha256.ok,
      hmacOk: report.checks.hmac.ok,
      signatureOk: report.checks.signature.ok,
      certOk: report.checks.certificate.ok,
    },
    ip: requestMeta.ip,
    userAgent: requestMeta.userAgent,
  });

  return report;
}

module.exports = { getFileAccess, buildVerificationReport, signerCertificate };
