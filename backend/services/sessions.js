const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const config = require('../config');
const Session = require('../models/Session');
const { randomHex } = require('../utils/crypto');

async function createSession(user, req) {
  const sid = new mongoose.Types.ObjectId();
  const now = Date.now();
  const csrfToken = randomHex(24);
  const session = await Session.create({
    _id: sid,
    userId: user._id,
    csrfToken,
    expiresAt: new Date(now + config.sessionIdleMs),
    absoluteExpiresAt: new Date(now + config.sessionAbsoluteMs),
    lastSeenAt: new Date(now),
    ip: req.ip,
    userAgent: (req.get('user-agent') || '').slice(0, 200),
  });
  const token = jwt.sign({ sid: String(sid), uid: String(user._id) }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: Math.floor(config.sessionAbsoluteMs / 1000),
  });
  return { session, token, csrfToken };
}

function setSessionCookie(res, token) {
  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    path: '/',
    maxAge: config.sessionAbsoluteMs,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(config.sessionCookie, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    path: '/',
  });
}

module.exports = { createSession, setSessionCookie, clearSessionCookie };
