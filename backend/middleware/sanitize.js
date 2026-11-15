const { AppError } = require('../utils/AppError');

// Blocks MongoDB operator injection ($ne, $where, dotted paths) before it reaches Mongoose.
function scan(value, path = '') {
  if (!value || typeof value !== 'object') return;
  for (const [key, val] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      throw new AppError(400, 'INPUT_REJECTED', `Entrée refusée (${path}${key}).`);
    }
    if (val && typeof val === 'object') scan(val, `${path}${key}.`);
  }
}

function noMongoInjection(req, res, next) {
  try {
    scan(req.body);
    scan(req.query);
    scan(req.params);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { noMongoInjection };
