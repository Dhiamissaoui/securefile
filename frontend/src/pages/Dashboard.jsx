import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  FileSignature,
  Files as FilesIcon,
  KeyRound,
  Plus,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { actionLabel, formatDate, formatBytes, greeting, relativeTime, shortHash } from '../lib/format';
import FileTypeIcon from '../components/FileTypeIcon';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';

const OUTCOME_TONE = { success: 'mint', warning: 'amber', failure: 'rose' };

function certLabel(cert) {
  if (!cert) return { value: 'Absent', hint: 'Aucun certificat actif' };
  if (cert.revoked) return { value: 'Révoqué', hint: 'Présent dans la CRL' };
  if (cert.mode === 'expired') return { value: 'Expiré', hint: 'Hors période de validité' };
  if (cert.mode === 'rogue') return { value: 'Inconnu', hint: 'AC non approuvée' };
  return { value: 'Valide', hint: 'Émis par l’AC locale' };
}

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/dashboard')
      .then(setData)
      .catch((err) => {
        setError(err.message);
        toast.error('Chargement impossible', err.message);
      });
  }, [toast]);

  const today = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  if (error) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Tableau de bord indisponible"
        message={error}
        action={
          <button type="button" className="btn btn--soft" onClick={() => window.location.reload()}>
            Réessayer
          </button>
        }
      />
    );
  }

  if (!data) {
    return (
      <div className="page">
        <Skeleton height={38} width="30%" />
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={108} radius={12} />
          ))}
        </div>
        <div className="dash-cols">
          <Skeleton height={300} radius={12} />
          <Skeleton height={300} radius={12} />
        </div>
      </div>
    );
  }

  const { overview, recentFiles, recentAudit, certificate } = data;
  const counts = overview.counts;
  const cert = certLabel(certificate);

  const stats = [
    { label: 'Fichiers déposés', value: counts.files, icon: FilesIcon, hint: 'chiffrés sur le disque' },
    { label: 'Partagés avec moi', value: counts.sharedWithMe, icon: Users, hint: 'accès en lecture' },
    { label: 'Documents signés', value: counts.signedFiles, icon: FileSignature, hint: 'RSA-PSS 3072' },
    { label: 'Certificat X.509', value: cert.value, icon: BadgeCheck, hint: cert.hint },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head__text">
          <span className="eyebrow">
            <CalendarClock size={13} /> {today}
          </span>
          <h1>Tableau de bord</h1>
          <p>
            {greeting()}, {user?.username}. {counts.files + counts.sharedWithMe === 0
              ? 'Votre coffre est vide : déposez un premier document pour le chiffrer.'
              : `${counts.files + counts.sharedWithMe} document(s) protégés par chiffrement AES-256-GCM.`}
          </p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/app/verify')}>
            <ShieldCheck size={16} /> Vérifier un document
          </button>
          <button type="button" className="btn btn--primary" onClick={() => navigate('/app/files?upload=1')}>
            <Plus size={16} /> Déposer un fichier
          </button>
        </div>
      </header>

      <div className="stat-grid">
        {stats.map(({ label, value, icon: Icon, hint }) => (
          <article key={label} className="stat card">
            <div className="stat__top">
              <span className="stat__icon">
                <Icon size={17} strokeWidth={1.9} />
              </span>
            </div>
            <strong className="stat__value">{value}</strong>
            <span className="stat__label">{label}</span>
            <span className="stat__hint">{hint}</span>
          </article>
        ))}
      </div>

      <div className="dash-cols">
        <section className="card panel">
          <header className="panel__head">
            <div>
              <h3>Documents récents</h3>
              <p>Les derniers fichiers de votre coffre</p>
            </div>
            <button type="button" className="link-btn" onClick={() => navigate('/app/files')}>
              Tout voir <ArrowUpRight size={14} />
            </button>
          </header>

          {recentFiles.length === 0 ? (
            <EmptyState
              icon={FilesIcon}
              title="Aucun document"
              message="Déposez un PDF, un DOCX ou une image : il sera chiffré avant écriture sur le disque."
              action={
                <button type="button" className="btn btn--soft btn--sm" onClick={() => navigate('/app/files?upload=1')}>
                  <Plus size={15} /> Déposer un fichier
                </button>
              }
            />
          ) : (
            <ul className="mini-files">
              {recentFiles.map((file) => (
                <li key={file.id} className="mini-files__item">
                  <FileTypeIcon extension={file.extension} size={36} />
                  <div className="mini-files__text">
                    <strong title={file.name}>{file.name}</strong>
                    <span>
                      {file.isOwner ? 'Vous' : file.owner?.username || 'Partagé'} · {formatBytes(file.size)} ·{' '}
                      {relativeTime(file.createdAt)}
                    </span>
                  </div>
                  <div className="mini-files__chips">
                    {file.signed ? (
                      <StatusChip tone="mint" icon={FileSignature}>
                        Signé
                      </StatusChip>
                    ) : null}
                    {!file.isOwner ? (
                      <StatusChip tone="violet" icon={Users}>
                        Partagé
                      </StatusChip>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => navigate(`/app/verify?file=${file.id}`)}
                    title="Vérifier"
                    aria-label={`Vérifier ${file.name}`}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card panel">
          <header className="panel__head">
            <div>
              <h3>Activité récente</h3>
              <p>Dernières entrées du journal d’audit</p>
            </div>
            <button type="button" className="link-btn" onClick={() => navigate('/app/audit')}>
              Journal <ArrowUpRight size={14} />
            </button>
          </header>

          {recentAudit.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Aucune activité" message="Vos actions de sécurité apparaîtront ici." />
          ) : (
            <ol className="timeline">
              {recentAudit.map((entry) => (
                <li key={entry.id} className="timeline__item">
                  <span className={`timeline__dot timeline__dot--${OUTCOME_TONE[entry.outcome] || 'mint'}`} />
                  <div>
                    <strong>{actionLabel(entry.action)}</strong>
                    <span>
                      {entry.meta?.fileName || entry.meta?.recipient || entry.meta?.mode || ''}{' '}
                      {entry.meta?.fileName ? '·' : ''} {relativeTime(entry.createdAt)}
                    </span>
                  </div>
                  <code className="hash" title={entry.hash}>
                    {shortHash(entry.hash, 6, 4)}
                  </code>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="sec-points">
        <div>
          <strong>
            <KeyRound size={13} /> {counts.activeSessions} session(s) active(s)
          </strong>
          <span>Cookie HttpOnly, SameSite=Strict, révocable côté serveur.</span>
        </div>
        <div>
          <strong>
            <ShieldCheck size={13} /> Intégrité vérifiable
          </strong>
          <span>SHA-256, HMAC serveur et signature RSA-PSS.</span>
        </div>
        <div>
          <strong>
            <BadgeCheck size={13} /> Dernière connexion
          </strong>
          <span>{recentAudit[0] ? formatDate(recentAudit[0].createdAt) : 'Aucune activité enregistrée.'}</span>
        </div>
      </section>
    </div>
  );
}
