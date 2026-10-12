import type { PodStatusKind, NamespaceStatusKind } from '../types/api';

// The status keys come from the Go model and predate their meanings:
// Busy is "in progress" (a recent restart, or pending/terminating/not ready
// for under 5 minutes) and Changing is a warning (the same, for longer).
// Show STATUS_LABELS to people, never the raw key.
export const STATUS_LABELS: Record<string, string> = {
  Idle: 'Idle',
  Busy: 'In progress',
  Changing: 'Warning',
  Failed: 'Failed',
  Empty: 'No data',
  Unknown: 'Unknown',
};

// Status → color token for dots and chart marks. The tokens are defined in
// styles/index.scss on Jewel's traffic light; the meanings (Idle=healthy …
// Failed=error) are fixed.
export const STATUS_COLORS: Record<string, string> = {
  Idle: 'var(--status-idle)',
  Busy: 'var(--status-busy)',
  Changing: 'var(--status-changing)',
  Failed: 'var(--status-failed)',
  Empty: 'var(--status-empty)',
  Unknown: 'var(--status-empty)',
};

/** Status → Jewel `.status` tone (traffic light). Undefined = neutral. */
export type StatusTone = 'success' | 'info' | 'warning' | 'error';
export const STATUS_TONES: Record<string, StatusTone | undefined> = {
  Idle: 'success',
  Busy: 'info',
  Changing: 'warning',
  Failed: 'error',
};

export const JOB_STATUS_COLORS: Record<string, string> = {
  Active: 'var(--status-busy)',
  Succeeded: 'var(--status-idle)',
  Failed: 'var(--status-failed)',
  Suspended: 'var(--status-changing)',
  Unknown: 'var(--status-empty)',
};

export const SEVERITY_ORDER: Record<string, number> = {
  Failed: 0,
  Changing: 1,
  Busy: 2,
  Idle: 3,
  Empty: 4,
  Unknown: 5,
};

/** Display order for status breakdowns (worst first). */
export const POD_STATUS_ORDER = ['Failed', 'Changing', 'Busy', 'Idle', 'Empty', 'Unknown'];
export const JOB_STATUS_ORDER = ['Failed', 'Suspended', 'Active', 'Succeeded', 'Unknown'];

export function worstStatus(statuses: (PodStatusKind | NamespaceStatusKind)[]): NamespaceStatusKind {
  const order: NamespaceStatusKind[] = ['Failed', 'Changing', 'Busy', 'Idle'];
  for (const s of order) {
    if (statuses.includes(s)) return s;
  }
  return 'Idle';
}

/** The Beacon's lit lens: red for failures, amber for warnings, green otherwise (work in progress is normal). */
export type Lens = 'stop' | 'caution' | 'go' | null;

export function lensFor(worst: NamespaceStatusKind | null): Lens {
  if (!worst) return null;
  if (worst === 'Failed') return 'stop';
  if (worst === 'Changing') return 'caution';
  return 'go';
}
