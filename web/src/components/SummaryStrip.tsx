import { useMemo } from 'react';
import type { NamespaceGroup } from '../types/api';

interface TileProps {
  label: string;
  value: string | number;
  accent: string;
  subtext?: string | null;
}

function SummaryTile({ label, value, accent, subtext }: TileProps) {
  return (
    <div className="ksl-tile" style={{ borderTopColor: accent }}>
      <div className="ksl-tile__value">{value}</div>
      <div className="ksl-tile__label">{label}</div>
      {subtext && <div className="ksl-tile__subtext">{subtext}</div>}
    </div>
  );
}

interface Props {
  groups: NamespaceGroup[];
}

export default function SummaryStrip({ groups }: Props) {
  const t = useMemo(() => {
    return groups.reduce(
      (a, g) => {
        a.pods += g.totalPods;
        a.idle += g.statusCounts.Idle ?? 0;
        a.failed += g.statusCounts.Failed ?? 0;
        a.busy += g.statusCounts.Busy ?? 0;
        a.changing += g.statusCounts.Changing ?? 0;
        return a;
      },
      { pods: 0, idle: 0, failed: 0, busy: 0, changing: 0 },
    );
  }, [groups]);

  const pct = t.pods > 0 ? Math.round((t.idle / t.pods) * 100) : 0;

  return (
    <div className="ksl-summary">
      <SummaryTile label="Total pods" value={t.pods} accent="var(--cds-border-interactive)" />
      <SummaryTile label="Healthy" value={`${pct}%`} accent="var(--cds-support-success)" subtext={`${t.idle} idle`} />
      <SummaryTile
        label="Failed"
        value={t.failed}
        accent={t.failed > 0 ? 'var(--cds-support-error)' : 'var(--cds-border-subtle-01)'}
      />
      <SummaryTile
        label="In progress"
        value={t.busy + t.changing}
        accent="var(--cds-support-info)"
        subtext={t.busy || t.changing ? `${t.busy} busy, ${t.changing} changing` : null}
      />
    </div>
  );
}
