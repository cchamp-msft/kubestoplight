import { useMemo } from 'react';
import type { NamespaceGroup } from '../types/api';

interface StatProps {
  label: string;
  value: React.ReactNode;
  tone?: string;
  note?: string | null;
}

// Jewel stat: uppercase label, big uncolored value. Status shows only as a dot.
function Stat({ label, value, tone, note }: StatProps) {
  return (
    <div className="stat">
      <dt className="stat__label ksl-stat__label">
        {tone && <span className="ksl-dot" style={{ '--tone': tone } as React.CSSProperties} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="stat__value">{value}</dd>
      <dd className="stat__note">{note ?? ' '}</dd>
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
        a.jobs += g.totalJobs ?? 0;
        a.jobsFailed += g.jobStatusCounts?.Failed ?? 0;
        return a;
      },
      { pods: 0, idle: 0, failed: 0, busy: 0, changing: 0, jobs: 0, jobsFailed: 0 },
    );
  }, [groups]);

  const pct = t.pods > 0 ? Math.round((t.idle / t.pods) * 100) : 0;

  return (
    <dl className="stats ksl-stats">
      <Stat label="Total pods" value={t.pods} note={`${groups.length} namespaces`} />
      <Stat
        label="Healthy"
        tone={t.pods > 0 ? 'var(--status-idle)' : undefined}
        value={<>{pct}<span className="stat__unit">%</span></>}
        note={`${t.idle} idle`}
      />
      <Stat
        label="Failed"
        tone={t.failed > 0 ? 'var(--status-failed)' : undefined}
        value={t.failed}
        note={t.failed > 0 ? 'Needs attention' : 'None'}
      />
      <Stat
        label="In progress"
        tone={t.busy + t.changing > 0 ? 'var(--status-changing)' : undefined}
        value={t.busy + t.changing}
        note={t.busy || t.changing ? `${t.busy} busy, ${t.changing} changing` : null}
      />
      <Stat
        label="Jobs"
        value={t.jobs}
        note={t.jobsFailed > 0 ? `${t.jobsFailed} failed` : null}
      />
    </dl>
  );
}
