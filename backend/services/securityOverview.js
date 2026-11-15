const File = require('../models/File');
const Share = require('../models/Share');
const Certificate = require('../models/Certificate');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const { verifyCertificate } = require('../utils/pki');

const PROTECTIONS = [
  {
    id: 'passwords',
    label: 'Mots de passe',
    detail: 'bcrypt (coût 12, sel unique), politique 12 caractères, comparaison résistante au timing.',
    owasp: 'A02/A07',
  },
  {
    id: 'bruteforce',
    label: 'Force brute',
    detail: 'Verrouillage du compte après 5 échecs pendant 15 minutes + limitation de débit.',
    owasp: 'A07',
  },
  {
    id: 'sessions',
    label: 'Sessions',
    detail: 'Cookie HttpOnly SameSite=Strict, expiration glissante, révocation serveur à la déconnexion.',
    owasp: 'A07',
  },
  {
    id: 'csrf',
    label: 'CSRF',
    detail: 'Jeton CSRF par session exigé sur chaque requête mutante, en plus du SameSite strict.',
    owasp: 'A01',
  },
  {
    id: 'injection',
    label: 'Injections NoSQL',
    detail: 'Validation stricte des types, rejet des clés $ et des chemins pointés, requêtes Mongoose typées.',
    owasp: 'A03',
  },
  {
    id: 'xss',
    label: 'XSS',
    detail: 'Échappement React sans HTML brut, neutralisation des balises, CSP restrictive, nosniff.',
    owasp: 'A03',
  },
  {
    id: 'access',
    label: 'Contrôle d’accès',
    detail: 'Vérification propriétaire / destinataire côté serveur sur chaque route (IDOR → 403).',
    owasp: 'A01',
  },
  {
    id: 'upload',
    label: 'Téléversement',
    detail: 'Liste blanche d’extensions, contrôle des octets magiques, 10 Mo max, nom aléatoire hors racine web.',
    owasp: 'A04/A05',
  },
  {
    id: 'encryption',
    label: 'Chiffrement au repos',
    detail: 'AES-256-GCM, clé aléatoire par fichier, nonce 96 bits unique, clé emballée RSA-OAEP par destinataire.',
    owasp: 'A02',
  },
  {
    id: 'integrity',
    label: 'Intégrité',
    detail: 'SHA-256 au dépôt, HMAC-SHA-256 serveur sur les métadonnées, signature RSA-PSS 3072.',
    owasp: 'A08',
  },
  {
    id: 'pki',
    label: 'PKI locale',
    detail: 'AC racine RSA 3072, CSR signés, vérification de chaîne, expiration et révocation.',
    owasp: 'A02',
  },
  {
    id: 'audit',
    label: 'Journal d’audit',
    detail: 'Entrées horodatées chaînées par hachage, vérifiables, sans données sensibles.',
    owasp: 'A09',
  },
];

async function buildOverview(user) {
  const now = new Date();
  const start30 = new Date(now.getTime() - 30 * 86400000);
  const start7 = new Date(now.getTime() - 7 * 86400000);

  const [owned, received, signed, integrityFailures, failedLogins, activeSessions, cert] = await Promise.all([
    File.countDocuments({ owner: user._id }),
    Share.countDocuments({ recipient: user._id }),
    File.countDocuments({ owner: user._id, 'signed.signature': { $exists: true, $ne: null } }),
    AuditLog.countDocuments({
      action: 'integrity_failed',
      createdAt: { $gte: start30 },
      $or: [{ actorId: user._id }, { resourceOwner: user._id }],
    }),
    AuditLog.countDocuments({ action: 'login_failed', actorEmail: user.email, createdAt: { $gte: start7 } }),
    Session.countDocuments({ userId: user._id, revoked: false, expiresAt: { $gt: now } }),
    Certificate.findOne({ user: user._id, active: true }).sort({ createdAt: -1 }).lean(),
  ]);

  const certReport = cert
    ? verifyCertificate(cert.pem, { revoked: cert.revoked, expectedEmail: user.email })
    : { valid: false, reasons: ['Aucun certificat actif.'], checks: {}, details: null };

  let score = 100;
  if (!cert || !certReport.valid) score -= 14;
  score -= Math.min(16, integrityFailures * 8);
  if (failedLogins > 10) score -= 4;
  else if (failedLogins > 3) score -= 2;
  score = Math.max(35, Math.min(100, score));

  const level = score >= 90 ? 'excellent' : score >= 75 ? 'bon' : score >= 60 ? 'moyen' : 'faible';

  return {
    counts: {
      files: owned,
      sharedWithMe: received,
      signedFiles: signed,
      integrityFailures,
      failedLogins7d: failedLogins,
      activeSessions,
    },
    certificate: {
      exists: !!cert,
      serial: cert?.serial || null,
      mode: cert?.mode || null,
      revoked: cert?.revoked || false,
      valid: certReport.valid,
      reason: certReport.valid ? 'Certificat valide' : certReport.reasons[0],
      notAfter: cert?.notAfter || null,
    },
    score,
    level,
    protections: PROTECTIONS,
    headers: [
      { name: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; object-src 'none'" },
      { name: 'X-Content-Type-Options', value: 'nosniff' },
      { name: 'X-Frame-Options', value: 'DENY' },
      { name: 'Referrer-Policy', value: 'no-referrer' },
      { name: 'Cross-Origin-Resource-Policy', value: 'same-site' },
      { name: 'Strict-Transport-Security', value: 'max-age=15552000 (production HTTPS)' },
    ],
    generatedAt: now.toISOString(),
  };
}

module.exports = { buildOverview, PROTECTIONS };
