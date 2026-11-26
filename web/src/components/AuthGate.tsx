import { useId, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import BgPicker from './BgPicker';
import Beacon from './ui/Beacon';
import Icon from './ui/Icon';
import './AuthGate.scss';

const noop = () => {};

/**
 * Holds the dashboard back until the server's access key has been entered
 * (kubestoplight --web --auth-key). The app, and so every data hook, only
 * mounts once there is a session; a server without a key passes straight through.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, login } = useAuth();
  const id = useId();
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state === 'open' || state === 'authed') return children;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key) { setError('Enter the access key.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await login(key);
      setKey('');
    } catch (err) {
      const msg = String(err).replace(/^Error:\s*/, '');
      setError(msg.charAt(0).toUpperCase() + msg.slice(1) + '.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="jewel-bg" aria-hidden="true" />
      <BgPicker open={false} onClose={noop} />
      {state === 'locked' && (
        <main className="ksl-lock">
          <form className="panel panel--pad form ksl-lock__card" noValidate onSubmit={handleSubmit}>
            <span className="ksl-brand">
              <Beacon lit={null} label="Locked" />
              <span className="wordmark">kubestoplight</span>
            </span>
            <h1 className="ksl-lock__title">Enter the access key</h1>
            <p className="ksl-lock__lede">
              This dashboard is locked. This browser stays signed in until the session expires.
            </p>
            {error && <p className="form__error" role="alert">{error}</p>}
            <div className="field">
              <label className="field__label" htmlFor={id}>Access key</label>
              <div className="password">
                <input
                  className="input ksl-mono"
                  id={id}
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  autoFocus
                />
                <button
                  className="password__toggle"
                  type="button"
                  aria-controls={id}
                  aria-pressed={show}
                  aria-label={show ? 'Hide key' : 'Show key'}
                  onClick={() => setShow((v) => !v)}
                >
                  <Icon name="show" className="password__show" />
                  <Icon name="hide" className="password__hide" />
                </button>
              </div>
            </div>
            <div className="form__actions">
              <button className="btn" type="submit" disabled={submitting} aria-busy={submitting}>
                <Icon name="unlock" /> Unlock
              </button>
            </div>
          </form>
        </main>
      )}
    </>
  );
}
