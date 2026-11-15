import { useState } from 'react';
import { Bug, CheckCircle2, Loader2, Play, ShieldAlert, ShieldCheck, Timer, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import PageHeader from '../components/PageHeader';
import StatusChip from '../components/StatusChip';

const COMPARISON = [
  {
    attack: 'Accès au fichier d’un autre utilisateur (IDOR)',
    before: '200 · fichier exposé',
    after: '403 · accès refusé',
  },
  {
    attack: 'Modification d’un octet du fichier chiffré',
    before: 'Fichier altéré accepté',
    after: 'AES-GCM rejette le document',
  },
  {
    attack: 'Modification de l’empreinte SHA-256 en base',
    before: 'Empreinte falsifiée acceptée',
    after: 'Sceau HMAC invalide · rejet',
  },
  {
    attack: 'Signature forgée ou modifiée',
    before: 'Signature non contrôlée',
    after: 'RSA-PSS invalide · rejet',
  },
  {
    attack: 'Certificat expiré',
    before: 'Aucun contrôle de validité',
    after: 'X.509 refusé (période expirée)',
  },
  {
    attack: 'Certificat émis par une AC inconnue',
    before: 'Aucune vérification de chaîne',
    after: 'Chaîne non approuvée · refus',
  },
  {
    attack: 'Force brute sur le mot de passe',
    before: 'Tentatives illimitées',
    after: 'Verrouillage 15 min + limitation',
  },
  {
    attack: 'Injection NoSQL / requête sans jeton CSRF',
    before: 'Contournement possible',
    after: 'Types validés · 403 CSRF',
  },
];

export default function Security() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [campaign, setCampaign] = useState(null);

  const runCampaign = async () => {
    setBusy(true);
    try {
      const res = await api('/security/campaign', { method: 'POST' });
      setCampaign(res);
      if (res.summary.failed === 0) {
        toast.success('Campagne terminée', `${res.summary.passed}/${res.summary.total} contre-mesures validées.`);
      } else {
        toast.error('Campagne terminée avec échecs', `${res.summary.failed} test(s) en échec.`);
      }
    } catch (err) {
      toast.error('Campagne impossible', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Tests de sécurité"
        subtitle="Les attaques du cahier des charges sont rejouées sur la version sécurisée, avec un résultat attendu et un statut HTTP observé."
        actions={
          <button type="button" className="btn btn--primary" onClick={runCampaign} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
            {busy ? 'Campagne en cours…' : 'Lancer la campagne'}
          </button>
        }
      />

      <div className="sec-points">
        <div>
          <strong>
            <ShieldCheck size={13} /> Contrôle d’accès
          </strong>
          <span>IDOR et CSRF bloqués côté serveur (403).</span>
        </div>
        <div>
          <strong>
            <ShieldAlert size={13} /> Intégrité
          </strong>
          <span>Un seul octet modifié fait échouer AES-GCM.</span>
        </div>
        <div>
          <strong>
            <ShieldCheck size={13} /> PKI locale
          </strong>
          <span>Certificats expirés ou d’une AC inconnue refusés.</span>
        </div>
      </div>

      <section className="card">
        <div className="panel__head" style={{ padding: '18px 18px 0', marginBottom: 12 }}>
          <div>
            <h3>Avant / après</h3>
            <p>Version vulnérable (v1) et version sécurisée (v2)</p>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="compare-table">
            <thead>
              <tr>
                <th>Attaque</th>
                <th>Version vulnérable (v1)</th>
                <th>Version sécurisée (v2)</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.attack}>
                  <td>{row.attack}</td>
                  <td className="compare-table__before">{row.before}</td>
                  <td className="compare-table__now">{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card panel">
        <header className="panel__head">
          <div>
            <h3>
              <Bug size={15} /> Campagne automatisée
            </h3>
            <p>Comptes et fichiers éphémères, supprimés après chaque exécution</p>
          </div>
          <button type="button" className="btn btn--soft btn--sm" onClick={runCampaign} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
            {busy ? 'En cours…' : campaign ? 'Rejouer' : 'Exécuter'}
          </button>
        </header>

        {busy ? (
          <div className="campaign-intro">
            <p className="hint" style={{ marginTop: 0 }}>
              Création de deux comptes éphémères, exécution des attaques, puis nettoyage automatique…
            </p>
          </div>
        ) : !campaign ? (
          <div className="campaign-intro">
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Comptes éphémères</strong>
                  <p>Deux utilisateurs isolés et leurs certificats sont créés pour chaque exécution.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Attaques rejouées</strong>
                  <p>Injection NoSQL, XSS, IDOR, CSRF, téléversement, intégrité, signature, PKI, force brute.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Preuves et nettoyage</strong>
                  <p>Chaque résultat consigne le statut HTTP observé, puis les données de test sont supprimées.</p>
                </div>
              </li>
            </ol>
            <div className="upload-note">
              <Timer size={14} />
              <p>La campagne est journalisée dans le journal d’audit et n’altère aucun document réel.</p>
            </div>
          </div>
        ) : (
          <>
            <div className={`campaign-summary ${campaign.summary.failed === 0 ? 'is-ok' : 'is-warn'}`}>
              <span className="campaign-summary__icon">
                {campaign.summary.failed === 0 ? <ShieldCheck size={21} /> : <ShieldAlert size={21} />}
              </span>
              <div>
                <strong>
                  {campaign.summary.passed}/{campaign.summary.total} tests réussis
                </strong>
                <p>
                  Campagne {campaign.campaignId} · {campaign.durationMs} ms ·{' '}
                  {campaign.summary.failed === 0
                    ? 'toutes les contre-mesures ont résisté.'
                    : `${campaign.summary.failed} contre-mesure(s) à revoir.`}
                </p>
              </div>
              <StatusChip tone={campaign.summary.failed === 0 ? 'mint' : 'amber'} dot>
                {campaign.summary.failed === 0 ? 'Tout est bloqué' : 'À vérifier'}
              </StatusChip>
            </div>

            <div className="campaign-table">
              <div className="ct-row ct-row--head">
                <span>Test</span>
                <span>OWASP</span>
                <span>Attendu</span>
                <span>Observé</span>
                <span>Résultat</span>
              </div>
              {campaign.results.map((item) => (
                <div key={item.id} className={`ct-row ${item.passed ? 'is-pass' : 'is-fail'}`}>
                  <div className="ct-test">
                    <strong>{item.name}</strong>
                    <span>{item.category}</span>
                  </div>
                  <span>
                    <span className="owasp-badge">{item.owasp}</span>
                  </span>
                  <span className="ct-expected">{item.expected}</span>
                  <div className="ct-observed">
                    <span>{item.observed}</span>
                    {item.evidence ? <code>{item.evidence}</code> : null}
                  </div>
                  <span className="ct-status">
                    {item.passed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                    <em>{item.passed ? 'PASS' : 'FAIL'}</em>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
