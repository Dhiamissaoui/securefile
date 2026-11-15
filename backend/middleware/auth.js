const jwt = require('jsonwebtoken');
const config = require('../config');
const Session = require('../models/Session');
const User = require('../models/User');
const vault = require('../services/keyVault');
const { AppError, wrap } = require('../utils/AppError');

const requireAuth = wrap(async (req, res, next) => {
  const token = req.cookies?.[config.sessionCookie];
  if (!token) throw new AppError(401, 'AUTH_REQUIRED', 'Authentification requise.');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new AppError(401, 'AUTH_INVALID', 'Session invalide ou expirée.');
  }

  const session = await Session.findById(payload.sid);
  const now = Date.now();
  if (
    !session ||
    session.revoked ||
    session.expiresAt.getTime() < now ||
    session.absoluteExpiresAt.getTime() < now ||
    String(session.userId) !== String(payload.uid)
  ) {
    throw new AppError(401, 'AUTH_EXPIRED', 'Session expirée. Veuillez vous reconnecter.');
  }

  const user = await User.findById(session.userId);
  if (!user) throw new AppError(401, 'AUTH_USER', 'Compte introuvable.');

  if (now - session.lastSeenAt.getTime() > 60 * 1000) {
    session.lastSeenAt = new Date(now);
    session.expiresAt = new Date(Math.min(now + config.sessionIdleMs, session.absoluteExpiresAt.getTime()));
    await session.save();
  }

  req.user = user;
  req.session = session;
  req.privateKeyPem = vault.get(session._id);
  req.clientMeta = { ip: req.ip, userAgent: req.get('user-agent') || '', actorEmail: user.email };
  next();
});

module.exports = { requireAuth };
