/* eslint-disable no-console */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDb } = require('../db');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const { runCampaign } = require('../services/securityTests');
const audit = require('../services/audit');

async function main() {
  await connectDb();

  const actor = await User.findOne({ email: 'alice@securefile.local' }) || (await User.findOne());
  if (!actor) {
    throw new Error('Aucun utilisateur en base. Lancez d’abord « npm run seed ».');
  }

  console.log(`Campagne OWASP SecureFile V2 — exécutée par ${actor.username}`);
  console.log('');

  const started = Date.now();
  const campaign = await runCampaign(actor);
  const durationMs = Date.now() - started;

  for (const item of campaign.results) {
    const state = item.passed ? 'PASS' : 'FAIL';
    console.log(`[${state}] ${item.owasp.padEnd(7)} ${item.name}`);
    console.log(`        attendu : ${item.expected}`);
    console.log(`        observé : ${item.observed}`);
    if (!item.passed && item.evidence) console.log(`        preuve  : ${item.evidence}`);
  }

  console.log('');
  console.log(`${campaign.summary.passed}/${campaign.summary.total} tests réussis en ${durationMs} ms (campagne ${campaign.campaignId}).`);

  const certCount = await Certificate.countDocuments({ user: actor._id, active: true });
  await audit.record({
    actorId: actor._id,
    actorEmail: actor.email,
    action: 'security_campaign',
    resourceType: 'security',
    resourceId: campaign.campaignId,
    resourceOwner: actor._id,
    outcome: campaign.summary.failed === 0 ? 'success' : 'warning',
    meta: {
      campaign: campaign.campaignId,
      total: campaign.summary.total,
      passed: campaign.summary.passed,
      failed: campaign.summary.failed,
      durationMs,
      source: 'cli',
    },
  });
  console.log(`Certificat actif conservé : ${certCount}. Résultat journalisé dans l’audit.`);

  await mongoose.disconnect();
  process.exitCode = campaign.summary.failed === 0 ? 0 : 1;
}

main().catch(async (err) => {
  console.error('Campagne échouée :', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
