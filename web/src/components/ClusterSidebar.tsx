import { useMemo } from 'react';
import type { NamespaceGroup } from '../types/api';
import { STATUS_COLORS } from '../constants/status';
import './ClusterSidebar.scss';

interface Props {
  groups: NamespaceGroup[];
  selectedCluster: string | null;
  onSelect: (name: string | null) => void;
  connected: boolean;
}

export default function ClusterSidebar({ groups, selectedCluster, onSelect, connected }: Props) {
  const clusters = useMemo(() => {
    const map = new Map<string, { pods: number; worst: string }>();
    for (const g of groups) {
      if (!map.has(g.cluster)) map.set(g.cluster, { pods: 0, worst: 'Idle' });
      const c = map.get(g.cluster)!;
      c.pods += g.totalPods;
      const sev = ['Failed', 'Changing', 'Busy', 'Idle'];
      if (sev.indexOf(g.status) < sev.indexOf(c.worst)) c.worst = g.status;
    }
    return map;
  }, [groups]);

  const totalPods = groups.reduce((n, g) => n + g.totalPods, 0);

  return (
    <nav className="ksl-sidebar">
      {/* Section label */}
      <div className="ksl-sidebar__header">
        <span className="ksl-sidebar__title">Clusters</span>
        <div className="ksl-sidebar__status">
          <span
            className="ksl-sidebar__dot"
            style={{
              backgroundColor: connected ? 'var(--cds-support-success)' : 'var(--cds-support-error)',
            }}
          />
          <span className="ksl-sidebar__status-label">{connected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      {/* All clusters */}
      <div
        className={`ksl-sidebar__item${!selectedCluster ? ' ksl-sidebar__item--active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span style={{ flex: 1 }}>All clusters</span>
        <span className="ksl-sidebar__count">{totalPods}</span>
      </div>

      {/* Individual clusters */}
      {[...clusters.entries()].map(([name, info]) => (
        <div
          key={name}
          className={`ksl-sidebar__item${selectedCluster === name ? ' ksl-sidebar__item--active' : ''}`}
          onClick={() => onSelect(name)}
        >
          <span
            className="ksl-sidebar__cluster-dot"
            style={{ backgroundColor: STATUS_COLORS[info.worst] }}
          />
          <span className="ksl-sidebar__cluster-name">{name}</span>
          <span className="ksl-sidebar__count">{info.pods}</span>
        </div>
      ))}

      {/* Footer */}
      <div className="ksl-sidebar__spacer" />
      <div className="ksl-sidebar__footer">
        kubestoplight <span style={{ opacity: 0.6 }}>v0.2.0</span>
      </div>
    </nav>
  );
}
