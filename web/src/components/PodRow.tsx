import type { PodItem } from '../types/api';
import Status from './ui/Status';
import Icon from './ui/Icon';
import Tooltip from './ui/Tooltip';

interface Props {
  pod: PodItem;
  onDescribe: (pod: PodItem) => void;
  onLogs: (pod: PodItem) => void;
}

export default function PodRow({ pod, onDescribe, onLogs }: Props) {
  return (
    <tr className="ksl-pod-row">
      <th scope="row" className="ksl-pod-row__name ksl-mono" title={pod.name}>{pod.name}</th>
      <td><Status status={pod.status} /></td>
      <td className="is-num ksl-mono">{pod.ready}/{pod.total}</td>
      <td className="is-num table__muted">{pod.age}</td>
      <td className="table__actions">
        <Tooltip label="Describe">
          <button className="btn btn--ghost btn--icon" type="button" aria-label="Describe" onClick={() => onDescribe(pod)}>
            <Icon name="info" />
          </button>
        </Tooltip>
        <Tooltip label="Logs">
          <button className="btn btn--ghost btn--icon" type="button" aria-label="Logs" onClick={() => onLogs(pod)}>
            <Icon name="terminal" />
          </button>
        </Tooltip>
      </td>
    </tr>
  );
}
