const rateLimit = require('express-rate-limit');

function json429(message) {
  return (req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMIT', message } });
  };
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 900,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json429('Trop de requêtes. Réessayez dans quelques instants.'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json429('Trop de tentatives depuis cette adresse. Réessayez plus tard.'),
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json429('Trop de tentatives de connexion. Réessayez dans quelques minutes.'),
});

module.exports = { apiLimiter, authLimiter, loginLimiter };
