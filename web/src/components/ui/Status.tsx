import type { ReactNode } from 'react';
import { STATUS_LABELS, STATUS_TONES, type StatusTone } from '../../constants/status';

interface Props {
  /** A pod status key (Idle, Failed, …), or an explicit `tone`. */
  status?: string;
  tone?: StatusTone;
  /** Pulse the dot: the state is still changing. */
  busy?: boolean;
  children?: ReactNode;
}

/** Jewel's `.status`: a dot and a word, so color is never the only signal. */
export default function Status({ status, tone, busy, children }: Props) {
  const t = tone ?? (status ? STATUS_TONES[status] : undefined);
  const pulse = busy ?? status === 'Busy';
  return (
    <span className={`status${t ? ` status--${t}` : ''}${pulse ? ' status--busy' : ''}`}>
      {children ?? (status && (STATUS_LABELS[status] ?? status))}
    </span>
  );
}
