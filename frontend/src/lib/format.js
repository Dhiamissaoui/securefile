const ACTION_LABELS = {
  user_registered: 'Compte créé',
  login_success: 'Connexion réussie',
  login_failed: 'Échec de connexion',
  login_locked: 'Compte verrouillé',
  logout: 'Déconnexion',
  session_revoked: 'Sessions révoquées',
  file_uploaded: 'Fichier déposé',
  file_downloaded: 'Fichier téléchargé',
  file_signed: 'Fichier signé',
  file_deleted: 'Fichier supprimé',
  file_shared: 'Fichier partagé',
  share_revoked: 'Partage révoqué',
  file_verified: 'Vérification réussie',
  integrity_failed: 'Atteinte à l’intégrité',
  local_file_verified: 'Vérification locale',
  cert_issued: 'Certificat émis',
  cert_reissued: 'Certificat réémis',
  cert_revoked: 'Certificat révoqué',
  security_campaign: 'Campagne de tests',
};

export function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export function formatDate(value, { withTime = true } = {}) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return formatDate(value, { withTime: false });
}

export function shortHash(value, head = 10, tail = 6) {
  if (!value) return '—';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function initials(name = '') {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return 'Bonne nuit';
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export const FILE_META = {
  pdf: { label: 'PDF', tone: 'rose' },
  png: { label: 'PNG', tone: 'violet' },
  jpg: { label: 'JPG', tone: 'violet' },
  jpeg: { label: 'JPG', tone: 'violet' },
  txt: { label: 'TXT', tone: 'slate' },
  md: { label: 'MD', tone: 'slate' },
  csv: { label: 'CSV', tone: 'mint' },
  docx: { label: 'DOCX', tone: 'cyan' },
  xlsx: { label: 'XLSX', tone: 'mint' },
};

export function fileMeta(extension) {
  return FILE_META[extension] || { label: (extension || '?').toUpperCase(), tone: 'slate' };
}

export function passwordChecks(password = '') {
  return [
    { id: 'length', label: '12 caractères minimum', ok: password.length >= 12 && password.length <= 128 },
    { id: 'lower', label: 'une minuscule', ok: /[a-z]/.test(password) },
    { id: 'upper', label: 'une majuscule', ok: /[A-Z]/.test(password) },
    { id: 'digit', label: 'un chiffre', ok: /\d/.test(password) },
    { id: 'special', label: 'un caractère spécial', ok: /[^A-Za-z0-9]/.test(password) },
  ];
}
