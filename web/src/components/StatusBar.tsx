import type { NamespaceStatusKind } from '../types/api';
import { STATUS_COLORS } from '../constants/status';

interface Props {
  statusCounts: Record<NamespaceStatusKind, number>;
  total: number;
}

export default function StatusBar({ statusCounts, total }: Props) {
  if (!total) {
    return <div style={{ height: 4, backgroundColor: 'var(--cds-layer-02)' }} />;
  }

  const segments = [
    { key: 'Failed', count: statusCounts.Failed ?? 0, color: STATUS_COLORS.Failed },
    { key: 'Changing', count: statusCounts.Changing ?? 0, color: STATUS_COLORS.Changing },
    { key: 'Busy', count: statusCounts.Busy ?? 0, color: STATUS_COLORS.Busy },
    { key: 'Idle', count: statusCounts.Idle ?? 0, color: STATUS_COLORS.Idle },
  ].filter((s) => s.count > 0);

  return (
    <div style={{ display: 'flex', height: 4, backgroundColor: 'var(--cds-layer-02)', overflow: 'hidden' }}>
      {segments.map((s) => (
        <div
          key={s.key}
          style={{
            width: `${(s.count / total) * 100}%`,
            backgroundColor: s.color,
            transition: 'width 400ms cubic-bezier(0.2, 0, 0.38, 0.9)',
          }}
        />
      ))}
    </div>
  );
}
