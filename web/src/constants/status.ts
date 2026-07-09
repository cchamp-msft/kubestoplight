import type { PodStatusKind, NamespaceStatusKind } from '../types/api';

export const STATUS_COLORS: Record<string, string> = {
  Idle: 'var(--cds-support-success)',
  Busy: 'var(--cds-support-info)',
  Changing: 'var(--cds-support-warning)',
  Failed: 'var(--cds-support-error)',
  Empty: 'var(--cds-text-disabled)',
  Unknown: 'var(--cds-text-helper)',
};

export const STATUS_TAG_TYPE: Record<string, string> = {
  Idle: 'green',
  Busy: 'blue',
  Changing: 'teal',
  Failed: 'red',
  Empty: 'gray',
  Unknown: 'gray',
};

export const SEVERITY_ORDER: Record<string, number> = {
  Failed: 0,
  Changing: 1,
  Busy: 2,
  Idle: 3,
  Empty: 4,
  Unknown: 5,
};

export function worstStatus(statuses: (PodStatusKind | NamespaceStatusKind)[]): NamespaceStatusKind {
  const order: NamespaceStatusKind[] = ['Failed', 'Changing', 'Busy', 'Idle'];
  for (const s of order) {
    if (statuses.includes(s)) return s;
  }
  return 'Idle';
}
