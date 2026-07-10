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

export const JOB_STATUS_COLORS: Record<string, string> = {
  Active: 'var(--cds-support-info)',
  Succeeded: 'var(--cds-support-success)',
  Failed: 'var(--cds-support-error)',
  Suspended: 'var(--cds-support-warning)',
  Unknown: 'var(--cds-text-helper)',
};

export const JOB_STATUS_COLORS_HEX: Record<string, string> = {
  Active: '#4589ff',
  Succeeded: '#42be65',
  Failed: '#fa4d56',
  Suspended: '#f1c21b',
  Unknown: '#6f6f6f',
};

export const STATUS_COLORS_HEX: Record<string, string> = {
  Idle: '#42be65',
  Busy: '#4589ff',
  Changing: '#f1c21b',
  Failed: '#fa4d56',
  Empty: '#525252',
  Unknown: '#6f6f6f',
};

export function worstStatus(statuses: (PodStatusKind | NamespaceStatusKind)[]): NamespaceStatusKind {
  const order: NamespaceStatusKind[] = ['Failed', 'Changing', 'Busy', 'Idle'];
  for (const s of order) {
    if (statuses.includes(s)) return s;
  }
  return 'Idle';
}
