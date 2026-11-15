const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { ensureCA } = require('./utils/pki');
const { apiLimiter } = require('./middleware/rateLimit');
const { noMongoInjection } = require('./middleware/sanitize');
const { notFound, errorHandler } = require('./middleware/errors');

ensureCA();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
  })
);

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    exposedHeaders: ['X-Integrity-Status'],
    maxAge: 600,
  })
);

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
app.use(noMongoInjection);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'SecureFile V2', version: '2.0.0', time: new Date().toISOString() });
});

app.use('/api', apiLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/files', require('./routes/files'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/security', require('./routes/security'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use('/api', notFound);

const distDir = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use(errorHandler);

module.exports = app;
