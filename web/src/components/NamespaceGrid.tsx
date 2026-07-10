import type { NamespaceGroup, PodItem } from '../types/api';
import NamespaceCard from './NamespaceCard';
import EmptyState from './EmptyState';
import './NamespaceGrid.scss';

interface Props {
  groups: NamespaceGroup[];
  expandedCards: Set<string>;
  onToggleCard: (key: string) => void;
  hasSearch: boolean;
  onPodDescribe: (pod: PodItem) => void;
  onPodLogs: (pod: PodItem) => void;
}

export default function NamespaceGrid({ groups, expandedCards, onToggleCard, hasSearch, onPodDescribe, onPodLogs }: Props) {
  if (groups.length === 0) {
    return (
      <EmptyState
        title={hasSearch ? 'No matches' : 'All filtered out'}
        message={
          hasSearch
            ? 'No namespaces match your search query.'
            : 'Adjust status filters or toggle "Hide all-idle" to see namespaces.'
        }
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
