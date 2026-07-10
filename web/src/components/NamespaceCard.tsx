import { useState, useMemo } from 'react';
import { Tag } from '@carbon/react';
import type { NamespaceGroup } from '../types/api';
import { STATUS_COLORS, SEVERITY_ORDER, STATUS_COLORS_HEX, JOB_STATUS_COLORS_HEX } from '../constants/status';
import ResourceDonut from './ResourceDonut';
import PodRow from './PodRow';
import './NamespaceCard.scss';

interface Props {
  group: NamespaceGroup;
  expanded: boolean;
  onToggle: () => void;
  onPodDescribe: (pod: import('../types/api').PodItem) => void;
  onPodLogs: (pod: import('../types/api').PodItem) => void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`ksl-chevron${open ? ' ksl-chevron--open' : ''}`}
    >
      <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z" />
    </svg>
  );
}

export default function NamespaceCard({ group, expanded, onToggle, onPodDescribe, onPodLogs }: Props) {
  const { namespace, cluster, totalPods, activePods, readyPods, status, statusCounts, pods } = group;
  const totalJobs = group.totalJobs ?? 0;
  const jobStatusCounts = group.jobStatusCounts ?? {};
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.Unknown;
  const [hovered, setHovered] = useState(false);

  const sortedPods = useMemo(
    () => [...pods].sort((a, b) => (SEVERITY_ORDER[a.status] ?? 5) - (SEVERITY_ORDER[b.status] ?? 5)),
    [pods],
  );

  return (
    <div
      className="ksl-card"
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: hovered ? 'var(--cds-layer-hover-01)' : 'var(--cds-layer-01)',
        borderLeftColor: statusColor,
      }}
    >
      {/* Header */}
      <div className="ksl-card__header">
        <span className="ksl-card__namespace">{namespace}</span>
        <div className="ksl-card__header-right">
          <Tag type="cool-gray" size="sm">{cluster}</Tag>
          <Chevron open={expanded} />
        </div>
      </div>

      {/* Donut charts */}
      <div className="ksl-card__donuts">
        <ResourceDonut
          title="Pods"
          total={totalPods}
          statusCounts={statusCounts}
          colorMap={STATUS_COLORS_HEX}
        />
        <ResourceDonut
          title="Jobs"
          total={totalJobs}
          statusCounts={jobStatusCounts}
          colorMap={JOB_STATUS_COLORS_HEX}
        />
      </div>

      {/* Pod count + status tags */}
      <div className="ksl-card__status-row">
        <span className="ksl-card__total">
          {totalPods} pod{totalPods !== 1 ? 's' : ''}
          {' · '}
          {totalJobs} job{totalJobs !== 1 ? 's' : ''}
          <span className="ksl-card__ready">
            {readyPods}/{activePods} ready
          </span>
        </span>
        <div className="ksl-card__tags">
          {(statusCounts.Failed ?? 0) > 0 && <Tag type="red" size="sm">{statusCounts.Failed} failed</Tag>}
          {(statusCounts.Changing ?? 0) > 0 && <Tag type="teal" size="sm">{statusCounts.Changing} changing</Tag>}
          {(statusCounts.Busy ?? 0) > 0 && <Tag type="blue" size="sm">{statusCounts.Busy} busy</Tag>}
          {(statusCounts.Idle ?? 0) > 0 && <Tag type="green" size="sm">{statusCounts.Idle} idle</Tag>}
          {(jobStatusCounts.Failed ?? 0) > 0 && <Tag type="red" size="sm">{jobStatusCounts.Failed} job fail</Tag>}
        </div>
      </div>

      {/* Expanded pod detail */}
      {expanded && (
        <div className="ksl-card__detail ksl-card-expand">
          <div className="ksl-card__detail-header">
            <span>Name</span>
            <span>Status</span>
            <span>Ready</span>
            <span>Age</span>
            <span></span>
          </div>
          {sortedPods.map((pod) => (
            <PodRow key={pod.name} pod={pod} onDescribe={onPodDescribe} onLogs={onPodLogs} />
          ))}
        </div>
      )}
    </div>
  );
}
