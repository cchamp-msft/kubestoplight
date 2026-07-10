import { Tag, IconButton } from '@carbon/react';
import { Information, Terminal } from '@carbon/icons-react';
import type { PodItem } from '../types/api';
import { STATUS_TAG_TYPE } from '../constants/status';

interface Props {
  pod: PodItem;
  onDescribe: (pod: PodItem) => void;
  onLogs: (pod: PodItem) => void;
}

export default function PodRow({ pod, onDescribe, onLogs }: Props) {
  return (
    <div className="ksl-pod-row">
      <span className="ksl-pod-row__name">{pod.name}</span>
      <Tag type={STATUS_TAG_TYPE[pod.status] as any ?? 'gray'} size="sm">{pod.status}</Tag>
      <span className="ksl-pod-row__ready">{pod.ready}/{pod.total}</span>
      <span className="ksl-pod-row__age">{pod.age}</span>
      <span className="ksl-pod-row__actions">
        <IconButton
          kind="ghost"
          size="sm"
          label="Describe"
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDescribe(pod); }}
        >
          <Information />
        </IconButton>
        <IconButton
          kind="ghost"
          size="sm"
          label="Logs"
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onLogs(pod); }}
        >
          <Terminal />
        </IconButton>
      </span>
    </div>
  );
}
