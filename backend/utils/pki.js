const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');
const config = require('../config');
const { encryptPrivateKey, decryptPrivateKey } = require('./crypto');

const PKI_DIR = path.join(__dirname, '..', 'pki');
const CA_CERT_PATH = path.join(PKI_DIR, 'ca.crt.pem');
const CA_KEY_PATH = path.join(PKI_DIR, 'ca.key.enc');

const CA_SUBJECT = [
  { name: 'commonName', value: 'SecureFile Local Root CA' },
  { name: 'organizationName', value: 'SecureFile' },
  { name: 'organizationalUnitName', value: 'GLSI - PKI locale' },
  { name: 'countryName', value: 'TN' },
];

function generateRsaPair(bits = 3072) {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
}

function randomSerial() {
  return crypto.randomBytes(16).toString('hex');
}

function fingerprintOfDer(derBinary) {
  const digest = crypto.createHash('sha256').update(Buffer.from(derBinary, 'binary')).digest('hex');
  return digest.toUpperCase().match(/.{1,2}/g).join(':');
}

function buildRootCertificate({ privateKeyPem, publicKeyPem, subject, days = 1825, ca = true, cnSuffix = '' }) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date(Date.now() - 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + days * 86400000);
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.setExtensions([
    { name: 'basicConstraints', cA: ca, pathLenConstraint: ca ? 1 : undefined },
    { name: 'keyUsage', keyCertSign: ca, cRLSign: ca, digitalSignature: !ca },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(forge.pki.privateKeyFromPem(privateKeyPem), forge.md.sha256.create());
  if (cnSuffix) cert.subject = subject;
  return forge.pki.certificateToPem(cert);
}

function ensureCA() {
  fs.mkdirSync(PKI_DIR, { recursive: true });
  if (fs.existsSync(CA_CERT_PATH) && fs.existsSync(CA_KEY_PATH)) return;
  console.log('[PKI] Creating local root CA (RSA 3072, self-signed)...');
  const pair = generateRsaPair(3072);
  const certPem = buildRootCertificate({
    privateKeyPem: pair.privateKey,
    publicKeyPem: pair.publicKey,
    subject: CA_SUBJECT,
  });
  const encryptedKey = encryptPrivateKey(pair.privateKey, config.caPassphrase);
  fs.writeFileSync(CA_CERT_PATH, certPem, { mode: 0o600 });
  fs.writeFileSync(CA_KEY_PATH, JSON.stringify(encryptedKey, null, 2), { mode: 0o600 });
  console.log('[PKI] CA certificate written to pki/ca.crt.pem, encrypted key in pki/ca.key.enc');
}

function getCA() {
  if (!fs.existsSync(CA_CERT_PATH)) ensureCA();
  const certPem = fs.readFileSync(CA_CERT_PATH, 'utf8');
  const keyBlob = JSON.parse(fs.readFileSync(CA_KEY_PATH, 'utf8'));
  let privateKeyPem;
  try {
    privateKeyPem = decryptPrivateKey(keyBlob, config.caPassphrase);
  } catch {
    const err = new Error(
      'La clé privée de l’AC locale est illisible : CA_PASSPHRASE dans backend/.env ne correspond pas à backend/pki/ca.key.enc. Rétablissez le mot de passe utilisé lors de la création de l’AC, puis redémarrez le serveur.'
    );
    err.code = 'CA_KEY_LOCKED';
    throw err;
  }
  return {
    certPem,
    privateKeyPem,
    cert: forge.pki.certificateFromPem(certPem),
  };
}

function getCAInfo() {
  const { certPem } = getCA();
  const cert = forge.pki.certificateFromPem(certPem);
  return {
    subject: describeName(cert.subject.attributes),
    fingerprint: fingerprintOfDer(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    pem: certPem,
  };
}

function describeName(attributes) {
  const map = { CN: 'CN', O: 'O', OU: 'OU', C: 'C', emailAddress: 'E' };
  return attributes
    .filter((a) => a.shortName !== 'emailAddress' || a.value)
    .map((a) => `${map[a.shortName] || a.shortName}=${a.value}`)
    .join(', ');
}

function buildUserCertificate({ privateKeyPem, publicKeyPem, username, email, mode = 'valid', ca }) {
  const subject = [
    { name: 'commonName', value: username },
    { name: 'emailAddress', value: email },
    { name: 'organizationName', value: 'SecureFile Users' },
    { name: 'countryName', value: 'TN' },
  ];

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  csr.setSubject(subject);
  csr.sign(forge.pki.privateKeyFromPem(privateKeyPem), forge.md.sha256.create());
  const csrPem = forge.pki.certificationRequestToPem(csr);

  let issuerCa = ca || getCA();
  if (mode === 'rogue') {
    const roguePair = generateRsaPair(2048);
    const rogueCertPem = buildRootCertificate({
      privateKeyPem: roguePair.privateKey,
      publicKeyPem: roguePair.publicKey,
      subject: [
        { name: 'commonName', value: 'Rogue Intermediate CA' },
        { name: 'organizationName', value: 'Unknown Authority' },
        { name: 'countryName', value: 'XX' },
      ],
    });
    issuerCa = {
      certPem: rogueCertPem,
      privateKeyPem: roguePair.privateKey,
      cert: forge.pki.certificateFromPem(rogueCertPem),
    };
  }

  const caCert = forge.pki.certificateFromPem(issuerCa.certPem);
  const caPrivateKey = forge.pki.privateKeyFromPem(issuerCa.privateKeyPem);

  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey;
  cert.serialNumber = randomSerial();
  const now = Date.now();
  if (mode === 'expired') {
    cert.validity.notBefore = new Date(now - 400 * 86400000);
    cert.validity.notAfter = new Date(now - 10 * 86400000);
  } else {
    cert.validity.notBefore = new Date(now - 60000);
    cert.validity.notAfter = new Date(now + 365 * 86400000);
  }
  cert.setSubject(subject);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyEncipherment: true },
    { name: 'extKeyUsage', clientAuth: true, emailProtection: true },
    { name: 'subjectAltName', altNames: [{ type: 1, value: email }] },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: true },
  ]);
  cert.sign(caPrivateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  return {
    privateKeyPem,
    publicKeyPem,
    csrPem,
    certPem,
    serial: cert.serialNumber,
    subject: describeName(subject),
    issuer: describeName(caCert.subject.attributes),
    issuerCN: caCert.subject.getField('CN').value,
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    fingerprint: fingerprintOfDer(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
    mode,
  };
}

function createUserIdentity({ username, email, mode = 'valid' }) {
  const pair = generateRsaPair(3072);
  const material = buildUserCertificate({
    privateKeyPem: pair.privateKey,
    publicKeyPem: pair.publicKey,
    username,
    email,
    mode,
  });
  return material;
}

function reissueCertificate({ privateKeyPem, publicKeyPem, username, email, mode }) {
  return buildUserCertificate({ privateKeyPem, publicKeyPem, username, email, mode });
}

function describeCertificate(certPem) {
  const cert = forge.pki.certificateFromPem(certPem);
  const get = (field, attr) => {
    try {
      const attrs = cert[field].attributes;
      const found = attrs.find((a) => a.shortName === attr || a.name === attr || a.type === attr);
      if (found) return found.value;
      if (attr === 'emailAddress') {
        const emailAttr = attrs.find((a) => a.shortName === 'E' || a.name === 'emailAddress');
        return emailAttr?.value || null;
      }
      return null;
    } catch {
      return null;
    }
  };
  const keyUsage = cert.getExtension('keyUsage');
  return {
    subject: describeName(cert.subject.attributes),
    commonName: get('subject', 'CN'),
    email: get('subject', 'emailAddress'),
    organization: get('subject', 'O'),
    issuer: describeName(cert.issuer.attributes),
    issuerCN: get('issuer', 'CN'),
    serial: cert.serialNumber,
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    fingerprint: fingerprintOfDer(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
    signatureAlgorithm: 'sha256WithRSAEncryption',
    keyUsage: {
      digitalSignature: !!keyUsage?.digitalSignature,
      nonRepudiation: !!keyUsage?.nonRepudiation,
    },
    publicKeyPem: forge.pki.publicKeyToPem(cert.publicKey),
  };
}

function verifyCertificate(certPem, { revoked = false, expectedEmail = null, expectedPublicKeyPem = null } = {}) {
  const report = {
    valid: false,
    checks: {
      parse: false,
      issuedByLocalCA: false,
      withinValidity: false,
      keyUsage: false,
      notRevoked: !revoked,
      identityMatch: true,
    },
    reasons: [],
    details: null,
  };

  let cert;
  try {
    cert = forge.pki.certificateFromPem(certPem);
    report.checks.parse = true;
    report.details = describeCertificate(certPem);
  } catch {
    report.reasons.push('Certificat illisible (PEM invalide).');
    return report;
  }

  const { cert: caCert } = getCA();
  try {
    report.checks.issuedByLocalCA = caCert.verify(cert);
  } catch {
    report.checks.issuedByLocalCA = false;
  }
  if (!report.checks.issuedByLocalCA) {
    report.reasons.push('Certificat non approuvé : il n’est pas signé par l’AC locale SecureFile.');
  }

  const now = new Date();
  report.checks.withinValidity = now >= cert.validity.notBefore && now <= cert.validity.notAfter;
  if (now < cert.validity.notBefore) report.reasons.push('Certificat pas encore valide.');
  if (now > cert.validity.notAfter) report.reasons.push('Certificat expiré.');

  const usage = cert.getExtension('keyUsage');
  report.checks.keyUsage = !!usage?.digitalSignature;
  if (!report.checks.keyUsage) report.reasons.push('Le certificat n’autorise pas la signature numérique.');

  if (revoked) {
    report.reasons.push('Certificat révoqué par l’AC (liste de révocation).');
  }

  if (expectedEmail) {
    const email = report.details.email;
    if (!email || email.toLowerCase() !== expectedEmail.toLowerCase()) {
      report.checks.identityMatch = false;
      report.reasons.push('L’identité du titulaire ne correspond pas au signataire annoncé.');
    }
  }

  if (expectedPublicKeyPem) {
    const normalized = (pem) => pem.replace(/\s+/g, '');
    if (normalized(expectedPublicKeyPem) !== normalized(report.details.publicKeyPem)) {
      report.checks.identityMatch = false;
      report.reasons.push('La clé publique du certificat ne correspond pas à celle de l’utilisateur.');
    }
  }

  report.valid = report.reasons.length === 0;
  if (report.valid) report.reasons.push('Certificat valide : signé par l’AC locale, dans sa période de validité.');
  return report;
}

function checkCsr(csrPem) {
  try {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    return csr.verify();
  } catch {
    return false;
  }
}

module.exports = {
  PKI_DIR,
  ensureCA,
  getCA,
  getCAInfo,
  createUserIdentity,
  reissueCertificate,
  describeCertificate,
  verifyCertificate,
  checkCsr,
  generateRsaPair,
  fingerprintOfDer,
};
