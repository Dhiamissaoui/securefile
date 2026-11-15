const { sha256 } = require('../utils/crypto');
const AuditLog = require('../models/AuditLog');

const SENSITIVE_KEY = /pass(?!ed)|secret|token|private|wrapped|signature|key/i;
let queue = Promise.resolve();

function cleanValue(value, depth = 0) {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 200);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 2) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => cleanValue(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) continue;
      out[k] = cleanValue(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 100);
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

function buildPayload(doc) {
  return {
    seq: doc.seq,
    ts: new Date(doc.createdAt).toISOString(),
    actorId: doc.actorId ? String(doc.actorId) : null,
    actorEmail: doc.actorEmail || null,
    action: doc.action,
    resourceType: doc.resourceType || null,
    resourceId: doc.resourceId || null,
    resourceOwner: doc.resourceOwner ? String(doc.resourceOwner) : null,
    outcome: doc.outcome,
    meta: doc.meta || {},
  };
}

function computeHash(prevHash, doc) {
  return sha256(`${prevHash}|${canonical(buildPayload(doc))}`);
}

async function writeEntry(entry) {
  const last = await AuditLog.findOne().sort({ seq: -1 }).select('seq hash').lean();
  const doc = {
    seq: (last?.seq || 0) + 1,
    actorId: entry.actorId || null,
    actorEmail: entry.actorEmail || null,
    action: entry.action,
    resourceType: entry.resourceType || null,
    resourceId: entry.resourceId ? String(entry.resourceId) : null,
    resourceOwner: entry.resourceOwner || null,
    outcome: entry.outcome || 'success',
    meta: cleanValue(entry.meta || {}),
    ip: entry.ip || null,
    userAgent: (entry.userAgent || '').slice(0, 200) || null,
    prevHash: last?.hash || 'GENESIS',
    createdAt: new Date(),
  };
  doc.hash = computeHash(doc.prevHash, doc);
  try {
    return await AuditLog.create(doc);
  } catch (err) {
    if (err.code === 11000) {
      const retryLast = await AuditLog.findOne().sort({ seq: -1 }).select('seq hash').lean();
      doc.seq = (retryLast?.seq || 0) + 1;
      doc.prevHash = retryLast?.hash || 'GENESIS';
      doc.hash = computeHash(doc.prevHash, doc);
      return AuditLog.create(doc);
    }
    throw err;
  }
}

// Writes are serialized in-process so the hash chain never forks.
function record(entry) {
  queue = queue.then(() => writeEntry(entry)).catch((err) => {
    console.error('[audit] write failed:', err.message);
  });
  return queue;
}

async function verifyChain(limit = 5000) {
  const logs = await AuditLog.find().sort({ seq: 1 }).limit(limit).lean();
  let prevHash = 'GENESIS';
  for (let i = 0; i < logs.length; i += 1) {
    const log = logs[i];
    if (log.seq !== i + 1) {
      return { valid: false, count: logs.length, brokenAt: log.seq, reason: 'Séquence manquante' };
    }
    if (log.prevHash !== prevHash) {
      return { valid: false, count: logs.length, brokenAt: log.seq, reason: 'Chaînage incohérent' };
    }
    const expected = computeHash(log.prevHash, log);
    if (expected !== log.hash) {
      return { valid: false, count: logs.length, brokenAt: log.seq, reason: 'Empreinte altérée' };
    }
    prevHash = log.hash;
  }
  return { valid: true, count: logs.length, brokenAt: null, reason: null };
}

module.exports = { record, verifyChain, computeHash, canonical };
