import { useEffect, useCallback } from 'react';
import { Tag, Tabs, TabList, Tab, TabPanels, TabPanel, IconButton } from '@carbon/react';
import { Close } from '@carbon/icons-react';
import type { PodItem } from '../types/api';
import { STATUS_TAG_TYPE } from '../constants/status';
import PodDescribeTab from './PodDescribeTab';
import PodLogsTab from './PodLogsTab';
import PodYamlTab from './PodYamlTab';
import './PodDetailPanel.scss';

interface Props {
  pod: PodItem;
  initialTab: number;
  onClose: () => void;
}

export default function PodDetailPanel({ pod, initialTab, onClose }: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="ksl-panel-backdrop" onClick={onClose}>
      <aside className="ksl-panel" onClick={(e) => e.stopPropagation()}>
        <header className="ksl-panel__header">
          <span className="ksl-panel__pod-name">{pod.name}</span>
          <Tag type="cool-gray" size="sm">{pod.namespace}</Tag>
          <Tag type="cool-gray" size="sm">{pod.cluster}</Tag>
          <Tag type={(STATUS_TAG_TYPE[pod.status] as any) ?? 'gray'} size="sm">{pod.status}</Tag>
          <div style={{ flex: 1 }} />
          <IconButton kind="ghost" size="sm" label="Close" onClick={onClose}>
            <Close />
          </IconButton>
        </header>

        <Tabs defaultSelectedIndex={initialTab}>
          <TabList aria-label="Pod details" contained>
            <Tab>Describe</Tab>
            <Tab>Logs</Tab>
            <Tab>YAML</Tab>
          </TabList>
          <TabPanels>
            <TabPanel className="ksl-panel__tab-content">
              <PodDescribeTab cluster={pod.cluster} namespace={pod.namespace} pod={pod.name} />
            </TabPanel>
            <TabPanel className="ksl-panel__tab-content ksl-panel__tab-content--logs">
              <PodLogsTab cluster={pod.cluster} namespace={pod.namespace} pod={pod.name} />
            </TabPanel>
            <TabPanel className="ksl-panel__tab-content">
              <PodYamlTab cluster={pod.cluster} namespace={pod.namespace} pod={pod.name} />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </aside>
    </div>
  );
}
