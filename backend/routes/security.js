const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { AppError, wrap } = require('../utils/AppError');
const { buildOverview } = require('../services/securityOverview');
const { runCampaign } = require('../services/securityTests');
const audit = require('../services/audit');

const router = express.Router();

router.get(
  '/overview',
  requireAuth,
  wrap(async (req, res) => {
    res.json(await buildOverview(req.user));
  })
);

router.post(
  '/campaign',
  requireAuth,
  requireCsrf,
  wrap(async (req, res) => {
    const started = Date.now();
    const campaign = await runCampaign(req.user);
    const durationMs = Date.now() - started;

    await audit.record({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'security_campaign',
      resourceType: 'security',
      resourceId: campaign.campaignId,
      resourceOwner: req.user._id,
      outcome: campaign.summary.failed === 0 ? 'success' : 'warning',
      meta: {
        campaign: campaign.campaignId,
        total: campaign.summary.total,
        passed: campaign.summary.passed,
        failed: campaign.summary.failed,
        durationMs,
      },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ ...campaign, durationMs });
  })
);

router.get(
  '/headers',
  requireAuth,
  (req, res) => {
    res.json({
      request: {
        'content-security-policy': res.getHeader('content-security-policy') || null,
        'x-content-type-options': res.getHeader('x-content-type-options') || null,
        'x-frame-options': res.getHeader('x-frame-options') || null,
        'referrer-policy': res.getHeader('referrer-policy') || null,
      },
      note:
        'Les en-têtes sont appliqués par Helmet sur toutes les réponses. En développement, l’interface est servie par Vite ; en production, Express sert le build et applique la CSP complète.',
    });
  }
);

module.exports = router;
