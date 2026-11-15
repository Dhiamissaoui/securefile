const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,24}$/;
const PASSWORD_RULES = [
  { id: 'length', label: '12 caractères minimum', test: (v) => v.length >= 12 && v.length <= 128 },
  { id: 'lower', label: 'une minuscule', test: (v) => /[a-z]/.test(v) },
  { id: 'upper', label: 'une majuscule', test: (v) => /[A-Z]/.test(v) },
  { id: 'digit', label: 'un chiffre', test: (v) => /\d/.test(v) },
  { id: 'special', label: 'un caractère spécial', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

function isPlainString(value) {
  return typeof value === 'string';
}

function validateEmail(value) {
  if (!isPlainString(value)) return 'Adresse email invalide.';
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'Adresse email invalide.';
  return null;
}

function validateUsername(value) {
  if (!isPlainString(value) || !USERNAME_RE.test(value.trim())) {
    return 'Nom d’utilisateur invalide (3 à 24 caractères, lettres, chiffres, . _ -).';
  }
  return null;
}

function validatePassword(value) {
  if (!isPlainString(value)) return 'Mot de passe invalide.';
  const failed = PASSWORD_RULES.filter((r) => !r.test(value));
  if (failed.length) {
    return `Le mot de passe doit contenir : ${failed.map((f) => f.label).join(', ')}.`;
  }
  return null;
}

function validateString(value, { min = 1, max = 200 } = {}) {
  if (!isPlainString(value)) return { error: 'Valeur invalide.' };
  const trimmed = value.trim();
  if (trimmed.length < min) return { error: 'Valeur trop courte.' };
  if (trimmed.length > max) return { error: 'Valeur trop longue.' };
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return { error: 'Caractères interdits.' };
  return { value: trimmed };
}

function passwordScore(value) {
  if (!isPlainString(value)) return { score: 0, checks: [] };
  const checks = PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(value) }));
  const bonus = value.length >= 16 ? 1 : 0;
  const score = Math.min(5, checks.filter((c) => c.ok).length + bonus);
  return { score, checks };
}

module.exports = {
  isPlainString,
  validateEmail,
  validateUsername,
  validatePassword,
  validateString,
  passwordScore,
  PASSWORD_RULES,
};
