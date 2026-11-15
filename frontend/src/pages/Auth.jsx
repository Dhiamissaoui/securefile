import { useMemo, useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, KeyRound, Lock, Mail, User } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { passwordChecks } from '../lib/format';

const DEMO = [
  { label: 'Alice', email: 'alice@securefile.local', password: 'Alice@SecureFile2026' },
  { label: 'Bob', email: 'bob@securefile.local', password: 'Bob@SecureFile2026!' },
];

export default function Auth() {
  const { login, register } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const checks = useMemo(() => passwordChecks(form.password), [form.password]);

  const update = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }));
    setError('');
  };

  const fillDemo = (demo) => {
    setMode('login');
    setForm({ username: '', email: demo.email, password: demo.password });
    setError('');
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const data = await login(form.email, form.password);
        toast.success('Connexion réussie', `Bienvenue ${data.user.username}.`);
      } else {
        await register(form.username, form.email, form.password);
        toast.success('Compte créé', 'Votre paire de clés et votre certificat X.509 ont été émis.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-card__head">
          <Logo />
          <h2>{mode === 'login' ? 'Connexion' : 'Créer un compte'}</h2>
          <p>
            {mode === 'login'
              ? 'Accédez à votre coffre-fort documentaire.'
              : 'Une paire de clés RSA et un certificat X.509 sont générés à l’inscription.'}
          </p>
        </div>

        <div className="segmented" role="tablist" aria-label="Mode d’authentification">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => switchMode('login')}
          >
            Connexion
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'is-active' : ''}
            onClick={() => switchMode('register')}
          >
            Inscription
          </button>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>
          {mode === 'register' ? (
            <label className="field">
              <span>Nom d’utilisateur</span>
              <div className="input-wrap">
                <User size={16} className="input-wrap__icon" />
                <input
                  type="text"
                  autoComplete="username"
                  placeholder="alice"
                  value={form.username}
                  onChange={update('username')}
                  minLength={3}
                  maxLength={24}
                  required
                />
              </div>
            </label>
          ) : null}

          <label className="field">
            <span>Adresse email</span>
            <div className="input-wrap">
              <Mail size={16} className="input-wrap__icon" />
              <input
                type="email"
                autoComplete="email"
                placeholder="vous@exemple.tn"
                value={form.email}
                onChange={update('email')}
                required
              />
            </div>
          </label>

          <label className="field">
            <span>Mot de passe</span>
            <div className="input-wrap">
              <Lock size={16} className="input-wrap__icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="••••••••••••"
                value={form.password}
                onChange={update('password')}
                required
              />
              <button
                type="button"
                className="input-wrap__action"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {mode === 'register' ? (
            <ul className="strength__list">
              {checks.map((check) => (
                <li key={check.id} className={check.ok ? 'is-ok' : ''}>
                  <Check size={11} /> {check.label}
                </li>
              ))}
            </ul>
          ) : null}

          {error ? <div className="form-error">{error}</div> : null}

          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Vérification…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
            {!busy ? <ArrowRight size={16} /> : null}
          </button>
        </form>

        <div className="demo">
          <div className="demo__head">
            <KeyRound size={13} />
            <span>Comptes de démonstration</span>
          </div>
          <div className="demo__row">
            {DEMO.map((demo) => (
              <button key={demo.label} type="button" className="demo__chip" onClick={() => fillDemo(demo)}>
                <strong>{demo.label}</strong>
                <span>{demo.email}</span>
              </button>
            ))}
          </div>
          <p>Comptes créés par le seed ; mots de passe fournis dans le README.</p>
        </div>

        <p className="auth-card__legal">
          La clé privée est déverrouillée en mémoire uniquement pendant votre session. Elle n’est jamais
          stockée en clair.
        </p>
      </div>
    </div>
  );
}
