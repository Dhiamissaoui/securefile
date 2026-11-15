import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Link2,
  Loader2,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import PageHeader from '../components/PageHeader';
import StatusChip from '../components/StatusChip';
import CopyButton from '../components/CopyButton';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { actionLabel, formatDate, relativeTime, shortHash } from '../lib/format';

const GROUPS = [
  { id: '', label: 'Tout' },
  { id: 'auth', label: 'Authentification' },
  { id: 'files', label: 'Fichiers' },
  { id: 'certificates', label: 'Certificats' },
  { id: 'security', label: 'Sécurité' },
];

const OUTCOMES = [
  { id: '', label: 'Tous' },
  { id: 'success', label: 'Succès' },
  { id: 'failure', label: 'Échecs' },
  { id: 'warning', label: 'Alertes' },
];

const TONE = { success: 'mint', warning: 'amber', failure: 'rose' };
const OUTCOME_LABEL = { success: 'Succès', warning: 'Avertissement', failure: 'Échec' };

const DETAIL_KEYS = [
  'fileName',
  'recipient',
  'sha256',
  'mode',
  'reason',
  'field',
  'campaign',
  'total',
  'passed',
  'failed',
];

function metaSummary(meta = {}) {
  const parts = [];
  if (meta.fileName) parts.push(meta.fileName);
  if (meta.recipient) parts.push(`→ ${meta.recipient}`);
  if (meta.serial) parts.push(`série ${shortHash(meta.serial, 8, 4)}`);
  if (meta.mode) parts.push(`mode ${meta.mode}`);
  if (Number.isFinite(meta.total)) {
    const passed = Number.isFinite(meta.passed)
      ? meta.passed
      : Number.isFinite(meta.failed)
        ? meta.total - meta.failed
        : 0;
    parts.push(`${passed}/${meta.total} tests`);
  }
  if (meta.reason) parts.push(meta.reason);
  if (meta.email) parts.push(meta.email);
  return parts.join(' · ');
}

