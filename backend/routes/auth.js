const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const Session = require('../models/Session');
const config = require('../config');
const { AppError, wrap } = require('../utils/AppError');
const { validateEmail, validateUsername, validatePassword, passwordScore } = require('../utils/validators');
const { encryptPrivateKey, decryptPrivateKey, randomHex } = require('../utils/crypto');
const { createUserIdentity } = require('../utils/pki');
const { createSession, setSessionCookie, clearSessionCookie } = require('../services/sessions');
const { requireAuth } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { authLimiter, loginLimiter } = require('../middleware/rateLimit');
const vault = require('../services/keyVault');
const audit = require('../services/audit');
const { certificateView, publicUser } = require('../utils/serialize');

const router = express.Router();
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

function profile(user, csrfToken, session) {
  return {
    user: {
      ...publicUser(user),
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      publicKeyPem: user.publicKeyPem,
    },
    csrfToken,
    session: {
      expiresAt: session.expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    },
    keyUnlocked: true,
  };
}

router.get('/policy', (req, res) => {
  res.json({
    password: passwordScore('').checks.map(({ id, label }) => ({ id, label })),
    maxUploadMB: config.maxUploadBytes / (1024 * 1024),
    lockThreshold: config.lockThreshold,
    lockMinutes: config.lockMs / 60000,
  });
});

router.post(
  '/register',
  authLimiter,
  wrap(async (req, res) => {
    const { username, email, password } = req.body || {};
    if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      throw new AppError(400, 'VALIDATION', 'Champs invalides.');
    }
    const usernameError = validateUsername(username);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (usernameError) throw new AppError(400, 'USERNAME', usernameError);
    if (emailError) throw new AppError(400, 'EMAIL', emailError);
    if (passwordError) throw new AppError(400, 'PASSWORD', passwordError);

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse email.');

    const identity = createUserIdentity({ username: username.trim(), email: normalizedEmail, mode: 'valid' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: normalizedEmail,
      username: username.trim(),
      passwordHash,
      publicKeyPem: identity.publicKeyPem,
      privateKey: encryptPrivateKey(identity.privateKeyPem, password),
      lastLoginAt: new Date(),
    });

    const certificate = await Certificate.create({
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

    const { session, token, csrfToken } = await createSession(user, req);
    vault.set(session._id, identity.privateKeyPem);
    setSessionCookie(res, token);

    await audit.record({
      actorId: user._id,
      actorEmail: user.email,
      action: 'user_registered',
      resourceType: 'user',
      resourceId: user._id,
      outcome: 'success',
      meta: { username: user.username },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    await audit.record({
      actorId: user._id,
      actorEmail: user.email,
      action: 'cert_issued',
      resourceType: 'certificate',
      resourceId: certificate.serial,
      outcome: 'success',
      meta: { issuer: identity.issuerCN, serial: identity.serial },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      ...profile(user, csrfToken, session),
      certificate: certificateView(certificate, { active: true }),
    });
  })
);

router.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new AppError(400, 'VALIDATION', 'Email ou mot de passe invalide.');
    }
    const normalizedEmail = email.trim().toLowerCase();

    if (email.length > 254 || password.length > 128) {
      await audit.record({
        actorEmail: normalizedEmail.slice(0, 200),
        action: 'login_failed',
        outcome: 'failure',
        meta: { reason: 'invalid_input' },
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      throw new AppError(401, 'CREDENTIALS', 'Identifiants invalides.');
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      await audit.record({
        actorEmail: normalizedEmail,
        action: 'login_failed',
        outcome: 'failure',
        meta: { reason: 'unknown_account' },
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      throw new AppError(401, 'CREDENTIALS', 'Identifiants invalides.');
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      await audit.record({
        actorId: user._id,
        actorEmail: user.email,
        action: 'login_locked',
        outcome: 'warning',
        meta: { minutesRemaining: minutes },
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      throw new AppError(423, 'LOCKED', `Compte temporairement verrouillé. Réessayez dans ${minutes} minute(s).`);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      user.failedAttempts += 1;
      if (user.failedAttempts >= config.lockThreshold) {
        user.lockUntil = new Date(Date.now() + config.lockMs);
        user.failedAttempts = 0;
        await user.save();
        await audit.record({
          actorId: user._id,
          actorEmail: user.email,
          action: 'login_locked',
          outcome: 'warning',
          meta: { reason: 'too_many_failures', lockMinutes: config.lockMs / 60000 },
          ip: req.ip,
          userAgent: req.get('user-agent'),
        });
        throw new AppError(
          423,
          'LOCKED',
          `Trop d’échecs : compte verrouillé pendant ${config.lockMs / 60000} minutes.`
        );
      }
      await user.save();
      await audit.record({
        actorId: user._id,
        actorEmail: user.email,
        action: 'login_failed',
        outcome: 'failure',
        meta: { failedAttempts: user.failedAttempts },
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      throw new AppError(401, 'CREDENTIALS', 'Identifiants invalides.');
    }

    let privateKeyPem;
    try {
      privateKeyPem = decryptPrivateKey(user.privateKey, password);
    } catch {
      throw new AppError(500, 'KEY_UNLOCK', 'Impossible de déverrouiller la clé privée.');
    }

    user.failedAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    const { session, token, csrfToken } = await createSession(user, req);
    vault.set(session._id, privateKeyPem);
    setSessionCookie(res, token);

    await audit.record({
      actorId: user._id,
      actorEmail: user.email,
      action: 'login_success',
      outcome: 'success',
      meta: { sessionId: String(session._id).slice(-6) },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json(profile(user, csrfToken, session));
  })
);

router.get('/me', requireAuth, (req, res) => {
  res.json({
    ...profile(req.user, req.session.csrfToken, req.session),
    keyUnlocked: !!req.privateKeyPem,
  });
});

router.post(
  '/logout',
  requireAuth,
  requireCsrf,
  wrap(async (req, res) => {
    req.session.revoked = true;
    await req.session.save();
    vault.remove(req.session._id);
    clearSessionCookie(res);
    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'logout',
      outcome: 'success',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ ok: true });
  })
);

router.post(
  '/logout-all',
  requireAuth,
  requireCsrf,
  wrap(async (req, res) => {
    const sessions = await Session.find({ userId: req.user._id, revoked: false }).select('_id');
    sessions.forEach((s) => vault.remove(s._id));
    await Session.updateMany({ userId: req.user._id, revoked: false }, { $set: { revoked: true } });
    clearSessionCookie(res);
    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'session_revoked',
      outcome: 'success',
      meta: { sessions: sessions.length },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ ok: true, revoked: sessions.length });
  })
);

module.exports = router;
