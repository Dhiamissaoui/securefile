const { AppError } = require('../utils/AppError');
const { constantEqual } = require('../utils/crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double protection: SameSite=Strict cookie + per-session CSRF token sent in a header.
function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const header = req.get('x-csrf-token');
  if (!header || !req.session?.csrfToken || !constantEqual(header, req.session.csrfToken)) {
    return next(new AppError(403, 'CSRF', 'Jeton CSRF manquant ou invalide.'));
  }
  next();
}

module.exports = { requireCsrf };
