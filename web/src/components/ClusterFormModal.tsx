import { useState, useEffect } from 'react';
import {
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  TextInput,
  PasswordInput,
  Select,
  SelectItem,
  Toggle,
  InlineNotification,
} from '@carbon/react';
import type { Cluster, AuthType, KubeCfg } from '../types/api';
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

export default function ClusterFormModal({ open, initialValues, onClose, onSubmit }: Props) {
  const isEdit = !!initialValues;

  const [form, setForm] = useState<Cluster>(initialValues ?? EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ComposedModal open={open} onClose={onClose} size="sm">
      <ModalHeader
        title={isEdit ? `Edit cluster: ${initialValues!.name}` : 'Add cluster'}
        label="Cluster configuration"
      />
      <ModalBody hasScrollingContent>
        {error && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={error}
            lowContrast
            className="modal-notification"
          />
        )}

        {/* ---- Name ---- */}
        {!isEdit && (
          <TextInput
            id="cluster-name"
            labelText="Cluster name"
            placeholder="e.g. rke2-prod"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            className="form-field"
          />
        )}

        {/* ---- Auth type ---- */}
        <Select
          id="cluster-auth"
          labelText="Authentication method"
          value={form.auth}
          onChange={(e) => set('auth', e.target.value as AuthType)}
          className="form-field"
        >
          <SelectItem value="kubeconfig" text="Kubeconfig file" />
          <SelectItem value="bearer"     text="Bearer token" />
        </Select>

        {/* ---- Kubeconfig fields ---- */}
        {form.auth === 'kubeconfig' && (
          <>
            <TextInput
              id="kubecfg-path"
              labelText="Kubeconfig path"
              placeholder="~/.kube/rke2.yaml"
              value={form.kubeconfig?.path ?? ''}
              onChange={(e) => setKubeCfg('path', e.target.value)}
              className="form-field"
            />
            <TextInput
              id="kubecfg-context"
              labelText="Context (optional)"
              placeholder="default"
              value={form.kubeconfig?.context ?? ''}
              onChange={(e) => setKubeCfg('context', e.target.value)}
              className="form-field"
            />
          </>
        )}

        {/* ---- Bearer token fields ---- */}
        {form.auth === 'bearer' && (
          <>
            <TextInput
              id="cluster-server"
              labelText="Server URL"
              placeholder="https://192.168.1.100:6443"
              value={form.server ?? ''}
              onChange={(e) => set('server', e.target.value)}
              className="form-field"
            />
            <PasswordInput
              id="cluster-token"
              labelText="Bearer token"
              placeholder="eyJhbGci…"
              value={form.bearer_token ?? ''}
              onChange={(e) => set('bearer_token', e.target.value)}
              className="form-field"
            />
            <Toggle
              id="cluster-insecure"
              labelText="Skip TLS verification"
              labelA="Off"
              labelB="On"
              toggled={form.tls?.insecure_skip_verify ?? false}
              onToggle={(checked: boolean) =>
                setForm((prev) => ({
                  ...prev,
                  tls: { ...(prev.tls ?? {}), insecure_skip_verify: checked },
                }))
              }
              className="form-field"
            />
          </>
        )}

        {/* ---- Common optional fields ---- */}
        <TextInput
          id="cluster-namespace"
          labelText="Namespace filter (optional, leave blank for all)"
          placeholder=""
          value={form.namespace ?? ''}
          onChange={(e) => set('namespace', e.target.value)}
          className="form-field"
        />

        <Toggle
          id="cluster-enabled"
          labelText="Enabled"
          labelA="Disabled"
          labelB="Enabled"
          toggled={form.enabled}
          onToggle={(checked: boolean) => set('enabled', checked)}
          className="form-field"
        />
      </ModalBody>

      <ModalFooter
        primaryButtonText={isEdit ? 'Save changes' : 'Add cluster'}
        secondaryButtonText="Cancel"
        onRequestSubmit={handleSubmit}
        onRequestClose={onClose}
        primaryButtonDisabled={submitting}
      >{null}</ModalFooter>
    </ComposedModal>
  );
}
