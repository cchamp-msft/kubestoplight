import { useMemo } from 'react';
import type { NamespaceGroup } from '../types/api';
import { STATUS_COLORS, STATUS_LABELS } from '../constants/status';
import { useCountUp } from '../hooks/useCountUp';

interface StatProps {
  label: string;
  value: React.ReactNode;
  tone?: string;
  note?: string | null;
}

function Count({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
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
  const spectrum = ([
    ['Failed', t.failed],
    ['Changing', t.changing],
    ['Busy', t.busy],
    ['Idle', t.idle],
  ] as const).filter(([, n]) => n > 0);
  const spectrumLabel = spectrum.map(([s, n]) => `${n} ${STATUS_LABELS[s].toLowerCase()}`).join(', ');

  return (
    <>
      <dl className="stats ksl-stats">
        <Stat label="Total pods" value={<Count value={t.pods} />} note={`${groups.length} namespaces`} />
        <Stat
          label="Healthy"
          tone={t.pods > 0 ? 'var(--status-idle)' : undefined}
          value={<><Count value={pct} /><span className="stat__unit">%</span></>}
          note={`${t.idle} idle`}
        />
        <Stat
          label="Failed"
          tone={t.failed > 0 ? 'var(--status-failed)' : undefined}
          value={<Count value={t.failed} />}
          note={t.failed > 0 ? 'Needs attention' : 'None'}
        />
        <Stat
          label="Warnings"
          tone={t.changing > 0 ? 'var(--status-changing)' : undefined}
          value={<Count value={t.changing} />}
          note={t.changing > 0 ? 'Stuck or not ready' : 'None'}
        />
        <Stat
          label="In progress"
          tone={t.busy > 0 ? 'var(--status-busy)' : undefined}
          value={<Count value={t.busy} />}
          note={t.busy > 0 ? 'Starting or restarting' : null}
        />
        <Stat
          label="Jobs"
          value={<Count value={t.jobs} />}
          note={t.jobsFailed > 0 ? `${t.jobsFailed} failed` : null}
        />
      </dl>

      {spectrum.length > 0 && (
        <>
          <div className="ksl-spectrum" role="img" aria-label={`Pods by status: ${spectrumLabel}`}>
            {spectrum.map(([s, n]) => (
              <span
                key={s}
                className="ksl-spectrum__seg"
                style={{ flexGrow: n, '--tone': STATUS_COLORS[s] } as React.CSSProperties}
              />
            ))}
          </div>
          <p className="ksl-spectrum__legend" aria-hidden="true">
            {spectrum.map(([s, n]) => (
              <span key={s} className="ksl-spectrum__key">
                <span className="ksl-dot" style={{ '--tone': STATUS_COLORS[s] } as React.CSSProperties} />
                {n} {STATUS_LABELS[s].toLowerCase()}
              </span>
            ))}
          </p>
        </>
      )}
    </>
  );
}
