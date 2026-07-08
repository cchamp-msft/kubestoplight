import type { NamespaceGroup } from '../types/api';
import NamespaceCard from './NamespaceCard';
import './NamespaceGrid.scss';

interface Props {
  groups: NamespaceGroup[];
  selectedCluster: string | null;
}

export default function NamespaceGrid({ groups, selectedCluster }: Props) {
  const filtered = selectedCluster
    ? groups.filter((g) => g.cluster === selectedCluster)
    : groups;

  if (filtered.length === 0) {
    return (
      <div className="ns-grid-empty">
        {groups.length === 0
          ? 'No data yet — waiting for the first poll…'
          : `No namespaces for cluster "${selectedCluster}".`}
      </div>
    );
  }

  return (
    <div className="ns-grid">
      {filtered.map((g) => (
        <NamespaceCard
          key={`${g.cluster}/${g.namespace}`}
          group={g}
        />
      ))}
    </div>
  );
}
