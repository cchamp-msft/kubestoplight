import { useId, useRef, useState } from 'react';
import type { PodItem } from '../types/api';
import Sheet from './ui/Sheet';
import StatusTag from './StatusTag';
import PodDescribeTab from './PodDescribeTab';
import PodLogsTab from './PodLogsTab';
import PodYamlTab from './PodYamlTab';
import './PodDetailPanel.scss';

interface Props {
  pod: PodItem;
  initialTab: number;
  onClose: () => void;
}

const TABS = ['Describe', 'Logs', 'YAML'] as const;

export default function PodDetailPanel({ pod, initialTab, onClose }: Props) {
  const id = useId();
  const [tab, setTab] = useState(initialTab);
  // Panels mount on first visit and stay mounted, so the log stream keeps
  // its buffer when you flip to Describe and back.
  const [visited, setVisited] = useState(() => new Set([initialTab]));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (i: number) => {
    setTab(i);
    setVisited((v) => (v.has(i) ? v : new Set(v).add(i)));
  };

  // Jewel tabs keyboard model (tabs.js): arrows move and select, Home/End jump.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: (tab + 1) % TABS.length,
      ArrowLeft: (tab - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    select(keys[e.key]);
    tabRefs.current[keys[e.key]]?.focus();
  };

  const props = { cluster: pod.cluster, namespace: pod.namespace, pod: pod.name };

  return (
    <Sheet
      open
      onClose={onClose}
      placement="end"
      className="ksl-detail"
      labelTitle={false}
      title={<span className="ksl-mono ksl-detail__name">{pod.name}</span>}
      headExtra={
        <span className="ksl-detail__meta">
          <span className="tag">{pod.namespace}</span>
          <span className="tag">{pod.cluster}</span>
          <StatusTag status={pod.status} />
        </span>
      }
    >
      <div className="tabs ksl-detail__tabs">
        <div className="tabs__list" role="tablist" aria-label="Pod details" onKeyDown={onKeyDown}>
          {TABS.map((t, i) => (
            <button
              key={t}
              ref={(el) => { tabRefs.current[i] = el; }}
              className="tabs__tab"
              role="tab"
              type="button"
              id={`${id}-tab-${i}`}
              aria-controls={`${id}-panel-${i}`}
              aria-selected={tab === i}
              tabIndex={tab === i ? 0 : -1}
              onClick={() => select(i)}
            >
              {t}
            </button>
          ))}
        </div>
        {TABS.map((t, i) => (
          <div
            key={t}
            className={`tabs__panel ksl-detail__panel ksl-detail__panel--${t.toLowerCase()}`}
            role="tabpanel"
            id={`${id}-panel-${i}`}
            aria-labelledby={`${id}-tab-${i}`}
            hidden={tab !== i}
          >
            {visited.has(i) && i === 0 && <PodDescribeTab {...props} />}
            {visited.has(i) && i === 1 && <PodLogsTab {...props} />}
            {visited.has(i) && i === 2 && <PodYamlTab {...props} />}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
