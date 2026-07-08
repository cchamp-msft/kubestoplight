import { Tag } from '@carbon/react';
import type { NamespaceGroup, NamespaceStatusKind } from '../types/api';
import './NamespaceCard.scss';

interface Props {
  group: NamespaceGroup;
}

const STATUS_TAG_TYPE: Record<NamespaceStatusKind, string> = {
  Idle:     'green',
  Busy:     'blue',
  Changing: 'warm-gray',
  Failed:   'red',
  Unknown:  'gray',
};

export default function NamespaceCard({ group }: Props) {
  const { namespace, cluster, totalPods, readyPods, activePods, status, statusCounts } = group;
  const progressPct = activePods > 0 ? Math.round((readyPods / activePods) * 100) : 100;

  return (
    <div className={`ns-card ns-card--${status.toLowerCase()}`}>
      <div className="ns-card__header">
        <span className="ns-card__namespace">{namespace}</span>
        <Tag type={STATUS_TAG_TYPE[status] as any} size="sm" className="ns-card__cluster-tag">
          {cluster}
        </Tag>
      </div>

      <div className="ns-card__progress-row">
        <div className="ns-card__progress-bar">
          <div
            className="ns-card__progress-fill"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <span className="ns-card__progress-label">{readyPods}/{activePods} ready</span>
      </div>

      <div className="ns-card__status-row">
        <span className="ns-card__total">{totalPods} pods</span>
        <div className="ns-card__counts">
          {(statusCounts['Failed'] ?? 0) > 0 && (
            <Tag type="red" size="sm">✗ {statusCounts['Failed']}</Tag>
          )}
          {(statusCounts['Busy'] ?? 0) > 0 && (
            <Tag type="blue" size="sm">◉ {statusCounts['Busy']}</Tag>
          )}
          {(statusCounts['Changing'] ?? 0) > 0 && (
            <Tag type="warm-gray" size="sm">◆ {statusCounts['Changing']}</Tag>
          )}
          {(statusCounts['Idle'] ?? 0) > 0 && (
            <Tag type="green" size="sm">● {statusCounts['Idle']}</Tag>
          )}
        </div>
      </div>
    </div>
  );
}
