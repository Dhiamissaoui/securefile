const multer = require('multer');
const { AppError } = require('../utils/AppError');

function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable.' } });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: { code: 'FILE_TOO_LARGE', message: 'Fichier trop volumineux (10 Mo maximum).' },
      });
    }
    return res.status(400).json({ error: { code: 'UPLOAD', message: 'Téléversement invalide.' } });
  }

  if (err.code === 'FILE_TYPE') {
    return res.status(400).json({
      error: { code: 'FILE_TYPE', message: 'Type de fichier refusé (liste blanche d’extensions).' },
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ error: { code: 'BAD_ID', message: 'Identifiant invalide.' } });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Corps de requête JSON invalide.' } });
  }

  if (err.code === 11000) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Cette ressource existe déjà.' } });
  }

  if (err.code === 'CA_KEY_LOCKED') {
    return res.status(503).json({ error: { code: 'CA_KEY_LOCKED', message: err.message } });
  }

  console.error('[error]', err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Erreur interne du serveur.' } });
}

module.exports = { notFound, errorHandler };
