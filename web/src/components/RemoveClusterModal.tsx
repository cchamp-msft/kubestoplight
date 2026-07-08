import {
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  InlineNotification,
} from '@carbon/react';
import { useState } from 'react';

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
    <ComposedModal open={open} onClose={onClose} size="xs" danger>
      <ModalHeader
        title="Remove cluster"
        label={clusterName}
      />
      <ModalBody>
        {error && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={error}
            lowContrast
            style={{ marginBottom: '1rem' }}
          />
        )}
        <p>
          Remove <strong>{clusterName}</strong> from kubestoplight? This will delete the
          entry from your config file. The cluster itself is not affected.
        </p>
      </ModalBody>
      <ModalFooter
        danger
        primaryButtonText="Remove"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleConfirm}
        onRequestClose={onClose}
        primaryButtonDisabled={submitting}
      >{null}</ModalFooter>
    </ComposedModal>
  );
}
