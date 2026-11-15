const request = require('supertest');
const User = require('../models/User');
const File = require('../models/File');
const Share = require('../models/Share');
const Certificate = require('../models/Certificate');
const Session = require('../models/Session');
const { decryptPrivateKey, signHash, sha256, randomHex } = require('../utils/crypto');
const { removeCiphertext, storedPath } = require('./fileService');
const fs = require('fs');

const PASSWORD = 'Audit@SecureFile2026';
const TXT = Buffer.from('Contrat de démonstration SecureFile — contenu de test fictif.\n', 'utf8');

function short(value, max = 90) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function register(agent, label, campaignId) {
  const suffix = `${campaignId}${randomHex(2)}`;
  const res = await agent.post('/api/auth/register').send({
    username: `${label}_${suffix}`.slice(0, 24),
    email: `${label}.${suffix}@securefile.test`,
    password: PASSWORD,
  });
  if (res.status !== 201) throw new Error(`Création du compte de test ${label} échouée (${res.status})`);
  return { user: res.body.user, csrf: res.body.csrfToken, email: `${label}.${suffix}@securefile.test` };
}

function result(def, passed, observed, evidence) {
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    owasp: def.owasp,
    expected: def.expected,
    passed: !!passed,
    observed,
    evidence: short(evidence, 160),
  };
}

