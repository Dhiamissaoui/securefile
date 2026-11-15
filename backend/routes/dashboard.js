const express = require('express');
const File = require('../models/File');
const Share = require('../models/Share');
const AuditLog = require('../models/AuditLog');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../utils/AppError');
const { buildOverview } = require('../services/securityOverview');
const { fileView, auditView, certificateView } = require('../utils/serialize');
const Certificate = require('../models/Certificate');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    const userId = req.user._id;
    const overview = await buildOverview(req.user);

    const [ownedRecent, receivedShares, recentAudit, cert] = await Promise.all([
      File.find({ owner: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('owner', 'username email')
        .populate('signed.by', 'username email'),
      Share.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate({ path: 'file', populate: [{ path: 'owner', select: 'username email' }] }),
      AuditLog.find({ $or: [{ actorId: userId }, { resourceOwner: userId }] })
        .sort({ seq: -1 })
        .limit(7)
        .lean(),
      Certificate.findOne({ user: userId, active: true }).sort({ createdAt: -1 }).lean(),
    ]);

    const recentFiles = ownedRecent.map((f) => fileView(f, { viewerId: userId, signer: f.signed?.by }));
    const sharedFiles = receivedShares
      .filter((s) => s.file)
      .map((s) => fileView(s.file, { viewerId: userId, signer: null }));

    res.json({
      user: { id: String(req.user._id), username: req.user.username, email: req.user.email },
      overview,
      certificate: cert ? certificateView(cert, { active: true }) : null,
      recentFiles: [...recentFiles, ...sharedFiles]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 6),
      recentAudit: recentAudit.map(auditView),
    });
  })
);

module.exports = router;
