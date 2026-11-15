/* eslint-disable no-console */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const config = require('../config');
const { connectDb } = require('../db');
const User = require('../models/User');
const File = require('../models/File');
const Share = require('../models/Share');
const Certificate = require('../models/Certificate');
const { ensureCA, createUserIdentity } = require('../utils/pki');
const { encryptPrivateKey, decryptPrivateKey, signHash, wrapKeyFor } = require('../utils/crypto');
const { encryptAndStore } = require('../services/fileService');
const audit = require('../services/audit');

const DEMO_USERS = [
  {
    username: 'alice',
    email: 'alice@securefile.local',
    password: 'Alice@SecureFile2026',
  },
  {
    username: 'bob',
    email: 'bob@securefile.local',
    password: 'Bob@SecureFile2026!',
  },
];

const SAMPLE_FILES = [
  {
    owner: 'alice@securefile.local',
    name: 'Contrat_prestation_2026.txt',
    mimeType: 'text/plain; charset=utf-8',
    extension: 'txt',
    comment: 'Contrat de prestation — version finale signée',
    sign: true,
    shareWith: 'bob@securefile.local',
    content: [
      'CONTRAT DE PRESTATION DE SERVICES',
      '=================================',
      '',
      'Entre : SecureFile SAS, 12 rue du Chiffrement, Tunis',
      'Et : Société Exemple, 8 avenue de la Signature, Tunis',
      '',
      'Article 1 — Objet',
      'Le prestataire réalise une mission d’audit de sécurité applicative.',
      '',
      'Article 2 — Confidentialité',
      'Les documents échangés sont chiffrés AES-256-GCM et signés RSA-PSS 3072.',
      '',
      'Article 3 — Durée',
      'La mission se déroule sur huit semaines à compter de la signature.',
      '',
      'Fait à Tunis, le 13 novembre 2026.',
      'Alice — SecureFile',
      '',
    ].join('\n'),
  },
  {
    owner: 'alice@securefile.local',
    name: 'Politique_securite.md',
    mimeType: 'text/markdown; charset=utf-8',
    extension: 'md',
    comment: 'Politique interne — mots de passe et sessions',
    sign: true,
    content: [
      '# Politique de sécurité SecureFile',
      '',
      '- Mots de passe : 12 caractères minimum, bcrypt coût 12.',
      '- Sessions : cookie HttpOnly SameSite=Strict, expiration glissante 45 min.',
      '- Fichiers : AES-256-GCM, clé aléatoire emballée RSA-OAEP par destinataire.',
      '- Signatures : RSA-PSS 3072 sur l’empreinte SHA-256 recalculée.',
      '',
    ].join('\n'),
  },
  {
    owner: 'bob@securefile.local',
    name: 'Facture_2026.csv',
    mimeType: 'text/csv; charset=utf-8',
    extension: 'csv',
    comment: 'Facture de démonstration',
    sign: false,
    content: ['date,libelle,montant', '2026-11-02,Audit de sécurité,1200.00', '2026-11-10,Formation PKI,450.00', ''].join(
      '\n'
    ),
  },
];

async function ensureUser(spec) {
  let user = await User.findOne({ email: spec.email });
  if (!user) {
    const identity = createUserIdentity({ username: spec.username, email: spec.email, mode: 'valid' });
    const passwordHash = await bcrypt.hash(spec.password, 12);
    user = await User.create({
      email: spec.email,
      username: spec.username,
      passwordHash,
      publicKeyPem: identity.publicKeyPem,
      privateKey: encryptPrivateKey(identity.privateKeyPem, spec.password),
      lastLoginAt: new Date(),
    });

    await Certificate.create({
      user: user._id,
      subject: identity.subject,
      issuer: identity.issuer,
      issuerCN: identity.issuerCN,
      serial: identity.serial,
      fingerprint: identity.fingerprint,
      pem: identity.certPem,
      csrPem: identity.csrPem,
      notBefore: identity.notBefore,
      notAfter: identity.notAfter,
      mode: 'valid',
      active: true,
    });

    await audit.record({
      actorId: user._id,
      actorEmail: user.email,
      action: 'user_registered',
      resourceType: 'user',
      resourceId: user._id,
      outcome: 'success',
      meta: { username: user.username, seeded: true },
    });
    await audit.record({
      actorId: user._id,
      actorEmail: user.email,
      action: 'cert_issued',
      resourceType: 'certificate',
      resourceId: identity.serial,
      outcome: 'success',
      meta: { issuer: identity.issuerCN, serial: identity.serial, seeded: true },
    });

    console.log(`  + compte ${spec.username} <${spec.email}> créé avec certificat X.509`);
  } else {
    console.log(`  = compte ${spec.username} déjà présent`);
  }

  let cert = await Certificate.findOne({ user: user._id, active: true }).sort({ createdAt: -1 });
  if (!cert) {
    const identity = createUserIdentity({ username: user.username, email: user.email, mode: 'valid' });
    cert = await Certificate.create({
      user: user._id,
      subject: identity.subject,
      issuer: identity.issuer,
      issuerCN: identity.issuerCN,
      serial: identity.serial,
      fingerprint: identity.fingerprint,
      pem: identity.certPem,
      csrPem: identity.csrPem,
      notBefore: identity.notBefore,
      notAfter: identity.notAfter,
      mode: 'valid',
      active: true,
    });
    user.publicKeyPem = identity.publicKeyPem;
    user.privateKey = encryptPrivateKey(identity.privateKeyPem, spec.password);
    await user.save();
  }

  const privateKeyPem = decryptPrivateKey(user.privateKey, spec.password);
  return { user, cert, privateKeyPem };
}

