import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileSearch,
  Fingerprint,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import PageHeader from '../components/PageHeader';
import FileTypeIcon from '../components/FileTypeIcon';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';
import CopyButton from '../components/CopyButton';
import { Skeleton } from '../components/Skeleton';
import { formatBytes, formatDate, shortHash } from '../lib/format';

const CONTROLS = [
  { title: 'Chiffrement AES-256-GCM', text: 'Le fichier stocké est déchiffré avec la clé emballée pour vous.' },
  { title: 'Empreinte SHA-256', text: 'Le hachage du fichier déchiffré est comparé à la référence.' },
  { title: 'Sceau HMAC-SHA-256', text: 'Les métadonnées (nom, taille, propriétaire) sont scellées.' },
  { title: 'Signature RSA-PSS 3072', text: 'La signature de l’empreinte prouve l’origine du document.' },
  { title: 'Certificat X.509', text: 'Le certificat du signataire est valide, connu et non révoqué.' },
];

function CheckRow({ icon: Icon, title, check, children }) {
  if (!check) return null;
  const ok = !!check.ok;
  return (
    <li className={ok ? 'is-ok' : 'is-fail'}>
      <span className={`check-list__icon ${ok ? 'is-ok' : 'is-fail'}`}>
        <Icon size={16} />
      </span>
      <div className="check-list__text">
        <strong>{title}</strong>
        <p>{check.message}</p>
        {children}
      </div>
      <StatusChip tone={ok ? 'mint' : 'rose'} icon={ok ? CheckCircle2 : XCircle}>
        {ok ? 'Vérifié' : check.present === false ? 'Absent' : 'Échec'}
      </StatusChip>
    </li>
  );
}

