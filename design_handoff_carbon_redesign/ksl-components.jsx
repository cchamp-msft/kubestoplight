/* ksl-components.jsx — Kubestoplight UI components (Carbon G100) */

const {
  Tag, Search, Checkbox, Toggle, Button, Tooltip
} = window.CarbonDesignSystem_496640;

/* ─── Constants ─── */

const KSL_STATUS_COLORS = {
  Idle: 'var(--cds-support-success)',
  Busy: 'var(--cds-support-info)',
  Changing: 'var(--cds-support-warning)',
  Failed: 'var(--cds-support-error)',
  Empty: 'var(--cds-text-disabled)',
  Unknown: 'var(--cds-text-helper)',
};

const KSL_TAG_TYPE = {
  Idle: 'green', Busy: 'blue', Changing: 'teal',
  Failed: 'red', Empty: 'gray', Unknown: 'gray',
};

const KSL_SEVERITY = {
  Failed: 0, Changing: 1, Busy: 2, Idle: 3, Empty: 4, Unknown: 5,
};

/* ─── PodGrid — row of small colored squares per pod ─── */

function KSLPodGrid({ pods }) {
  const sorted = [...pods].sort(
    (a, b) => (KSL_SEVERITY[a.status] ?? 5) - (KSL_SEVERITY[b.status] ?? 5)
  );
  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {sorted.map((p, i) => (
        <div key={i} title={`${p.name}: ${p.status}`} style={{
          width: 8, height: 8,
          backgroundColor: KSL_STATUS_COLORS[p.status] || KSL_STATUS_COLORS.Unknown,
          transition: 'background-color 240ms cubic-bezier(0.2, 0, 0.38, 0.9)',
        }} />
      ))}
    </div>
  );
}

/* ─── StatusBar — stacked horizontal bar by status ─── */

function KSLStatusBar({ statusCounts, total }) {
  if (!total) return <div style={{ height: 4, backgroundColor: 'var(--cds-layer-02)' }} />;
  const segments = [
    { key: 'Failed',   count: statusCounts.Failed   || 0, color: KSL_STATUS_COLORS.Failed },
    { key: 'Changing', count: statusCounts.Changing  || 0, color: KSL_STATUS_COLORS.Changing },
    { key: 'Busy',     count: statusCounts.Busy      || 0, color: KSL_STATUS_COLORS.Busy },
    { key: 'Idle',     count: statusCounts.Idle      || 0, color: KSL_STATUS_COLORS.Idle },
  ].filter(s => s.count > 0);

  return (
    <div style={{ display: 'flex', height: 4, backgroundColor: 'var(--cds-layer-02)', overflow: 'hidden' }}>
      {segments.map(s => (
        <div key={s.key} style={{
          width: `${(s.count / total) * 100}%`,
          backgroundColor: s.color,
          transition: 'width 400ms cubic-bezier(0.2, 0, 0.38, 0.9)',
        }} />
      ))}
    </div>
  );
}

/* ─── SummaryTile — single stat tile ─── */

