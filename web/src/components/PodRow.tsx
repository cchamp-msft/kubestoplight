import type { PodItem } from '../types/api';
import StatusTag from './StatusTag';
import Icon from './ui/Icon';

interface Props {
  pod: PodItem;
  onDescribe: (pod: PodItem) => void;
  onLogs: (pod: PodItem) => void;
}

export default function PodRow({ pod, onDescribe, onLogs }: Props) {
  return (
    <tr className="ksl-pod-row">
      <th scope="row" className="ksl-pod-row__name ksl-mono" title={pod.name}>{pod.name}</th>
      <td><StatusTag status={pod.status} /></td>
      <td className="is-num ksl-mono">{pod.ready}/{pod.total}</td>
      <td className="is-num table__muted">{pod.age}</td>
      <td className="table__actions">
        <button
          className="btn btn--ghost btn--icon ksl-btn-sm"
          type="button"
          aria-label="Describe"
          title="Describe"
          onClick={() => onDescribe(pod)}
        >
          <Icon name="info" />
        </button>
        <button
          className="btn btn--ghost btn--icon ksl-btn-sm"
          type="button"
          aria-label="Logs"
          title="Logs"
          onClick={() => onLogs(pod)}
        >
          <Icon name="terminal" />
        </button>
      </td>
    </tr>
  );
}
