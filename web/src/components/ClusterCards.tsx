import { useMemo } from 'react';
import type { Cluster, NamespaceGroup } from '../types/api';
import { STATUS_COLORS } from '../constants/status';
import Icon from './ui/Icon';
import Tooltip from './ui/Tooltip';
import './ClusterCards.scss';

interface Props {
  clusters: Cluster[];
  groups: NamespaceGroup[];
  selectedCluster: string | null;
  onSelect: (name: string | null) => void;
  readOnly?: boolean;
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

const pods = (n: number) => `${n} pod${n === 1 ? '' : 's'}`;

/**
 * The cluster filter: one small card per cluster, plus "All clusters". The
 * pressed card is the one the page is showing, so the filter and its state
 * are the same thing on screen.
 */
export default function ClusterCards({ clusters, groups, selectedCluster, onSelect, readOnly, onAdd, onEdit, onRemove }: Props) {
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
    <div className="ksl-clusters" role="group" aria-label="Filter by cluster">
      <div className="ksl-cluster">
        <button
          type="button"
          className="ksl-cluster__pick"
          aria-pressed={!selectedCluster}
          onClick={() => onSelect(null)}
        >
          <span className="ksl-cluster__name">All clusters</span>
          <span className="ksl-cluster__count">{pods(totalPods)}</span>
        </button>
      </div>

      {rows.map((r) => {
        const disabled = r.config?.enabled === false;
        const editable = r.config && !readOnly;
        return (
          <div key={r.name} className="ksl-cluster">
            <button
              type="button"
              className="ksl-cluster__pick"
              aria-pressed={selectedCluster === r.name}
              onClick={() => onSelect(r.name)}
            >
              <span className="ksl-cluster__name">
                <span
                  className="ksl-dot"
                  style={{ '--tone': r.worst ? STATUS_COLORS[r.worst] : undefined } as React.CSSProperties}
                  aria-hidden="true"
                />
                {r.name}
              </span>
              <span className="ksl-cluster__count">{disabled ? 'Off' : pods(r.pods)}</span>
            </button>
            {editable && (
              <span className="ksl-cluster__actions">
                <Tooltip label="Edit">
                  <button className="btn btn--ghost btn--icon" type="button" aria-label={`Edit ${r.name}`} onClick={() => onEdit(r.config!)}>
                    <Icon name="edit" />
                  </button>
                </Tooltip>
                <Tooltip label="Remove">
                  <button className="btn btn--ghost btn--icon" type="button" aria-label={`Remove ${r.name}`} onClick={() => onRemove(r.name)}>
                    <Icon name="trash" />
                  </button>
                </Tooltip>
              </span>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <button type="button" className="ksl-cluster ksl-cluster__add" onClick={onAdd}>
          <Icon name="plus" /> Add cluster
        </button>
      )}
    </div>
  );
}