function KSLSummaryTile({ label, value, accent, subtext }) {
  return (
    <div style={{
      backgroundColor: 'var(--cds-layer-01)', padding: '16px 20px',
      borderTop: `3px solid ${accent}`, minWidth: 0,
    }}>
      <div style={{
        fontSize: '1.75rem', fontWeight: 400, lineHeight: 1.29,
        color: 'var(--cds-text-primary)', fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{
        fontSize: '0.75rem', color: 'var(--cds-text-helper)',
        marginTop: 4, letterSpacing: '0.32px',
      }}>{label}</div>
      {subtext && (
        <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-helper)', marginTop: 2 }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

/* ─── SummaryStrip — row of 4 summary tiles ─── */

function KSLSummaryStrip({ groups }) {
  const t = groups.reduce((a, g) => {
    a.pods += g.totalPods;
    a.idle += (g.statusCounts.Idle || 0);
    a.failed += (g.statusCounts.Failed || 0);
    a.busy += (g.statusCounts.Busy || 0);
    a.changing += (g.statusCounts.Changing || 0);
    return a;
  }, { pods: 0, idle: 0, failed: 0, busy: 0, changing: 0 });

  const pct = t.pods > 0 ? Math.round((t.idle / t.pods) * 100) : 0;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 8, backgroundColor: 'var(--cds-background)',
    }}>
      <KSLSummaryTile label="Total pods" value={t.pods}
        accent="var(--cds-border-interactive)" />
      <KSLSummaryTile label="Healthy" value={`${pct}%`}
        accent="var(--cds-support-success)" subtext={`${t.idle} idle`} />
      <KSLSummaryTile label="Failed" value={t.failed}
        accent={t.failed > 0 ? 'var(--cds-support-error)' : 'var(--cds-border-subtle-01)'} />
      <KSLSummaryTile label="In progress" value={t.busy + t.changing}
        accent="var(--cds-support-info)"
        subtext={t.busy || t.changing ? `${t.busy} busy, ${t.changing} changing` : null} />
    </div>
  );
}

/* ─── DarkCheckbox — G100-safe checkbox ─── */

function KSLCheckbox({ id, label, checked, onChange }) {
  const boxSize = 16;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onChange(!checked)}>
      <div style={{
        width: boxSize, height: boxSize, flexShrink: 0,
        border: `1px solid ${checked ? 'var(--cds-interactive)' : 'var(--cds-icon-secondary)'}`,
        backgroundColor: checked ? 'var(--cds-interactive)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background-color 70ms cubic-bezier(0.2,0,0.38,0.9)',
      }}>
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="var(--cds-icon-inverse)">
            <path d="M3.5 6.1L1.2 3.8 0 5l3.5 3.5L10 2.2 8.8 1z" />
          </svg>
        )}
      </div>
      <span style={{
        fontSize: '0.875rem', color: 'var(--cds-text-primary)',
        lineHeight: 1.29, letterSpacing: '0.16px',
      }}>{label}</span>
    </div>
  );
}

/* ─── FilterBar ─── */

function KSLFilterBar({
  searchQuery, onSearch,
  statusFilters, onStatusFilter,
  hideIdle, onHideIdle,
  hideEmpty, onHideEmpty,
  nsCounts,
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 16, padding: '16px 0 12px',
      flexWrap: 'wrap', borderBottom: '1px solid var(--cds-border-subtle-01)',
    }}>
      <div style={{ flex: '1 1 220px', minWidth: 180 }}>
        <Search id="ns-search" size="sm" placeholder="Filter namespaces"
          value={searchQuery} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '0.75rem', color: 'var(--cds-text-helper)',
          letterSpacing: '0.32px', textTransform: 'uppercase', fontWeight: 600,
        }}>Status</span>
        {['Failed', 'Changing', 'Busy', 'Idle'].map(s => (
          <KSLCheckbox key={s} id={`filter-${s}`}
            label={`${s}${nsCounts[s] != null ? ` (${nsCounts[s]})` : ''}`}
            checked={statusFilters[s]}
            onChange={(checked) => onStatusFilter(s, checked)} />
        ))}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        borderLeft: '1px solid var(--cds-border-subtle-01)', paddingLeft: 16,
      }}>
        <Toggle id="hide-idle" size="sm" labelText="Hide all-idle"
          labelA="" labelB="" toggled={hideIdle} onToggle={onHideIdle} />
        <Toggle id="hide-empty" size="sm" labelText="Hide empty"
          labelA="" labelB="" toggled={hideEmpty} onToggle={onHideEmpty} />
      </div>
    </div>
  );
}

/* ─── PodRow — single pod in expanded card ─── */

function KSLPodRow({ pod }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto auto auto',
      gap: 12, alignItems: 'center',
      padding: '6px 0',
      borderBottom: '1px solid var(--cds-border-subtle-01)',
    }}>
      <span style={{
        fontFamily: 'var(--cds-font-mono)', fontSize: '0.75rem',
        color: 'var(--cds-text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{pod.name}</span>
      <Tag type={KSL_TAG_TYPE[pod.status] || 'gray'} size="sm">{pod.status}</Tag>
      <span style={{
        fontFamily: 'var(--cds-font-mono)', fontSize: '0.75rem',
        color: 'var(--cds-text-secondary)', fontVariantNumeric: 'tabular-nums',
      }}>{pod.ready}/{pod.total}</span>
      <span style={{
        fontSize: '0.75rem', color: 'var(--cds-text-helper)', whiteSpace: 'nowrap',
      }}>{pod.age}</span>
    </div>
  );
}

/* ─── Chevron icon ─── */

function KSLChevron({ open }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0)',
        transition: 'transform 150ms cubic-bezier(0.2, 0, 0.38, 0.9)',
        flexShrink: 0,
      }}>
      <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z" />
    </svg>
  );
}

/* ─── NamespaceCard — the main namespace card ─── */

