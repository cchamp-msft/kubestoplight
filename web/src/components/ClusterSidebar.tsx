import { useMemo } from 'react';
import type { Cluster, NamespaceGroup } from '../types/api';
import { STATUS_COLORS } from '../constants/status';
import Icon from './ui/Icon';
import './ClusterSidebar.scss';

interface Props {
  clusters: Cluster[];
  groups: NamespaceGroup[];
  selectedCluster: string | null;
  onSelect: (name: string | null) => void;
  onAdd: () => void;
  onEdit: (c: Cluster) => void;
  onRemove: (name: string) => void;
}

interface Row {
  name: string;
  pods: number;
  worst: string | null; // null = no data yet
  config?: Cluster;
}

const SEV = ['Failed', 'Changing', 'Busy', 'Idle'];

export default function ClusterSidebar({ clusters, groups, selectedCluster, onSelect, onAdd, onEdit, onRemove }: Props) {
  // Configured clusters (incl. disabled and not-yet-polled) plus any that only
  // appear in the live feed.
  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const c of clusters) map.set(c.name, { name: c.name, pods: 0, worst: null, config: c });
    for (const g of groups) {
      const r = map.get(g.cluster) ?? { name: g.cluster, pods: 0, worst: null };
      r.pods += g.totalPods;
      if (r.worst === null || SEV.indexOf(g.status) < SEV.indexOf(r.worst)) r.worst = g.status;
      map.set(g.cluster, r);
    }
    return [...map.values()];
  }, [clusters, groups]);

  const totalPods = groups.reduce((n, g) => n + g.totalPods, 0);

  return (
    <nav className="side-nav ksl-sidebar" aria-label="Clusters">
      <div className="ksl-sidebar__head">
        <p className="side-nav__heading">Clusters</p>
        <button
          className="btn btn--ghost btn--icon ksl-btn-sm"
          type="button"
          aria-label="Add cluster"
          title="Add cluster"
          onClick={onAdd}
        >
          <Icon name="plus" />
        </button>
      </div>

      <ul className="side-nav__list">
        <li>
          <button
            type="button"
            className="side-nav__link ksl-sidebar__link"
            aria-current={!selectedCluster ? 'page' : undefined}
            onClick={() => onSelect(null)}
          >
            <span className="ksl-sidebar__name">All clusters</span>
            <span className="ksl-sidebar__count">{totalPods}</span>
          </button>
        </li>

        {rows.map((r) => {
          const disabled = r.config?.enabled === false;
          return (
            <li key={r.name} className="ksl-sidebar__row">
              <button
                type="button"
                className="side-nav__link ksl-sidebar__link"
                aria-current={selectedCluster === r.name ? 'page' : undefined}
                onClick={() => onSelect(r.name)}
              >
                <span
                  className="ksl-dot"
                  style={{ '--tone': r.worst ? STATUS_COLORS[r.worst] : undefined } as React.CSSProperties}
                  aria-hidden="true"
                />
                <span className="ksl-sidebar__name">{r.name}</span>
                <span className="ksl-sidebar__count">{disabled ? 'off' : r.pods}</span>
              </button>
              {r.config && (
                <span className="ksl-sidebar__actions">
                  <button
                    className="btn btn--ghost btn--icon ksl-btn-sm"
                    type="button"
                    aria-label={`Edit ${r.name}`}
                    title="Edit"
                    onClick={() => onEdit(r.config!)}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    className="btn btn--ghost btn--icon ksl-btn-sm"
                    type="button"
                    aria-label={`Remove ${r.name}`}
                    title="Remove"
                    onClick={() => onRemove(r.name)}
                  >
                    <Icon name="trash" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="caption ksl-sidebar__footer">kubestoplight v0.2.0</p>
    </nav>
  );
}
