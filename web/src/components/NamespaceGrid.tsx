import type { NamespaceGroup, PodItem } from '../types/api';
import NamespaceCard from './NamespaceCard';
import EmptyState from './EmptyState';
import Icon from './ui/Icon';
import './NamespaceGrid.scss';

interface Props {
  groups: NamespaceGroup[];
  totalGroups: number;
  hasClusters: boolean;
  expandedCards: Set<string>;
  onToggleCard: (key: string) => void;
  searchQuery: string;
  onClearFilters: () => void;
  /** Omitted when the server is read-only. */
  onAddCluster?: () => void;
  onPodDescribe: (pod: PodItem) => void;
  onPodLogs: (pod: PodItem) => void;
}

export default function NamespaceGrid({
  groups, totalGroups, hasClusters, expandedCards, onToggleCard, searchQuery,
  onClearFilters, onAddCluster, onPodDescribe, onPodLogs,
}: Props) {
  if (groups.length === 0) {
    if (!hasClusters) {
      return (
        <EmptyState
          title="No clusters yet"
          message={onAddCluster
            ? 'Add a cluster with a kubeconfig path or a bearer token, and its pods show up here.'
            : 'This server is read-only and has no clusters configured.'}
          actions={onAddCluster &&
            <button className="btn" type="button" onClick={onAddCluster}>
              <Icon name="plus" />
              Add cluster
            </button>
          }
        />
      );
    }
    if (totalGroups === 0) {
      return <EmptyState title="Waiting for data" message="Connected clusters haven't reported any namespaces yet." />;
    }
    return (
      <EmptyState
        title="No matches"
        message={
          searchQuery
            ? `No namespaces match "${searchQuery}" with the current filters.`
            : 'Every namespace is filtered out. Turn a status back on or show all-idle namespaces.'
        }
        actions={<button className="btn btn--ghost" type="button" onClick={onClearFilters}>Clear filters</button>}
      />
    );
  }

  return (
    <div className="ksl-grid">
      {groups.map((g) => {
        const key = `${g.cluster}/${g.namespace}`;
        return (
          <NamespaceCard
            key={key}
            group={g}
            expanded={expandedCards.has(key)}
            onToggle={() => onToggleCard(key)}
            onPodDescribe={onPodDescribe}
            onPodLogs={onPodLogs}
          />
        );
      })}
    </div>
  );
}
