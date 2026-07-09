import { Tag } from '@carbon/react';
import type { PodItem } from '../types/api';
import { STATUS_TAG_TYPE } from '../constants/status';

interface Props {
  pod: PodItem;
}

export default function PodRow({ pod }: Props) {
  return (
    <div className="ksl-pod-row">
      <span className="ksl-pod-row__name">{pod.name}</span>
      <Tag type={STATUS_TAG_TYPE[pod.status] as any ?? 'gray'} size="sm">{pod.status}</Tag>
      <span className="ksl-pod-row__ready">{pod.ready}/{pod.total}</span>
      <span className="ksl-pod-row__age">{pod.age}</span>
    </div>
  );
}
