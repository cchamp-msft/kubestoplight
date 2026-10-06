import type { PodStatusKind, NamespaceStatusKind } from '../types/api';

// Status → color token. The tokens are defined in styles/index.scss on top of
// Jewel's chart palette; the meanings (Idle=healthy … Failed=error) are fixed.
export const STATUS_COLORS: Record<string, string> = {
  Idle: 'var(--status-idle)',
  Busy: 'var(--status-busy)',
  Changing: 'var(--status-changing)',
  Failed: 'var(--status-failed)',
  Empty: 'var(--status-empty)',
  Unknown: 'var(--status-empty)',
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
