const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const required = ['MONGO_URI', 'JWT_SECRET', 'HMAC_KEY', 'CA_PASSPHRASE'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error(`Missing environment variables: ${missing.join(', ')} (see .env.example)`);
}

const placeholderKeys = ['JWT_SECRET', 'HMAC_KEY', 'CA_PASSPHRASE'].filter((key) => process.env[key] === 'change-me');
if (placeholderKeys.length) {
  console.warn(
    `[config] Valeurs d’exemple détectées (${placeholderKeys.join(', ')}). ` +
      'Générez des secrets aléatoires avant utilisation (README, section 3.1) et ne les modifiez plus après le premier seed.'
  );
}

module.exports = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI,
  mongoDb: process.env.MONGO_DB || 'securefile_v2',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET,
  hmacKey: process.env.HMAC_KEY,
  caPassphrase: process.env.CA_PASSPHRASE,
  isProd: process.env.NODE_ENV === 'production',
  sessionCookie: 'sf_session',
  maxUploadBytes: 10 * 1024 * 1024,
  sessionIdleMs: 45 * 60 * 1000,
  sessionAbsoluteMs: 8 * 60 * 60 * 1000,
  lockThreshold: 5,
  lockMs: 15 * 60 * 1000,
};
