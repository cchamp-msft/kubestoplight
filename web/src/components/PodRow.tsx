import type { PodItem } from '../types/api';
import Status from './ui/Status';
import Icon from './ui/Icon';
import Tooltip from './ui/Tooltip';
import CpuCell from './CpuCell';
import { STATUS_COLORS } from '../constants/status';
import { useFlashOnChange } from '../hooks/useFlashOnChange';

interface Props {
  pod: PodItem;
  /** The namespace has CPU readings, so this row gets a CPU cell. */
  showCpu: boolean;
  onDescribe: (pod: PodItem) => void;
  onLogs: (pod: PodItem) => void;
}

export default function PodRow({ pod, showCpu, onDescribe, onLogs }: Props) {
  const [flashing, flashDone] = useFlashOnChange(pod.status);
  return (
    <tr
      className={`ksl-pod-row${flashing ? ' ksl-flash' : ''}`}
      style={{ '--tone': STATUS_COLORS[pod.status] ?? STATUS_COLORS.Unknown } as React.CSSProperties}
      onAnimationEnd={(e) => { if (e.animationName === 'ksl-row-flash') flashDone(); }}
    >
      <th scope="row" className="ksl-pod-row__name ksl-mono" title={pod.name}>{pod.name}</th>
      <td><Status status={pod.status} /></td>
      <td className="is-num ksl-mono">{pod.ready}/{pod.total}</td>
      {showCpu && <CpuCell cpu={pod.cpu} />}
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