async function runCampaign(actor) {
  // eslint-disable-next-line global-require
  const app = require('../app');
  const campaignId = randomHex(4);
  const agentA = request.agent(app);
  const agentB = request.agent(app);
  const results = [];
  const createdFiles = [];
  let userA;
  let userB;
  let userC;

  const defs = {
    passwordPolicy: {
      id: 'password-policy',
      name: 'Politique de mot de passe',
      category: 'Authentification',
      owasp: 'A07',
      expected: 'Refus d’un mot de passe faible (HTTP 400)',
    },
    nosql: {
      id: 'nosql-injection',
      name: 'Injection NoSQL sur le login',
      category: 'Injection',
      owasp: 'A03',
      expected: 'Payload {"$ne":null} rejeté (HTTP 400)',
    },
    xss: {
      id: 'stored-xss',
      name: 'XSS stocké dans un commentaire',
      category: 'Injection',
      owasp: 'A03',
      expected: 'Balises neutralisées avant stockage',
    },
    idorDownload: {
      id: 'idor-download',
      name: 'IDOR sur le téléchargement',
      category: 'Contrôle d’accès',
      owasp: 'A01',
      expected: 'Accès au fichier d’autrui refusé (HTTP 403)',
    },
    idorDelete: {
      id: 'idor-delete',
      name: 'IDOR sur la suppression',
      category: 'Contrôle d’accès',
      owasp: 'A01',
      expected: 'Suppression par un non-propriétaire refusée (HTTP 403)',
    },
    csrf: {
      id: 'csrf',
      name: 'Requête sans jeton CSRF',
      category: 'Sessions',
      owasp: 'A01/A05',
      expected: 'Requête mutante sans jeton refusée (HTTP 403)',
    },
    uploadType: {
      id: 'upload-type',
      name: 'Téléversement exécutable',
      category: 'Téléversement',
      owasp: 'A04/A05',
      expected: 'Fichier .exe refusé (HTTP 400)',
    },
    doubleExt: {
      id: 'double-extension',
      name: 'Double extension',
      category: 'Téléversement',
      owasp: 'A04',
      expected: 'facture.pdf.exe refusé (HTTP 400)',
    },
    traversal: {
      id: 'path-traversal',
      name: 'Chemin relatif dans le nom',
      category: 'Téléversement',
      owasp: 'A05',
      expected: 'Nom contenant ../ refusé (HTTP 400)',
    },
    oversize: {
      id: 'oversize',
      name: 'Fichier trop volumineux',
      category: 'Téléversement',
      owasp: 'A04',
      expected: 'Fichier > 10 Mo refusé (HTTP 413)',
    },
    tamperFile: {
      id: 'tamper-file',
      name: 'Fichier chiffré modifié (1 octet)',
      category: 'Intégrité',
      owasp: 'A08',
      expected: 'AES-GCM rejette le fichier',
    },
    tamperHash: {
      id: 'tamper-hash',
      name: 'Empreinte modifiée en base',
      category: 'Intégrité',
      owasp: 'A08',
      expected: 'HMAC invalide détecté',
    },
    forgedSignature: {
      id: 'forged-signature',
      name: 'Signature produite par un autre utilisateur',
      category: 'Signature',
      owasp: 'A08',
      expected: 'Signature rejetée par le certificat du signataire',
    },
    expiredCert: {
      id: 'expired-cert',
      name: 'Certificat expiré',
      category: 'PKI',
      owasp: 'A02',
      expected: 'Certificat refusé avec message explicite',
    },
    rogueCert: {
      id: 'rogue-ca',
      name: 'Certificat émis par une AC inconnue',
      category: 'PKI',
      owasp: 'A02',
      expected: 'Certificat non approuvé',
    },
    localFile: {
      id: 'local-file',
      name: 'Vérification manuelle d’un fichier local',
      category: 'Intégrité',
      owasp: 'A08',
      expected: 'Copie modifiée détectée par comparaison SHA-256',
    },
    lockout: {
      id: 'brute-force',
      name: 'Force brute (5 échecs)',
      category: 'Authentification',
      owasp: 'A07',
      expected: 'Compte verrouillé (HTTP 423)',
    },
    logout: {
      id: 'logout-invalidation',
      name: 'Réutilisation de session après déconnexion',
      category: 'Sessions',
      owasp: 'A07',
      expected: 'Ancienne session refusée (HTTP 401)',
    },
    headers: {
      id: 'security-headers',
      name: 'En-têtes de sécurité HTTP',
      category: 'Configuration',
      owasp: 'A05',
      expected: 'CSP, nosniff et anti-clickjacking présents',
    },
  };

  async function test(def, fn) {
    try {
      const out = await fn();
      results.push(result(def, out.passed, out.observed, out.evidence));
    } catch (err) {
      results.push(result(def, false, `Erreur : ${err.message}`, ''));
    }
  }

  try {
    await test(defs.passwordPolicy, async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'weak_user', email: `weak.${campaignId}@securefile.test`, password: 'azerty' });
      return { passed: res.status === 400, observed: `HTTP ${res.status}`, evidence: res.body?.error?.message };
    });

    await test(defs.nosql, async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: { $ne: null }, password: { $ne: null } });
      return { passed: res.status === 400, observed: `HTTP ${res.status}`, evidence: res.body?.error?.message };
    });

    const A = await register(agentA, 'audit_a', campaignId);
    userA = await User.findById(A.user.id);
    const B = await register(agentB, 'audit_b', campaignId);
    userB = await User.findById(B.user.id);

    const upload = await agentA
      .post('/api/files')
      .set('x-csrf-token', A.csrf)
      .field('comment', '<script>alert("xss")</script> Contrat')
      .attach('file', TXT, { filename: 'contrat-audit.txt', contentType: 'text/plain' });
    const fileA = upload.body;
    if (fileA?.id) createdFiles.push(fileA.id);
    const fileDoc = fileA?.id ? await File.findById(fileA.id) : null;
    if (fileDoc) createdFiles[createdFiles.length - 1] = fileDoc;

    await test(defs.xss, async () => {
      const sanitized = typeof fileA?.comment === 'string' && !fileA.comment.includes('<');
      return {
        passed: upload.status === 201 && sanitized,
        observed: sanitized ? 'Commentaire neutralisé' : 'Balise HTML conservée',
        evidence: fileA?.comment,
      };
    });

    await test(defs.idorDownload, async () => {
      const res = await agentB.get(`/api/files/${fileA.id}/download`);
      return { passed: res.status === 403, observed: `HTTP ${res.status}`, evidence: res.body?.error?.message };
    });

    await test(defs.idorDelete, async () => {
      const res = await agentB.delete(`/api/files/${fileA.id}`).set('x-csrf-token', B.csrf);
      return { passed: res.status === 403, observed: `HTTP ${res.status}`, evidence: res.body?.error?.message };
    });

    await test(defs.csrf, async () => {
      const res = await agentA.post(`/api/files/${fileA.id}/share`).send({ email: B.email });
      return { passed: res.status === 403, observed: `HTTP ${res.status}`, evidence: res.body?.error?.message };
    });

    await test(defs.uploadType, async () => {
      const res = await agentA
        .post('/api/files')
        .set('x-csrf-token', A.csrf)
        .attach('file', Buffer.from('MZfake-executable'), { filename: 'malware.exe' });
      return { passed: res.status === 400, observed: `HTTP ${res.status}`, evidence: res.body?.error?.message };
    });

    await test(defs.doubleExt, async () => {
      const res = await agentA
        .post('/api/files')
        .set('x-csrf-token', A.csrf)
        .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'facture.pdf.exe' });
      return { passed: res.status === 400, observed: `HTTP ${res.status}`, evidence: res.body?.error?.message };
    });

    await test(defs.traversal, async () => {
      const res = await agentA
        .post('/api/files')
        .set('x-csrf-token', A.csrf)
        .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: '..\\..\\secret.pdf' });
      if (res.body?.id) {
        const doc = await File.findById(res.body.id);
        if (doc) createdFiles.push(doc);
      }
      const storedName = res.body?.name || '';
      const sanitized = !/[\\/]|\.\./.test(storedName);
      const passed = res.status === 400 || (res.status === 201 && sanitized);
      return {
        passed,
        observed: res.status === 400 ? 'Nom refusé (HTTP 400)' : `Nom neutralisé : ${storedName || '—'}`,
        evidence: res.body?.error?.message || 'Aucun chemin relatif conservé',
      };
    });

    await test(defs.oversize, async () => {
      const big = Buffer.alloc(10 * 1024 * 1024 + 1024, 0x25);
      const res = await agentA
        .post('/api/files')
        .set('x-csrf-token', A.csrf)
        .attach('file', big, { filename: 'volumineux.pdf', contentType: 'application/pdf' });
      return { passed: res.status === 413, observed: `HTTP ${res.status}`, evidence: res.body?.error?.message };
    });

    // Signature nominale pour les tests de certification
    const sign = await agentA.post(`/api/files/${fileA.id}/sign`).set('x-csrf-token', A.csrf);
    const signedOk = sign.status === 200;

    await test(defs.tamperFile, async () => {
      const target = await File.findById(fileA.id);
      const before = fs.readFileSync(storedPath(target.storedName));
      const p = storedPath(target.storedName);
      const mutated = Buffer.from(before);
      mutated[0] ^= 0xff;
      fs.writeFileSync(p, mutated);
      const res = await agentA.get(`/api/files/${fileA.id}/verify`);
      fs.writeFileSync(p, before);
      return {
        passed: res.status === 200 && res.body.checks.aesGcm.ok === false,
        observed: res.body?.checks?.aesGcm?.ok ? 'Fichier accepté' : 'Tag GCM rejeté',
        evidence: res.body?.checks?.aesGcm?.message,
      };
    });

    await test(defs.tamperHash, async () => {
      const doc = await File.findById(fileA.id);
      const original = doc.sha256;
      await File.updateOne({ _id: doc._id }, { $set: { sha256: sha256('forged') } });
      const res = await agentA.get(`/api/files/${fileA.id}/verify`);
      await File.updateOne({ _id: doc._id }, { $set: { sha256: original } });
      return {
        passed: res.body?.checks?.hmac?.ok === false,
        observed: res.body?.checks?.hmac?.ok ? 'HMAC accepté' : 'HMAC invalide détecté',
        evidence: res.body?.checks?.hmac?.message,
      };
    });

    await test(defs.forgedSignature, async () => {
      const doc = await File.findById(fileA.id);
      const privB = decryptPrivateKey(userB.privateKey, PASSWORD);
      doc.signed = {
        by: userA._id,
        signature: signHash(doc.sha256, privB),
        signedHash: doc.sha256,
        certSerial: doc.signed?.certSerial,
        signedAt: new Date(),
      };
      await doc.save();
      const res = await agentA.get(`/api/files/${fileA.id}/verify`);
      return {
        passed: res.body?.checks?.signature?.ok === false,
        observed: res.body?.checks?.signature?.ok ? 'Signature acceptée' : 'Signature rejetée',
        evidence: res.body?.checks?.signature?.message,
      };
    });

    await test(defs.expiredCert, async () => {
      const reissue = await agentA
        .post('/api/certificates/reissue')
        .set('x-csrf-token', A.csrf)
        .send({ mode: 'expired' });
      const expiredSerial = reissue.body?.certificate?.serial;
      await File.updateOne({ _id: fileA.id }, { $set: { 'signed.certSerial': expiredSerial } });
      const res = await agentA.get(`/api/files/${fileA.id}/verify`);
      await agentA.post('/api/certificates/reissue').set('x-csrf-token', A.csrf).send({ mode: 'valid' });
      return {
        passed: reissue.status === 201 && res.body?.checks?.certificate?.ok === false,
        observed: res.body?.checks?.certificate?.ok ? 'Certificat accepté' : 'Certificat expiré refusé',
        evidence: res.body?.checks?.certificate?.message,
      };
    });

    await test(defs.rogueCert, async () => {
      const reissue = await agentA
        .post('/api/certificates/reissue')
        .set('x-csrf-token', A.csrf)
        .send({ mode: 'rogue' });
      const rogueSerial = reissue.body?.certificate?.serial;
      await File.updateOne({ _id: fileA.id }, { $set: { 'signed.certSerial': rogueSerial } });
      const res = await agentA.get(`/api/files/${fileA.id}/verify`);
      await agentA.post('/api/certificates/reissue').set('x-csrf-token', A.csrf).send({ mode: 'valid' });
      return {
        passed:
          reissue.status === 201 &&
          res.body?.checks?.certificate?.ok === false &&
          (res.body?.checks?.certificate?.reasons || []).some((r) => /approuv/i.test(r)),
        observed: res.body?.checks?.certificate?.ok ? 'Certificat accepté' : 'AC inconnue refusée',
        evidence: res.body?.checks?.certificate?.message,
      };
    });

    await test(defs.localFile, async () => {
      const modified = Buffer.from(TXT);
      modified[0] ^= 0x01;
      const res = await agentA
        .post(`/api/files/${fileA.id}/verify-local`)
        .set('x-csrf-token', A.csrf)
        .attach('file', modified, { filename: 'copie-modifiee.txt', contentType: 'text/plain' });
      return {
        passed: res.status === 200 && res.body?.match === false,
        observed: res.body?.match === false ? 'Copie modifiée détectée' : 'Copie acceptée',
        evidence: res.body?.computed,
      };
    });

    const C = await register(request.agent(app), 'audit_c', campaignId);
    userC = await User.findById(C.user.id);
    await test(defs.lockout, async () => {
      let last;
      for (let i = 0; i < 5; i += 1) {
        last = await request(app).post('/api/auth/login').send({ email: C.email, password: 'Wrong@Password123' });
      }
      return {
        passed: last.status === 423,
        observed: `HTTP ${last.status} au 5e échec`,
        evidence: last.body?.error?.message,
      };
    });

    await test(defs.logout, async () => {
      const out = await agentB.post('/api/auth/logout').set('x-csrf-token', B.csrf);
      const me = await agentB.get('/api/auth/me');
      return {
        passed: out.status === 200 && me.status === 401,
        observed: `Déconnexion ${out.status}, session ${me.status}`,
        evidence: me.body?.error?.message,
      };
    });

    await test(defs.headers, async () => {
      const res = await request(app).get('/api/health');
      const csp = res.headers['content-security-policy'] || '';
      const passed =
        csp.includes("default-src 'self'") &&
        res.headers['x-content-type-options'] === 'nosniff' &&
        !!res.headers['x-frame-options'];
      return {
        passed,
        observed: passed ? 'En-têtes présents' : 'En-têtes manquants',
        evidence: `CSP: ${short(csp, 60)}`,
      };
    });

    return {
      campaignId,
      startedBy: { id: String(actor._id), username: actor.username },
      results,
      summary: {
        total: results.length,
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
      },
      signedNominal: signedOk,
    };
  } finally {
    try {
      const ids = createdFiles.filter((x) => x && x.storedName).map((x) => x.storedName);
      for (const name of ids) removeCiphertext(name);
      const fileIds = createdFiles.filter(Boolean).map((f) => f._id || f.id);
      await Share.deleteMany({ file: { $in: fileIds } });
      await File.deleteMany({ _id: { $in: fileIds } });
      const userIds = [userA?._id, userB?._id, userC?._id].filter(Boolean);
      if (userIds.length) {
        await Certificate.deleteMany({ user: { $in: userIds } });
        await Session.deleteMany({ userId: { $in: userIds } });
        await Share.deleteMany({ $or: [{ owner: { $in: userIds } }, { recipient: { $in: userIds } }] });
        await User.deleteMany({ _id: { $in: userIds } });
      }
    } catch (cleanupError) {
      console.error('[security-campaign] cleanup failed:', cleanupError.message);
    }
  }
}

module.exports = { runCampaign };