export default function Verify() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [files, setFiles] = useState(null);
  const [selected, setSelected] = useState(params.get('file') || '');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [localFile, setLocalFile] = useState(null);
  const [localResult, setLocalResult] = useState(null);
  const [localBusy, setLocalBusy] = useState(false);
  const localInput = useRef(null);

  useEffect(() => {
    api('/files')
      .then((res) => {
        setFiles(res.files);
        setSelected((current) => {
          if (current && res.files.some((f) => f.id === current)) return current;
          return res.files[0]?.id || '';
        });
      })
      .catch((err) => toast.error('Chargement impossible', err.message));
  }, [toast]);

  const selectedFile = useMemo(() => files?.find((f) => f.id === selected) || null, [files, selected]);

  useEffect(() => {
    setReport(null);
    setLocalResult(null);
    setLocalFile(null);
    setError('');
  }, [selected]);

  const run = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    setReport(null);
    try {
      const res = await api(`/files/${selected}/verify`);
      setReport(res);
      if (res.verdict) toast.success('Vérification réussie', 'Intégrité et authenticité confirmées.');
      else toast.error('Échec de vérification', 'Consultez le détail des contrôles ci-dessous.');
    } catch (err) {
      setError(err.message);
      toast.error('Vérification impossible', err.message);
    } finally {
      setBusy(false);
    }
  };

  const runLocal = async () => {
    if (!localFile || !selected) return;
    setLocalBusy(true);
    try {
      const form = new FormData();
      form.append('file', localFile);
      const res = await api(`/files/${selected}/verify-local`, { method: 'POST', form });
      setLocalResult(res);
      if (res.match) toast.success('Copie identique', 'L’empreinte SHA-256 correspond à la référence.');
      else toast.error('Copie différente', 'Les empreintes SHA-256 ne correspondent pas.');
    } catch (err) {
      toast.error('Comparaison impossible', err.message);
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Vérification d’intégrité"
        subtitle="Sélectionnez un document du coffre : le serveur rejoue les cinq contrôles de sécurité."
      />

      {files && files.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title="Aucun document à vérifier"
          message="Déposez d’abord un fichier dans votre coffre."
          action={
            <a className="btn btn--soft" href="/app/files?upload=1">
              <UploadCloud size={15} /> Déposer un fichier
            </a>
          }
        />
      ) : (
        <>
          <div className="verify-grid">
            <section className="card panel">
              <header className="panel__head">
                <div>
                  <h3>Document à contrôler</h3>
                  <p>Sélectionnez un fichier du coffre</p>
                </div>
              </header>

              {!files ? (
                <div className="pick-list">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} height={54} radius={9} />
                  ))}
                </div>
              ) : (
                <ul className="pick-list">
                  {files.map((file) => (
                    <li key={file.id}>
                      <button
                        type="button"
                        className={`pick ${selected === file.id ? 'is-active' : ''}`}
                        onClick={() => setSelected(file.id)}
                      >
                        <FileTypeIcon extension={file.extension} size={34} />
                        <span>
                          <strong>{file.name}</strong>
                          <small>
                            {file.isOwner ? 'Vous' : file.owner?.username} · {formatBytes(file.size)}
                            {file.signed ? ' · signé' : ''}
                          </small>
                        </span>
                        <span className="pick__radio" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button type="button" className="btn btn--primary btn--block" onClick={run} disabled={busy || !selected}>
                {busy ? 'Contrôles en cours…' : 'Lancer la vérification'}
                {!busy ? <ArrowRight size={16} /> : null}
              </button>
              {error ? <div className="form-error" style={{ marginTop: 10 }}>{error}</div> : null}
            </section>

            <section className="card panel">
              <header className="panel__head">
                <div>
                  <h3>Cinq contrôles rejoués</h3>
                  <p>Confidentialité, intégrité, authenticité</p>
                </div>
              </header>
              <ol className="info-list">
                {CONTROLS.map((control, index) => (
                  <li key={control.title}>
                    <strong>
                      {index + 1}. {control.title}
                    </strong>
                    <span>{control.text}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {report ? (
            <>
              <section className={`verdict ${report.verdict ? 'verdict--ok' : 'verdict--fail'}`}>
                <span className="verdict__icon">
                  {report.verdict ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
                </span>
                <div>
                  <span className="eyebrow">{report.verdict ? 'Document authentique' : 'Anomalie détectée'}</span>
                  <h2>{report.verdictLabel}</h2>
                  <p>
                    {report.fileName} · contrôlé le {formatDate(report.checkedAt)}
                    {report.signer ? ` · signé par ${report.signer.username}` : ''}
                  </p>
                </div>
                <StatusChip tone={report.verdict ? 'mint' : 'rose'} dot>
                  {report.verdict ? 'Intégrité vérifiée' : 'Échec de vérification'}
                </StatusChip>
              </section>

              <section className="card">
                <ul className="check-list">
                  <CheckRow icon={Lock} title="Chiffrement AES-256-GCM" check={report.checks.aesGcm} />
                  <CheckRow icon={Fingerprint} title="Empreinte SHA-256" check={report.checks.sha256}>
                    <div className="check-list__extra">
                      <span>Référence</span>
                      <code>{shortHash(report.checks.sha256.stored, 20, 12)}</code>
                      <span>Calculée</span>
                      <code>{shortHash(report.checks.sha256.computed, 20, 12)}</code>
                    </div>
                  </CheckRow>
                  <CheckRow icon={KeyRound} title="Sceau HMAC-SHA-256" check={report.checks.hmac}>
                    <div className="check-list__extra">
                      <span>Référence</span>
                      <code>{shortHash(report.checks.hmac.stored, 20, 12)}</code>
                      <span>Recalculé</span>
                      <code>{shortHash(report.checks.hmac.computed, 20, 12)}</code>
                    </div>
                  </CheckRow>
                  <CheckRow icon={BadgeCheck} title="Signature RSA-PSS 3072" check={report.checks.signature}>
                    {report.checks.signature.ok ? (
                      <p className="hint">
                        Certificat {shortHash(report.signatureMeta?.certSerial, 10, 6)} ·{' '}
                        {formatDate(report.signatureMeta?.signedAt)}
                      </p>
                    ) : null}
                  </CheckRow>
                  <CheckRow icon={ShieldCheck} title="Certificat X.509" check={report.checks.certificate}>
                    {report.checks.certificate.details ? (
                      <p className="hint">
                        {report.checks.certificate.details.subject} · émis par{' '}
                        {report.checks.certificate.details.issuerCN} · valide jusqu’au{' '}
                        {formatDate(report.checks.certificate.details.notAfter, { withTime: false })}
                      </p>
                    ) : null}
                    {report.checks.certificate.reasons?.length ? (
                      <ul className="reasons">
                        {report.checks.certificate.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </CheckRow>
                </ul>
              </section>
            </>
          ) : null}

          <section className="card local-check">
            <div className="local-check__intro">
              <h3>Comparer une copie locale</h3>
              <p>
                Déposez une copie de « {selectedFile?.name || 'ce document'} » : son empreinte SHA-256 sera
                comparée à celle conservée par la plateforme.
              </p>
              <div
                className={`mini-drop ${localFile ? 'has-file' : ''}`}
                onClick={() => localInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setLocalFile(e.dataTransfer.files?.[0] || null);
                  setLocalResult(null);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' ? localInput.current?.click() : null)}
              >
                <input
                  ref={localInput}
                  type="file"
                  hidden
                  onChange={(e) => {
                    setLocalFile(e.target.files?.[0] || null);
                    setLocalResult(null);
                  }}
                />
                <UploadCloud size={17} />
                <span>{localFile ? `${localFile.name} · ${formatBytes(localFile.size)}` : 'Déposer la copie locale'}</span>
              </div>
              <button type="button" className="btn btn--soft" onClick={runLocal} disabled={!localFile || localBusy || !selected}>
                {localBusy ? 'Comparaison…' : 'Comparer les empreintes'}
              </button>
            </div>

            <div className="local-check__result">
              {localResult ? (
                <>
                  <StatusChip tone={localResult.match ? 'mint' : 'rose'} icon={localResult.match ? CheckCircle2 : XCircle}>
                    {localResult.match ? 'Copie identique' : 'Copie modifiée'}
                  </StatusChip>
                  <dl className="kv kv--stacked">
                    <div>
                      <dt>Référence plateforme</dt>
                      <dd className="mono">{localResult.reference}</dd>
                    </div>
                    <div>
                      <dt>Empreinte du fichier local</dt>
                      <dd className="mono">{localResult.computed}</dd>
                    </div>
                    <div>
                      <dt>Tailles</dt>
                      <dd>
                        {formatBytes(localResult.localSize)} (local) · {formatBytes(localResult.referenceSize)}{' '}
                        (référence)
                      </dd>
                    </div>
                  </dl>
                  <CopyButton value={localResult.computed} label="Copier l’empreinte" />
                </>
              ) : (
                <div className="local-check__placeholder">
                  <Fingerprint size={24} />
                  <p>Le résultat de la comparaison s’affichera ici.</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
