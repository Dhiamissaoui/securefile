const express = require('express');
const AuditLog = require('../models/AuditLog');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../utils/AppError');
const audit = require('../services/audit');
const { auditView } = require('../utils/serialize');

const router = express.Router();

const GROUPS = {
  auth: ['user_registered', 'login_success', 'login_failed', 'login_locked', 'logout', 'session_revoked'],
  files: [
    'file_uploaded',
    'file_downloaded',
    'file_signed',
    'file_deleted',
    'file_shared',
    'share_revoked',
    'file_verified',
    'integrity_failed',
    'local_file_verified',
  ],
  certificates: ['cert_issued', 'cert_reissued', 'cert_revoked'],
  security: ['security_campaign', 'security_test'],
};

router.get(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(5, Number.parseInt(req.query.pageSize, 10) || 20));
    const group = String(req.query.group || '');
    const outcome = String(req.query.outcome || '');

    const and = [{ $or: [{ actorId: req.user._id }, { resourceOwner: req.user._id }] }];
    if (GROUPS[group]) and.push({ action: { $in: GROUPS[group] } });
    if (['success', 'failure', 'warning'].includes(outcome)) and.push({ outcome });
    const query = { $and: and };

    const [items, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ seq: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      items: items.map(auditView),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      groups: Object.keys(GROUPS),
    });
  })
);

router.get(
  '/verify-chain',
  requireAuth,
  wrap(async (req, res) => {
    const result = await audit.verifyChain();
    res.json(result);
  })
);

module.exports = router;
