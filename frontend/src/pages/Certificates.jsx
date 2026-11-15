import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  History,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import PageHeader from '../components/PageHeader';
import StatusChip from '../components/StatusChip';
import CopyButton from '../components/CopyButton';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { formatDate, shortHash } from '../lib/format';

const MODE_LABEL = {
  valid: 'Valide',
  expired: 'Expiré',
  rogue: 'AC inconnue',
};

const CHECK_LABELS = {
  parse: 'PEM analysable',
  issuedByLocalCA: 'Signé par l’AC locale',
  withinValidity: 'Période de validité',
  keyUsage: 'Usage signature numérique',
  notRevoked: 'Non révoqué (CRL)',
  identityMatch: 'Identité du titulaire',
};

function certStatus(cert) {
  if (!cert) return { tone: 'rose', label: 'Aucun certificat' };
  if (cert.revoked) return { tone: 'rose', label: 'Révoqué' };
  if (cert.mode === 'expired') return { tone: 'amber', label: 'Expiré' };
  if (cert.mode === 'rogue') return { tone: 'rose', label: 'AC inconnue' };
  return { tone: 'mint', label: 'Valide' };
}

function CertReport({ report }) {
  if (!report) return null;
  return (
    <section className={`cert-report ${report.valid ? 'cert-report--ok' : 'cert-report--fail'}`}>
      <div className="cert-report__head">
        {report.valid ? <ShieldCheck size={17} /> : <ShieldX size={17} />}
        <strong>{report.valid ? 'Certificat approuvé' : 'Certificat refusé'}</strong>
      </div>
      <ul className="cert-report__checks">
        {Object.entries(report.checks || {}).map(([key, ok]) => (
          <li key={key} className={ok ? 'is-ok' : 'is-fail'}>
            <span>{ok ? '✓' : '✕'}</span> {CHECK_LABELS[key] || key}
          </li>
        ))}
      </ul>
      {report.reasons?.length ? (
        <ul className="reasons">
          {report.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function subjectField(subject = '', short) {
  const match = new RegExp(`${short}=([^,]+)`).exec(subject);
  return match ? match[1].trim() : '—';
}

export default function Certificates() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState('');
  const [revokeOpen, setRevokeOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api('/certificates');
      setData(res);
      if (res.active?.pem) {
        const checked = await api('/certificates/check', {
          method: 'POST',
          body: { pem: res.active.pem },
        }).catch(() => null);
        setReport(checked?.report || null);
      } else {
        setReport(null);
      }
    } catch (err) {
      toast.error('Chargement impossible', err.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const active = data?.active;
  const status = certStatus(active);
  const cn = useMemo(() => subjectField(active?.subject, 'CN'), [active]);
  const email = useMemo(() => subjectField(active?.subject, 'E'), [active]);

  const reissue = async (mode) => {
    setBusy(mode);
    try {
      const res = await api('/certificates/reissue', { method: 'POST', body: { mode } });
      setReport(res.report);
      toast.success(
        'Certificat réémis',
        mode === 'valid' ? 'Nouveau certificat valide actif.' : `Mode de démonstration : ${MODE_LABEL[mode]}.`
      );
      await load();
    } catch (err) {
      toast.error('Réémission impossible', err.message);
    } finally {
      setBusy('');
    }
  };

  const revoke = async () => {
    setBusy('revoke');
    try {
      await api('/certificates/revoke', { method: 'POST' });
      toast.success('Certificat révoqué', 'Il est désormais refusé par la vérification (CRL).');
      setRevokeOpen(false);
      await load();
    } catch (err) {
      toast.error('Révocation impossible', err.message);
    } finally {
      setBusy('');
    }
  };

  const download = async (path, name) => {
    try {
      await downloadFile(path, name);
      toast.success('Téléchargement', `${name} enregistré.`);
    } catch (err) {
      toast.error('Téléchargement impossible', err.message);
    }
  };

  if (!data) {
    return (
      <div className="page">
        <PageHeader title="Certificats" subtitle="Identité numérique et PKI locale" />
        <div className="cert-grid">
          <Skeleton height={320} radius={12} />
          <div className="stack">
            <Skeleton height={150} radius={12} />
            <Skeleton height={190} radius={12} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Certificats"
        subtitle="Votre identité numérique est attestée par une autorité de certification locale (RSA 3072)."
        actions={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => download('/certificates/mine.pem', 'securefile-certificat.pem')}
            >
              <Download size={15} /> Mon certificat
            </button>
            <button
              type="button"
              className="btn btn--soft"
              onClick={() => download('/certificates/chain.pem', 'securefile-chaine.pem')}
            >
              <Download size={15} /> Chaîne complète
            </button>
          </>
        }
      />

      {!active ? (
        <EmptyState
          icon={ShieldAlert}
          title="Aucun certificat actif"
          message="Réémettez un certificat valide pour signer et vérifier des documents."
        />
      ) : (
        <div className="cert-grid">
          <section className="cert-main card">
            <header className="cert-main__head">
              <div>
                <span className="eyebrow">Certificat X.509 actif</span>
                <h2>{cn}</h2>
                <p>{active.subject}</p>
              </div>
              <StatusChip tone={status.tone} dot>
                {status.label}
              </StatusChip>
            </header>

            <dl className="cert-main__meta">
              <div>
                <dt>Email</dt>
                <dd>{email}</dd>
              </div>
              <div>
                <dt>Émis par</dt>
                <dd>{active.issuerCN}</dd>
              </div>
              <div>
                <dt>Numéro de série</dt>
                <dd className="mono">{shortHash(active.serial, 12, 8)}</dd>
              </div>
              <div>
                <dt>Empreinte SHA-256</dt>
                <dd className="mono">{shortHash(active.fingerprint, 14, 8)}</dd>
              </div>
              <div>
                <dt>Valide du</dt>
                <dd>{formatDate(active.notBefore, { withTime: false })}</dd>
              </div>
              <div>
                <dt>Valide jusqu’au</dt>
                <dd>{formatDate(active.notAfter, { withTime: false })}</dd>
              </div>
            </dl>

            <div className="cert-main__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => download('/certificates/mine.pem', 'securefile-certificat.pem')}
              >
                <Download size={14} /> Certificat PEM
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => download('/certificates/chain.pem', 'securefile-chaine.pem')}
              >
                <Download size={14} /> Chaîne PEM
              </button>
            </div>

            <details className="pem-details">
              <summary>Voir le PEM du certificat actif</summary>
              <div className="hash-box" style={{ justifyContent: 'flex-end', margin: '8px 0' }}>
                <CopyButton value={active.pem} label="Copier le PEM" />
              </div>
              <pre className="pem">{active.pem}</pre>
            </details>
          </section>

          <div className="stack">
            <section className="card panel">
              <header className="panel__head">
                <div>
                  <h3>
                    <ShieldCheck size={15} /> Autorité de certification
                  </h3>
                  <p>Racine de confiance locale</p>
                </div>
              </header>
              <dl className="kv">
                <div>
                  <dt>Sujet</dt>
                  <dd>{data.ca.subject}</dd>
                </div>
                <div>
                  <dt>Empreinte</dt>
                  <dd className="mono">{shortHash(data.ca.fingerprint, 12, 8)}</dd>
                </div>
                <div>
                  <dt>Validité</dt>
                  <dd>
                    {formatDate(data.ca.notBefore, { withTime: false })} →{' '}
                    {formatDate(data.ca.notAfter, { withTime: false })}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="btn btn--soft btn--sm btn--block"
                style={{ marginTop: 12 }}
                onClick={() => download('/certificates/ca.pem', 'securefile-ca.crt.pem')}
              >
                <Download size={14} /> Certificat racine
              </button>
            </section>

            <CertReport report={report} />

            <section className="card panel">
              <header className="panel__head">
                <div>
                  <h3>Tester la confiance</h3>
                  <p>Scénarios de démonstration</p>
                </div>
              </header>
              <div className="demo-actions">
                <button type="button" className="btn btn--soft btn--sm" onClick={() => reissue('valid')} disabled={!!busy}>
                  <RefreshCw size={14} /> Réémettre valide
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => reissue('expired')} disabled={!!busy}>
                  Certificat expiré
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => reissue('rogue')} disabled={!!busy}>
                  AC inconnue
                </button>
                <button
                  type="button"
                  className="btn btn--danger-ghost btn--sm"
                  onClick={() => setRevokeOpen(true)}
                  disabled={!!busy}
                >
                  Révoquer (CRL)
                </button>
              </div>
              <div className="upload-note">
                <TriangleAlert size={14} />
                <p>
                  Ces actions modifient réellement le certificat actif pour prouver les cas d’échec.
                  Terminez par « Réémettre valide » pour restaurer un état sain.
                </p>
              </div>
            </section>
          </div>
        </div>
      )}

      <section className="card panel">
        <header className="panel__head">
          <div>
            <h3>
              <History size={15} /> Historique des certificats
            </h3>
            <p>{data.certificates.length} certificat(s) émis pour votre compte</p>
          </div>
          <StatusChip tone="neutral">CRL : {data.crl.length} révoqué(s)</StatusChip>
        </header>

        {data.certificates.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="Aucun certificat" message="Réémettez un certificat valide." />
        ) : (
          <ul className="cert-history">
            {data.certificates.map((cert) => {
              const state = certStatus(cert);
              return (
                <li key={cert.id}>
                  <span className={`cert-history__dot cert-history__dot--${state.tone}`} />
                  <div>
                    <strong>{MODE_LABEL[cert.mode] || cert.mode}</strong>
                    <span className="mono">{shortHash(cert.serial, 10, 6)}</span>
                  </div>
                  <span className="cert-history__dates">
                    {formatDate(cert.notBefore, { withTime: false })} →{' '}
                    {formatDate(cert.notAfter, { withTime: false })}
                  </span>
                  <StatusChip tone={state.tone}>{cert.isActive ? 'Actif' : 'Archivé'}</StatusChip>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={revoke}
        busy={busy === 'revoke'}
        title="Révoquer votre certificat ?"
        message="Votre certificat sera ajouté à la liste de révocation (CRL). Les vérifications de signature échoueront jusqu’à la réémission d’un certificat valide."
        confirmLabel="Révoquer"
      />
    </div>
  );
}