export default function Audit() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState('');
  const [outcome, setOutcome] = useState('');
  const [chain, setChain] = useState(null);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (nextPage = 1, nextGroup = group, nextOutcome = outcome) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(nextPage), pageSize: '20' });
        if (nextGroup) params.set('group', nextGroup);
        if (nextOutcome) params.set('outcome', nextOutcome);
        const res = await api(`/audit?${params.toString()}`);
        setData(res);
        setPage(res.page);
      } catch (err) {
        toast.error('Journal indisponible', err.message);
      } finally {
        setLoading(false);
      }
    },
    [group, outcome, toast]
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeGroup = (id) => {
    setGroup(id);
    setExpanded('');
    load(1, id, outcome);
  };

  const changeOutcome = (id) => {
    setOutcome(id);
    setExpanded('');
    load(1, group, id);
  };

  const verifyChain = async () => {
    setChecking(true);
    try {
      const res = await api('/audit/verify-chain');
      setChain(res);
      if (res.valid) toast.success('Chaîne intègre', `${res.count} entrée(s) vérifiée(s) sans rupture.`);
      else toast.error('Chaîne rompue', `Entrée #${res.brokenAt} : ${res.reason}`);
    } catch (err) {
      toast.error('Vérification impossible', err.message);
    } finally {
      setChecking(false);
    }
  };

  const items = data?.items || [];

  return (
    <div className="page">
      <PageHeader
        title="Journal d’audit"
        subtitle="Chaque action est horodatée et chaînée à la précédente par une empreinte SHA-256."
        actions={
          <button type="button" className="btn btn--soft" onClick={verifyChain} disabled={checking}>
            {checking ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            {checking ? 'Vérification…' : 'Vérifier la chaîne'}
          </button>
        }
      />

      <section className={`card audit-chain ${chain ? (chain.valid ? 'is-ok' : 'is-bad') : ''}`}>
        <span className="audit-chain__icon">
          {chain ? chain.valid ? <ShieldCheck size={22} /> : <ShieldAlert size={22} /> : <Link2 size={22} />}
        </span>
        <div className="audit-chain__text">
          <h3>
            {chain
              ? chain.valid
                ? 'Chaîne vérifiée, aucune altération'
                : `Rupture détectée à l’entrée #${chain.brokenAt}`
              : 'Le journal est scellé par chaînage de hachages'}
          </h3>
          <p>
            {chain
              ? chain.valid
                ? `${chain.count} entrée(s) contrôlées : séquences continues, chaînage cohérent et empreintes recalculées identiques.`
                : `${chain.reason}. Toute modification d’une entrée romprait la chaîne à cet endroit.`
              : 'Chaque entrée contient l’empreinte de la précédente. Lancez la vérification pour prouver l’absence de falsification.'}
          </p>
        </div>
        {chain ? (
          <StatusChip tone={chain.valid ? 'mint' : 'rose'} dot>
            {chain.valid ? 'Intègre' : 'Compromise'}
          </StatusChip>
        ) : (
          <StatusChip tone="neutral" dot>
            Non vérifiée
          </StatusChip>
        )}
      </section>

      <div className="toolbar">
        <div className="toolbar__tabs">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`tab ${group === g.id ? 'is-active' : ''}`}
              onClick={() => changeGroup(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="segmented segmented--sm" role="group" aria-label="Filtrer par résultat">
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              type="button"
              className={outcome === o.id ? 'is-active' : ''}
              onClick={() => changeOutcome(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <section className="card card--table audit-card">
        {!data ? (
          <div className="file-skeletons">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={70} radius={14} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Aucune entrée"
            message="Aucune action ne correspond à ces filtres. Modifiez la sélection ou déposez un fichier."
          />
        ) : (
          <ul className={`audit-list ${loading ? 'is-loading' : ''}`}>
            {items.map((entry) => {
              const tone = TONE[entry.outcome] || 'mint';
              const detail = metaSummary(entry.meta);
              const open = expanded === entry.id;
              const hasMeta = entry.meta && Object.keys(entry.meta).length > 0;
              return (
                <li key={entry.id} className="audit-entry">
                  <span className="audit-entry__seq">#{entry.seq}</span>
                  <span className={`audit-entry__dot audit-entry__dot--${tone}`} />
                  <div className="audit-entry__main">
                    <div className="audit-entry__title">
                      <strong>{actionLabel(entry.action)}</strong>
                      <span className="audit-entry__time" title={formatDate(entry.createdAt)}>
                        {relativeTime(entry.createdAt)}
                      </span>
                    </div>
                    <p className="audit-entry__detail">{detail || entry.resourceType || 'Système'}</p>
                    <div className="audit-entry__meta">
                      <StatusChip tone={tone}>{OUTCOME_LABEL[entry.outcome] || entry.outcome}</StatusChip>
                      <span className="mono audit-entry__ip">{entry.ip || 'local'}</span>
                      {hasMeta ? (
                        <button
                          type="button"
                          className="link-btn audit-entry__toggle"
                          onClick={() => setExpanded(open ? '' : entry.id)}
                          aria-expanded={open}
                        >
                          Détails
                          <ChevronDown size={13} className={open ? 'is-open' : ''} />
                        </button>
                      ) : null}
                    </div>

                    {open ? (
                      <div className="audit-entry__details">
                        <div className="audit-detail">
                          <span>Empreinte de l’entrée</span>
                          <div className="hash-box">
                            <code title={entry.hash}>{shortHash(entry.hash, 22, 12)}</code>
                            <CopyButton value={entry.hash} label="Copier" />
                          </div>
                        </div>
                        <div className="audit-detail">
                          <span>Chaînée à</span>
                          <div className="hash-box">
                            <code title={entry.prevHash}>{shortHash(entry.prevHash, 22, 12)}</code>
                            <CopyButton value={entry.prevHash} label="Copier" />
                          </div>
                        </div>
                        {hasMeta ? (
                          <div className="audit-detail">
                            <span>Métadonnées nettoyées</span>
                            <pre className="audit-meta">
                              {JSON.stringify(
                                Object.fromEntries(
                                  Object.entries(entry.meta).filter(([key]) => DETAIL_KEYS.includes(key) || key.length < 24)
                                ),
                                null,
                                2
                              )}
                            </pre>
                          </div>
                        ) : null}
                        <span className="audit-detail__stamp">
                          Enregistré le {formatDate(entry.createdAt)} · {entry.resourceType || 'système'}
                          {entry.resourceId ? ` · ${shortHash(entry.resourceId, 8, 4)}` : ''}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {data && data.total > 0 ? (
          <footer className="pager">
            <span className="pager__info">
              {data.total} entrée(s) · page {data.page} / {data.pages}
            </span>
            <div className="pager__buttons">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => load(page - 1)}
                disabled={page <= 1 || loading}
              >
                <ArrowLeft size={14} /> Précédent
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => load(page + 1)}
                disabled={page >= data.pages || loading}
              >
                Suivant <ArrowRight size={14} />
              </button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
