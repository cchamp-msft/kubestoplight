import { useState, useEffect, useId } from 'react';
import type { Cluster, AuthType, KubeCfg } from '../types/api';
import Sheet from './ui/Sheet';
import './ClusterFormModal.scss';

interface Props {
  open: boolean;
  initialValues?: Cluster;
  onClose: () => void;
  onSubmit: (c: Cluster) => Promise<void>;
}

const EMPTY: Cluster = {
  name: '',
  auth: 'kubeconfig',
  enabled: true,
};

function Field({ id, label, optional, hint, children }: {
  id: string; label: string; optional?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {optional && <span className="field__optional"> (optional)</span>}
      </label>
      {children}
      {hint && <p className="field__hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

export default function ClusterFormModal({ open, initialValues, onClose, onSubmit }: Props) {
  const isEdit = !!initialValues;
  const id = useId();

  const [form, setForm] = useState<Cluster>(initialValues ?? EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  // Reset form when the modal opens.
  useEffect(() => {
    if (open) {
      setForm(initialValues ?? EMPTY);
      setError(null);
    }
  }, [open, initialValues]);

  function set<K extends keyof Cluster>(key: K, value: Cluster[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setKubeCfg(key: keyof KubeCfg, value: string) {
    setForm((prev) => ({
      ...prev,
      kubeconfig: { ...(prev.kubeconfig ?? { path: '' }), [key]: value },
    }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return 'Cluster name is required.';
    if (form.auth === 'bearer' && !form.server?.trim()) return 'Server URL is required for bearer auth.';
    if (form.auth === 'bearer' && !form.bearer_token?.trim()) return 'Bearer token is required.';
    if (form.auth === 'kubeconfig' && !form.kubeconfig?.path?.trim()) return 'Kubeconfig path is required.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ''));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? `Edit cluster · ${initialValues!.name}` : 'Add cluster'}>
      <form className="form ksl-cluster-form" noValidate onSubmit={handleSubmit}>
        {error && <p className="form__error" role="alert">{error}</p>}

        {!isEdit && (
          <Field id={`${id}-name`} label="Cluster name">
            <input
              className="input"
              id={`${id}-name`}
              placeholder="e.g. rke2-prod"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              autoFocus
            />
          </Field>
        )}

        <Field id={`${id}-auth`} label="Authentication method">
          <div className="select">
            <select
              className="input"
              id={`${id}-auth`}
              value={form.auth}
              onChange={(e) => set('auth', e.target.value as AuthType)}
            >
              <option value="kubeconfig">Kubeconfig file</option>
              <option value="bearer">Bearer token</option>
            </select>
          </div>
        </Field>

        {form.auth === 'kubeconfig' && (
          <div className="form__row form__row--2">
            <Field id={`${id}-path`} label="Kubeconfig path">
              <input
                className="input ksl-mono"
                id={`${id}-path`}
                placeholder="~/.kube/rke2.yaml"
                value={form.kubeconfig?.path ?? ''}
                onChange={(e) => setKubeCfg('path', e.target.value)}
              />
            </Field>
            <Field id={`${id}-context`} label="Context" optional>
              <input
                className="input"
                id={`${id}-context`}
                placeholder="default"
                value={form.kubeconfig?.context ?? ''}
                onChange={(e) => setKubeCfg('context', e.target.value)}
              />
            </Field>
          </div>
        )}

        {form.auth === 'bearer' && (
          <>
            <Field id={`${id}-server`} label="Server URL">
              <input
                className="input ksl-mono"
                id={`${id}-server`}
                type="url"
                placeholder="https://192.168.1.100:6443"
                value={form.server ?? ''}
                onChange={(e) => set('server', e.target.value)}
              />
            </Field>
            <Field id={`${id}-token`} label="Bearer token">
              {/* Jewel has no password field; a text button toggles visibility. */}
              <div className="ksl-password">
                <input
                  className="input ksl-mono"
                  id={`${id}-token`}
                  type={showToken ? 'text' : 'password'}
                  autoComplete="off"
                  placeholder="eyJhbGci…"
                  value={form.bearer_token ?? ''}
                  onChange={(e) => set('bearer_token', e.target.value)}
                />
                <button
                  className="btn btn--text ksl-password__toggle"
                  type="button"
                  aria-controls={`${id}-token`}
                  aria-pressed={showToken}
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
            </Field>
            <label className="choice">
              <input
                type="checkbox"
                role="switch"
                checked={form.tls?.insecure_skip_verify ?? false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm((prev) => ({ ...prev, tls: { ...(prev.tls ?? {}), insecure_skip_verify: checked } }));
                }}
              />
              Skip TLS verification
            </label>
          </>
        )}

        <Field id={`${id}-ns`} label="Namespace filter" optional hint="Leave blank to watch every namespace.">
          <input
            className="input"
            id={`${id}-ns`}
            aria-describedby={`${id}-ns-hint`}
            value={form.namespace ?? ''}
            onChange={(e) => set('namespace', e.target.value)}
          />
        </Field>

        <label className="choice">
          <input type="checkbox" role="switch" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          Enabled
        </label>

        <div className="form__actions">
          <button className="btn btn--ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="submit" disabled={submitting} aria-busy={submitting}>
            {isEdit ? 'Save changes' : 'Add cluster'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