async function seedFile(spec, byEmail) {
  const owner = byEmail.get(spec.owner);
  if (!owner) throw new Error(`Propriétaire introuvable : ${spec.owner}`);

  const existing = await File.findOne({ owner: owner.user._id, originalName: spec.name });
  if (existing) {
    console.log(`  = fichier ${spec.name} déjà présent`);
    return;
  }

  const buffer = Buffer.from(spec.content, 'utf8');
  const stored = encryptAndStore({
    buffer,
    ownerId: owner.user._id,
    ownerPublicKeyPem: owner.user.publicKeyPem,
    originalName: spec.name,
    mimeType: spec.mimeType,
    extension: spec.extension,
    comment: spec.comment,
  });

  const keyWraps = [{ user: owner.user._id, wrappedKey: stored.keyWrap }];
  let shared = null;

  if (spec.shareWith) {
    const recipient = byEmail.get(spec.shareWith);
    if (!recipient) throw new Error(`Destinataire introuvable : ${spec.shareWith}`);
    keyWraps.push({ user: recipient.user._id, wrappedKey: wrapKeyFor(recipient.user.publicKeyPem, stored.fileKey) });
    shared = recipient;
  }

  const file = await File.create({
    owner: owner.user._id,
    originalName: spec.name,
    storedName: stored.storedName,
    mimeType: stored.mimeType,
    extension: stored.extension,
    size: stored.size,
    comment: spec.comment,
    sha256: stored.sha256,
    hmac: stored.hmac,
    iv: stored.iv,
    authTag: stored.authTag,
    keyWraps,
    signed: spec.sign
      ? {
          by: owner.user._id,
          signature: signHash(stored.sha256, owner.privateKeyPem),
          signedHash: stored.sha256,
          certSerial: owner.cert.serial,
          signedAt: new Date(),
        }
      : null,
  });

  await audit.record({
    actorId: owner.user._id,
    actorEmail: owner.user.email,
    action: 'file_uploaded',
    resourceType: 'file',
    resourceId: file._id,
    resourceOwner: owner.user._id,
    outcome: 'success',
    meta: { fileName: file.originalName, size: file.size, extension: file.extension, seeded: true },
  });

  if (spec.sign) {
    await audit.record({
      actorId: owner.user._id,
      actorEmail: owner.user.email,
      action: 'file_signed',
      resourceType: 'file',
      resourceId: file._id,
      resourceOwner: owner.user._id,
      outcome: 'success',
      meta: { fileName: file.originalName, certSerial: owner.cert.serial, seeded: true },
    });
  }

  if (shared) {
    await Share.create({
      file: file._id,
      owner: owner.user._id,
      recipient: shared.user._id,
      wrappedKey: keyWraps[1].wrappedKey,
    });
    await audit.record({
      actorId: owner.user._id,
      actorEmail: owner.user.email,
      action: 'file_shared',
      resourceType: 'file',
      resourceId: file._id,
      resourceOwner: owner.user._id,
      outcome: 'success',
      meta: { fileName: file.originalName, recipient: shared.user.username, seeded: true },
    });
  }

  console.log(`  + fichier ${spec.name} chiffré${spec.sign ? ', signé' : ''}${shared ? `, partagé avec ${shared.user.username}` : ''}`);
}

async function main() {
  console.log(`Seed SecureFile V2 → base « ${config.mongoDb} »`);
  ensureCA();
  await connectDb();

  const byEmail = new Map();
  console.log('Comptes de démonstration :');
  for (const spec of DEMO_USERS) {
    const record = await ensureUser(spec);
    byEmail.set(spec.email, record);
  }

  console.log('Fichiers de démonstration :');
  for (const spec of SAMPLE_FILES) {
    await seedFile(spec, byEmail);
  }

  const [users, files, certs, shares] = await Promise.all([
    User.countDocuments(),
    File.countDocuments(),
    Certificate.countDocuments({ active: true }),
    Share.countDocuments(),
  ]);

  console.log('');
  console.log(`Base prête : ${users} utilisateur(s), ${files} fichier(s), ${certs} certificat(s) actif(s), ${shares} partage(s).`);
  console.log('');
  console.log('Identifiants de démonstration :');
  for (const spec of DEMO_USERS) {
    console.log(`  ${spec.username.padEnd(6)} ${spec.email}  /  ${spec.password}`);
  }
  console.log('');
  console.log('Scénario : connectez-vous en Alice, partagez le contrat avec Bob, puis vérifiez-le en Bob.');
  console.log('Attaque : onglet Vérification → fichier → « Modifier 1 octet » depuis le centre de sécurité, ou réémettez un certificat expiré.');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seed échoué :', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
