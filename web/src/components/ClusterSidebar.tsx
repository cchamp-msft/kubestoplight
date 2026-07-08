import {
  SideNavItems,
  SideNavLink,
  Button,
} from '@carbon/react';
import {
  CheckmarkFilled,
  ErrorFilled,
  Add,
} from '@carbon/icons-react';
import type { Cluster, NamespaceGroup, NamespaceStatusKind } from '../types/api';
import './ClusterSidebar.scss';

interface Props {
  clusters: Cluster[];
  groups: NamespaceGroup[];
  selected: string | null;
  connected: boolean;
  onSelect: (name: string | null) => void;
  onAddCluster: () => void;
  onEditCluster: (cluster: Cluster) => void;
  onRemoveCluster: (name: string) => void;
}

/** Derives the worst status across all groups for a given cluster. */
function clusterStatus(
  clusterName: string,
  groups: NamespaceGroup[]
): NamespaceStatusKind {
  const clusterGroups = groups.filter((g) => g.cluster === clusterName);
  if (clusterGroups.length === 0) return 'Idle';
  const order: NamespaceStatusKind[] = ['Failed', 'Busy', 'Changing', 'Idle'];
  for (const s of order) {
    if (clusterGroups.some((g) => g.status === s)) return s;
  }
  return 'Idle';
}

const STATUS_ICONS: Record<NamespaceStatusKind, React.ReactNode> = {
  Idle:     <CheckmarkFilled size={16} className="status-icon status-idle" />,
  Busy:     <CheckmarkFilled size={16} className="status-icon status-busy" />,
  Changing: <CheckmarkFilled size={16} className="status-icon status-changing" />,
  Failed:   <ErrorFilled     size={16} className="status-icon status-failed" />,
  Unknown:  <ErrorFilled     size={16} className="status-icon status-unknown" />,
};

export default function ClusterSidebar({
  clusters,
  groups,
  selected,
  connected,
  onSelect,
  onAddCluster,
  onEditCluster,
  onRemoveCluster,
}: Props) {
  return (
    <div className="cluster-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Clusters</span>
        <div className="sidebar-header-actions">
          {connected
            ? <CheckmarkFilled size={16} className="status-icon status-idle" title="Connected" />
            : <ErrorFilled     size={16} className="status-icon status-failed" title="Disconnected" />
          }
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Add}
            iconDescription="Add cluster"
            hasIconOnly
            onClick={onAddCluster}
            className="add-cluster-btn"
          />
        </div>
      </div>

      <SideNavItems>
        <SideNavLink
          href="#"
          isActive={selected === null}
          onClick={(e: React.MouseEvent) => { e.preventDefault(); onSelect(null); }}
        >
          All clusters
        </SideNavLink>

        {clusters.map((c) => {
          const status = clusterStatus(c.name, groups);
          return (
            <div
              key={c.name}
              className={`cluster-nav-item${selected === c.name ? ' active' : ''}`}
            >
              <SideNavLink
                href="#"
                isActive={selected === c.name}
                onClick={(e: React.MouseEvent) => { e.preventDefault(); onSelect(c.name); }}
              >
                <span className="cluster-nav-label">
                  {STATUS_ICONS[status]}
                  <span className="cluster-name">{c.name}</span>
                  {!c.enabled && <span className="disabled-badge">disabled</span>}
                </span>
              </SideNavLink>
              <div className="cluster-actions">
                <Button
                  kind="ghost" size="sm"
                  onClick={() => onEditCluster(c)}
                  className="cluster-action-btn"
                >Edit</Button>
                <Button
                  kind="danger--ghost" size="sm"
                  onClick={() => onRemoveCluster(c.name)}
                  className="cluster-action-btn"
                >Remove</Button>
              </div>
            </div>
          );
        })}
      </SideNavItems>
    </div>
  );
}