function KSLNamespaceCard({ group, expanded, onToggle }) {
  const { namespace, cluster, totalPods, activePods, readyPods, status, statusCounts, pods } = group;
  const statusColor = KSL_STATUS_COLORS[status] || KSL_STATUS_COLORS.Unknown;
  const [hovered, setHovered] = React.useState(false);

  const sortedPods = React.useMemo(() =>
    [...pods].sort((a, b) => (KSL_SEVERITY[a.status] ?? 5) - (KSL_SEVERITY[b.status] ?? 5)),
    [pods]
  );

  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: hovered ? 'var(--cds-layer-hover-01)' : 'var(--cds-layer-01)',
        borderLeft: `3px solid ${statusColor}`,
        cursor: 'pointer',
        transition: 'background-color 150ms cubic-bezier(0.2, 0, 0.38, 0.9)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 16px 0', gap: 8,
      }}>
        <span style={{
          fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.29,
          letterSpacing: '0.16px', color: 'var(--cds-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>{namespace}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Tag type="cool-gray" size="sm">{cluster}</Tag>
          <KSLChevron open={expanded} />
        </div>
      </div>

      {/* Pod grid */}
      <div style={{ padding: '12px 16px 0' }}>
        <KSLPodGrid pods={sortedPods} />
      </div>

      {/* Status bar + ready */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 0' }}>
        <div style={{ flex: 1 }}><KSLStatusBar statusCounts={statusCounts} total={totalPods} /></div>
        <span style={{
          fontSize: '0.75rem', color: 'var(--cds-text-helper)',
          whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
        }}>{readyPods}/{activePods} ready</span>
      </div>

      {/* Pod count + status tags */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px 16px', gap: 8,
      }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-helper)' }}>
          {totalPods} pod{totalPods !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(statusCounts.Failed || 0) > 0 && <Tag type="red" size="sm">{statusCounts.Failed} failed</Tag>}
          {(statusCounts.Changing || 0) > 0 && <Tag type="teal" size="sm">{statusCounts.Changing} changing</Tag>}
          {(statusCounts.Busy || 0) > 0 && <Tag type="blue" size="sm">{statusCounts.Busy} busy</Tag>}
          {(statusCounts.Idle || 0) > 0 && <Tag type="green" size="sm">{statusCounts.Idle} idle</Tag>}
        </div>
      </div>

      {/* Expanded pod detail */}
      {expanded && (
        <div className="ksl-card-expand" style={{
          borderTop: '1px solid var(--cds-border-subtle-01)',
          padding: '8px 16px 16px',
        }}>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto auto',
            gap: 12, padding: '4px 0 6px',
            fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-helper)',
            letterSpacing: '0.32px', textTransform: 'uppercase',
            borderBottom: '1px solid var(--cds-border-subtle-01)',
          }}>
            <span>Name</span><span>Status</span><span>Ready</span><span>Age</span>
          </div>
          {sortedPods.map(pod => <KSLPodRow key={pod.name} pod={pod} />)}
        </div>
      )}
    </div>
  );
}

/* ─── EmptyState ─── */

function KSLEmptyState({ title, message }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '64px 24px', color: 'var(--cds-text-helper)',
    }}>
      {/* Carbon-style line pictogram */}
      <svg width="64" height="64" viewBox="0 0 32 32" fill="none" stroke="currentColor"
        strokeWidth="1" style={{ marginBottom: 16, opacity: 0.5 }}>
        <rect x="4" y="4" width="24" height="24" rx="0" />
        <line x1="4" y1="12" x2="28" y2="12" />
        <line x1="12" y1="12" x2="12" y2="28" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="20" cy="20" r="3" />
      </svg>
      <div style={{
        fontSize: '0.875rem', fontWeight: 600, marginBottom: 4,
        color: 'var(--cds-text-primary)',
      }}>{title || 'No namespaces found'}</div>
      <div style={{ fontSize: '0.875rem', textAlign: 'center', maxWidth: 320 }}>
        {message || 'Adjust filters or add a cluster to get started.'}
      </div>
    </div>
  );
}

/* ─── Export to window ─── */
Object.assign(window, {
  KSLPodGrid, KSLStatusBar, KSLSummaryTile, KSLSummaryStrip,
  KSLFilterBar, KSLPodRow, KSLChevron, KSLNamespaceCard, KSLEmptyState,
  KSL_STATUS_COLORS, KSL_TAG_TYPE, KSL_SEVERITY,
});
