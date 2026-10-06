import { useId, useMemo } from 'react';
import type { NamespaceGroup, NamespaceStatusKind, PodItem } from '../types/api';
import {
  STATUS_COLORS, SEVERITY_ORDER, JOB_STATUS_COLORS, POD_STATUS_ORDER, JOB_STATUS_ORDER,
} from '../constants/status';
import ResourceDonut from './ResourceDonut';
import PodRow from './PodRow';
import StatusTag from './StatusTag';
import Icon from './ui/Icon';
import './NamespaceCard.scss';

interface Props {
  group: NamespaceGroup;
  expanded: boolean;
  onToggle: () => void;
  onPodDescribe: (pod: PodItem) => void;
  onPodLogs: (pod: PodItem) => void;
}

const COUNT_TAGS: [status: NamespaceStatusKind, label: string][] = [
  ['Failed', 'failed'],
  ['Changing', 'changing'],
  ['Busy', 'busy'],
  ['Idle', 'idle'],
];

export default function NamespaceCard({ group, expanded, onToggle, onPodDescribe, onPodLogs }: Props) {
  const { namespace, cluster, totalPods, activePods, readyPods, status, statusCounts, pods } = group;
  const totalJobs = group.totalJobs ?? 0;
  const jobStatusCounts = group.jobStatusCounts ?? {};
  const detailId = useId();

  const sortedPods = useMemo(
    () => [...pods].sort((a, b) => (SEVERITY_ORDER[a.status] ?? 5) - (SEVERITY_ORDER[b.status] ?? 5)),
    [pods],
  );

  return (
    <article
      className="ksl-card"
      style={{ '--tone': STATUS_COLORS[status] ?? STATUS_COLORS.Unknown } as React.CSSProperties}
    >
      <button
        type="button"
        className="ksl-card__toggle"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="ksl-card__header">
          <span className="ksl-card__namespace">{namespace}</span>
          <span className="tag">{cluster}</span>
          <Icon name="chevron" className={`ksl-chevron${expanded ? ' ksl-chevron--open' : ''}`} />
        </span>

        <span className="ksl-card__donuts">
          <ResourceDonut
            title="Pods"
            total={totalPods}
            statusCounts={statusCounts}
            colorMap={STATUS_COLORS}
            order={POD_STATUS_ORDER}
          />
          <ResourceDonut
            title="Jobs"
            total={totalJobs}
            statusCounts={jobStatusCounts}
            colorMap={JOB_STATUS_COLORS}
            order={JOB_STATUS_ORDER}
          />
        </span>

        <span className="ksl-card__status-row">
          <span className="ksl-card__ready">
            {readyPods}/{activePods} ready
          </span>
          <span className="ksl-card__tags">
            {COUNT_TAGS.map(([s, label]) =>
              (statusCounts[s] ?? 0) > 0 ? (
                <StatusTag key={s} status={s}>{statusCounts[s]} {label}</StatusTag>
              ) : null,
            )}
            {(jobStatusCounts.Failed ?? 0) > 0 && (
              <StatusTag tone={JOB_STATUS_COLORS.Failed}>{jobStatusCounts.Failed} job failed</StatusTag>
            )}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="ksl-card__detail table-wrap" id={detailId}>
          <table className="table table--compact ksl-pods">
            <caption className="visually-hidden">Pods in {namespace} on {cluster}</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col" className="is-num">Ready</th>
                <th scope="col" className="is-num">Age</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {sortedPods.map((pod) => (
                <PodRow key={pod.name} pod={pod} onDescribe={onPodDescribe} onLogs={onPodLogs} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
