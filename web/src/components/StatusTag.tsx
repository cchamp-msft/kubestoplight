import type { ReactNode } from 'react';
import { STATUS_COLORS } from '../constants/status';

interface Props {
  /** A pod status key (Idle, Failed, …) or an explicit color token via `tone`. */
  status?: string;
  tone?: string;
  children?: ReactNode;
}

/**
 * Jewel `.tag` with a status dot. Jewel keeps text out of series colors, so
 * the label stays in the tag's text color and only the dot carries the tone.
 */
export default function StatusTag({ status, tone, children }: Props) {
  const color = tone ?? (status ? STATUS_COLORS[status] : undefined) ?? STATUS_COLORS.Unknown;
  return (
    <span className="tag ksl-status-tag" style={{ '--tone': color } as React.CSSProperties}>
      <span className="ksl-dot" aria-hidden="true" />
      {children ?? status}
    </span>
  );
}
