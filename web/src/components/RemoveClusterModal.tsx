import { useState } from 'react';
import Sheet from './ui/Sheet';

interface Props {
  open: boolean;
  clusterName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function RemoveClusterModal({ open, clusterName, onClose, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Remove cluster">
      <div className="form">
        {error && <p className="form__error" role="alert">{error}</p>}
        <p>
          Remove <strong>{clusterName}</strong> from kubestoplight? This deletes the entry from your
          config file. The cluster itself is not affected.
        </p>
        <div className="form__actions">
          <button className="btn btn--ghost" type="button" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--danger"
            type="button"
            disabled={submitting}
            aria-busy={submitting}
            onClick={handleConfirm}
          >
            Remove
          </button>
        </div>
      </div>
    </Sheet>
  );
}
