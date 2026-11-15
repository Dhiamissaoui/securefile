import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownToLine,
  CheckCircle2,
  FileSignature,
  Files as FilesIcon,
  KeyRound,
  Lock,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
  Share2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import PageHeader from '../components/PageHeader';
import FileTypeIcon from '../components/FileTypeIcon';
import StatusChip from '../components/StatusChip';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import CopyButton from '../components/CopyButton';
import EmptyState from '../components/EmptyState';
import Avatar from '../components/Avatar';
import { Skeleton } from '../components/Skeleton';
import { formatBytes, formatDate, relativeTime, shortHash } from '../lib/format';

const FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'mine', label: 'Mes fichiers' },
  { id: 'shared', label: 'Partagés avec moi' },
];

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.txt,.md,.csv,.docx,.xlsx';

export default function Files() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(params.get('upload') === '1');
  const [detail, setDetail] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api('/files');
      setData(res);
    } catch (err) {
      toast.error('Chargement impossible', err.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (params.get('upload') === '1') {
      setUploadOpen(true);
      params.delete('upload');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const files = data?.files || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((file) => {
      if (filter === 'mine' && !file.isOwner) return false;
      if (filter === 'shared' && file.isOwner) return false;
      if (q && !file.name.toLowerCase().includes(q) && !file.owner?.username?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [files, filter, query]);

  const counts = data?.counts;

  const handleDownload = async (file) => {
    try {
      const { integrity } = await downloadFile(`/files/${file.id}/download`, file.name);
      toast.success('Téléchargement vérifié', `${file.name} · intégrité ${integrity || 'vérifiée'} (SHA-256).`);
    } catch (err) {
      toast.error('Téléchargement bloqué', err.message);
    }
  };

  const handleSign = async (file) => {
    setMenuFor(null);
    try {
      await api(`/files/${file.id}/sign`, { method: 'POST' });
      toast.success('Document signé', 'Signature RSA-PSS 3072 de l’empreinte SHA-256 enregistrée.');
      await load();
      if (detail?.id === file.id) setDetail((d) => (d ? { ...d, signed: { by: null, signedAt: new Date() } } : d));
    } catch (err) {
      toast.error('Signature refusée', err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/files/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('Fichier supprimé', `${deleteTarget.name} et sa clé ont été retirés du coffre.`);
      setDeleteTarget(null);
      setDetail(null);
      await load();
    } catch (err) {
      toast.error('Suppression impossible', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Mes fichiers"
        subtitle="Chaque dépôt est chiffré avec AES-256-GCM avant d’être écrit sur le disque."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setUploadOpen(true)}>
            <Plus size={16} /> Déposer un fichier
          </button>
        }
      />

      <div className="toolbar">
        <div className="toolbar__tabs">
          {FILTERS.map((f) => {
            const count = f.id === 'mine' ? counts?.owned : f.id === 'shared' ? counts?.sharedWithMe : counts?.total;
            return (
              <button
                key={f.id}
                type="button"
                className={`tab ${filter === f.id ? 'is-active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                {typeof count === 'number' ? <span>{count}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Rechercher un document…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher un fichier"
          />
        </div>
      </div>

      <section className="card card--table">
        <div className="table-head">
          <span>Document</span>
          <span>Statut</span>
          <span>Déposé</span>
          <span aria-hidden="true" />
        </div>

        {!data ? (
          <div className="file-skeletons">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={64} radius={14} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FilesIcon}
            title={query || filter !== 'all' ? 'Aucun résultat' : 'Votre coffre est vide'}
            message={
              query || filter !== 'all'
                ? 'Ajustez vos filtres ou votre recherche.'
                : 'Déposez un PDF, DOCX, image ou fichier texte : il sera chiffré et son empreinte conservée.'
            }
            action={
              <button type="button" className="btn btn--soft btn--sm" onClick={() => setUploadOpen(true)}>
                <UploadCloud size={15} /> Déposer un fichier
              </button>
            }
          />
        ) : (
          <ul className="file-list">
            {filtered.map((file) => (
              <li key={file.id} className="file-row">
                <button type="button" className="file-row__main" onClick={() => setDetail(file)}>
                  <FileTypeIcon extension={file.extension} size={42} />
                  <span className="file-row__name">
                    <strong title={file.name}>{file.name}</strong>
                    <span>
                      {file.isOwner ? 'Vous' : file.owner?.username} · {formatBytes(file.size)}
                      {file.comment ? ` · ${file.comment}` : ''}
                    </span>
                  </span>
                </button>

                <div className="file-row__chips">
                  {file.isOwner ? (
                    <StatusChip tone="neutral">Propriétaire</StatusChip>
                  ) : (
                    <StatusChip tone="violet" icon={Share2}>
                      Partagé
                    </StatusChip>
                  )}
                  {file.isOwner && file.sharedWith?.length ? (
                    <StatusChip tone="violet" icon={Share2}>
                      Partagé · {file.sharedWith.length}
                    </StatusChip>
                  ) : null}
                  {file.signed ? (
                    <StatusChip tone="mint" icon={FileSignature}>
                      Signé
                    </StatusChip>
                  ) : null}
                  {file.lastVerification?.ok ? (
                    <StatusChip tone="cyan" icon={CheckCircle2}>
                      Vérifié
                    </StatusChip>
                  ) : null}
                </div>

                <span className="file-row__date" title={formatDate(file.createdAt)}>
                  {relativeTime(file.createdAt)}
                </span>

                <div className="file-row__actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => handleDownload(file)}
                    title="Télécharger (vérification d’intégrité)"
                    aria-label={`Télécharger ${file.name}`}
                  >
                    <ArrowDownToLine size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => navigate(`/app/verify?file=${file.id}`)}
                    title="Vérifier l’intégrité et la signature"
                    aria-label={`Vérifier ${file.name}`}
                  >
                    <ShieldCheck size={16} />
                  </button>
                  {file.isOwner ? (
                    <div className="menu-wrap">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setMenuFor(menuFor === file.id ? null : file.id)}
                        aria-label="Plus d’actions"
                        aria-expanded={menuFor === file.id}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {menuFor === file.id ? (
                        <div className="menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => handleSign(file)}>
                            <PenLine size={14} /> {file.signed ? 'Re-signer' : 'Signer'}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShareTarget(file);
                              setMenuFor(null);
                            }}
                          >
                            <Share2 size={14} /> Partager
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="is-danger"
                            onClick={() => {
                              setDeleteTarget(file);
                              setMenuFor(null);
                            }}
                          >
                            <Trash2 size={14} /> Supprimer
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onDone={async () => {
          setUploadOpen(false);
          await load();
        }}
        toast={toast}
      />

      <ShareModal
        file={shareTarget}
        onClose={() => setShareTarget(null)}
        onDone={async () => {
          await load();
          setDetail((d) =>
            d && shareTarget && d.id === shareTarget.id
              ? {
                  ...d,
                  sharedWith: [...(d.sharedWith || []), { user: { username: '…' }, sharedAt: new Date() }],
                }
              : d
          );
        }}
        toast={toast}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        busy={busy}
        title="Supprimer ce document ?"
        message={
          deleteTarget
            ? `« ${deleteTarget.name} » sera supprimé du coffre, avec sa clé chiffrée et tous ses partages. Cette action est irréversible.`
            : ''
        }
        confirmLabel="Supprimer définitivement"
      />

      {detail ? (
        <DetailDrawer
          file={detail}
          onClose={() => setDetail(null)}
          onDownload={handleDownload}
          onVerify={() => navigate(`/app/verify?file=${detail.id}`)}
          onSign={() => handleSign(detail)}
          onShare={() => setShareTarget(detail)}
          onDelete={() => setDeleteTarget(detail)}
          onRevoked={load}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

function UploadModal({ open, onClose, onDone, toast }) {
  const [file, setFile] = useState(null);
  const [comment, setComment] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setComment('');
      setError('');
      setDragging(false);
    }
  }, [open]);

  const pick = (selected) => {
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) {
      setError('Fichier trop volumineux (10 Mo maximum).');
      return;
    }
    setError('');
    setFile(selected);
  };

  const submit = async () => {
    if (!file) {
      setError('Sélectionnez un fichier à chiffrer.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('comment', comment);
      await api('/files', { method: 'POST', form });
      toast.success('Fichier chiffré', 'AES-256-GCM appliqué, empreinte SHA-256 et HMAC enregistrés.');
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Déposer un fichier chiffré"
      subtitle="PDF, DOCX, XLSX, images ou texte · 10 Mo maximum"
      width={520}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || !file}>
            {busy ? 'Chiffrement…' : 'Chiffrer et déposer'}
          </button>
        </>
      }
    >
      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {file ? (
          <>
            <FileTypeIcon extension={file.name.split('.').pop()?.toLowerCase()} size={46} />
            <strong>{file.name}</strong>
            <span>{formatBytes(file.size)} · prêt à être chiffré localement</span>
            <button
              type="button"
              className="dropzone__clear"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              aria-label="Retirer le fichier"
            >
              <X size={15} />
            </button>
          </>
        ) : (
          <>
            <span className="dropzone__icon">
              <UploadCloud size={24} />
            </span>
            <strong>Glissez votre fichier ici</strong>
            <span>ou cliquez pour parcourir · PDF, DOCX, XLSX, PNG, JPG, TXT, MD, CSV</span>
          </>
        )}
      </div>

      <label className="field" style={{ marginTop: 18 }}>
        <span>Commentaire (facultatif)</span>
        <div className="input-wrap">
          <PenLine size={16} className="input-wrap__icon" />
          <input
            type="text"
            maxLength={500}
            placeholder="Ex. Contrat de prestation — version signée"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </label>

      <div className="upload-note">
        <Lock size={14} />
        <p>
          Le nom d’origine est conservé en métadonnées, mais le fichier est stocké sous un nom aléatoire,
          hors racine web, avec une clé AES unique emballée par votre clé publique RSA.
        </p>
      </div>

      {error ? <div className="form-error">{error}</div> : null}
    </Modal>
  );
}

function ShareModal({ file, onClose, onDone, toast }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEmail('');
    setError('');
  }, [file]);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const res = await api(`/files/${file.id}/share`, { method: 'POST', body: { email } });
      toast.success('Partage créé', `Clé du fichier emballée pour ${res.share.user.username}.`);
      await onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!file}
      onClose={onClose}
      title="Partager en lecture seule"
      subtitle={file ? file.name : ''}
      width={460}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || !email}>
            {busy ? 'Partage…' : 'Partager'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Email du destinataire</span>
        <div className="input-wrap">
          <Share2 size={16} className="input-wrap__icon" />
          <input
            type="email"
            placeholder="bob@securefile.local"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
      </label>
      <div className="upload-note">
        <KeyRound size={14} />
        <p>
          La clé AES du fichier est chiffrée avec la clé publique RSA du destinataire. Révoquer le partage
          retire cette copie de clé : le destinataire ne peut plus déchiffrer le document.
        </p>
      </div>
      {error ? <div className="form-error">{error}</div> : null}
    </Modal>
  );
}

function DetailDrawer({ file, onClose, onDownload, onVerify, onSign, onShare, onDelete, onRevoked, toast }) {
  const [busyRevoke, setBusyRevoke] = useState(null);

  const revoke = async (userId) => {
    setBusyRevoke(userId);
    try {
      await api(`/files/${file.id}/share/${userId}`, { method: 'DELETE' });
      toast.success('Partage révoqué', 'La copie de clé du destinataire a été supprimée.');
      await onRevoked();
      onClose();
    } catch (err) {
      toast.error('Révocation impossible', err.message);
    } finally {
      setBusyRevoke(null);
    }
  };

  return (
    <div className="drawer-root">
      <button type="button" className="drawer-root__backdrop" onClick={onClose} aria-label="Fermer" />
      <aside className="drawer" aria-label={`Détails de ${file.name}`}>
        <header className="drawer__head">
          <FileTypeIcon extension={file.extension} size={46} />
          <div>
            <h3>{file.name}</h3>
            <p>
              {formatBytes(file.size)} · déposé le {formatDate(file.createdAt)}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </header>

        <div className="drawer__chips">
          {file.isOwner ? <StatusChip tone="neutral">Propriétaire</StatusChip> : <StatusChip tone="violet" icon={Share2}>Partagé par {file.owner?.username}</StatusChip>}
          {file.signed ? (
            <StatusChip tone="mint" icon={FileSignature}>
              Signé
            </StatusChip>
          ) : (
            <StatusChip tone="neutral">Non signé</StatusChip>
          )}
          {file.lastVerification?.ok ? (
            <StatusChip tone="cyan" icon={CheckCircle2}>
              Vérifié
            </StatusChip>
          ) : null}
        </div>

        <div className="drawer__body">
          {file.comment ? (
            <div className="drawer__comment">
              <span>Commentaire</span>
              <p>{file.comment}</p>
            </div>
          ) : null}

          <section className="drawer__section">
            <h4>
              <Lock size={14} /> Chiffrement au repos
            </h4>
            <dl className="kv">
              <div>
                <dt>Algorithme</dt>
                <dd>AES-256-GCM</dd>
              </div>
              <div>
                <dt>Nonce (96 bits)</dt>
                <dd className="mono">{shortHash(file.encryption.iv, 10, 6)}</dd>
              </div>
              <div>
                <dt>Tag d’authentification</dt>
                <dd className="mono">{shortHash(file.encryption.authTag, 10, 6)}</dd>
              </div>
              <div>
                <dt>Clé de fichier</dt>
                <dd>{file.encryption.keyWraps} copie(s) RSA-OAEP-SHA256</dd>
              </div>
            </dl>
          </section>

          <section className="drawer__section">
            <h4>
              <ShieldCheck size={14} /> Empreinte SHA-256
            </h4>
            <div className="hash-box">
              <code>{file.sha256}</code>
              <CopyButton value={file.sha256} label="Copier" />
            </div>
          </section>

          <section className="drawer__section">
            <h4>
              <FileSignature size={14} /> Signature numérique
            </h4>
            {file.signed ? (
              <>
                <dl className="kv">
                  <div>
                    <dt>Signataire</dt>
                    <dd>{file.signed.by?.username || 'Vous'}</dd>
                  </div>
                  <div>
                    <dt>Signé le</dt>
                    <dd>{formatDate(file.signed.signedAt)}</dd>
                  </div>
                  <div>
                    <dt>N° de série</dt>
                    <dd className="mono">{shortHash(file.signed.certSerial, 8, 6)}</dd>
                  </div>
                </dl>
                <div className="hash-box hash-box--tall">
                  <code>{file.signed.signature}</code>
                  <CopyButton value={file.signed.signature} label="Copier" />
                </div>
                <p className="hint">RSA-PSS 3072 · SHA-256 · vérifiable avec le certificat du signataire.</p>
              </>
            ) : (
              <p className="hint">
                Ce document n’est pas encore signé. La signature porte sur l’empreinte recalculée depuis le
                fichier, jamais sur la valeur stockée en base.
              </p>
            )}
          </section>

          {file.isOwner ? (
            <section className="drawer__section">
              <h4>
                <Share2 size={14} /> Partages ({file.sharedWith?.length || 0})
              </h4>
              {file.sharedWith?.length ? (
                <ul className="share-list">
                  {file.sharedWith.map((share) => (
                    <li key={share.user.id}>
                      <Avatar name={share.user.username} size="xs" tone="violet" />
                      <div>
                        <strong>{share.user.username}</strong>
                        <span>{share.user.email}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--xs"
                        onClick={() => revoke(share.user.id)}
                        disabled={busyRevoke === share.user.id}
                      >
                        {busyRevoke === share.user.id ? '…' : 'Révoquer'}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Aucun partage actif. Seul vous pouvez déchiffrer ce document.</p>
              )}
            </section>
          ) : null}
        </div>

        <footer className="drawer__foot">
          <button type="button" className="btn btn--soft btn--sm" onClick={() => onDownload(file)}>
            <ArrowDownToLine size={15} /> Télécharger
          </button>
          <button type="button" className="btn btn--soft btn--sm" onClick={onVerify}>
            <ShieldCheck size={15} /> Vérifier
          </button>
          {file.isOwner ? (
            <>
              <button type="button" className="btn btn--primary btn--sm" onClick={onSign}>
                <PenLine size={15} /> {file.signed ? 'Re-signer' : 'Signer'}
              </button>
              <button type="button" className="btn btn--soft btn--sm" onClick={onShare}>
                <Share2 size={15} /> Partager
              </button>
              <button type="button" className="btn btn--danger-ghost btn--sm" onClick={onDelete}>
                <Trash2 size={15} /> Supprimer
              </button>
            </>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}
