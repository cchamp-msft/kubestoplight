import type { PodCPU } from '../types/api';
import Icon from './ui/Icon';

/** Millicores the way `kubectl top` prints them. */
const milli = (m: number) => `${m}m`;

/**
 * A pod's CPU use: the number, a thin bar against its limit (or request),
 * and the violet gauge when it's hot. Pods without a reading get a dash.
 */
export default function CpuCell({ cpu }: { cpu?: PodCPU }) {
  if (!cpu) {
    return <td className="is-num table__muted"><span aria-label="No reading">–</span></td>;
  }
  const ref = cpu.limit || cpu.request;
  const share = ref > 0 ? cpu.used / ref : null;
  const of = cpu.limit ? 'limit' : 'request';
  return (
    <td className={`is-num ksl-cpu${cpu.hot ? ' is-hot' : ''}`}>
      <span className="ksl-cpu__value ksl-mono">
        {cpu.hot && <Icon name="hot" size="xs" />}
        {milli(cpu.used)}
      </span>
      {share !== null && (
        <span className="ksl-cpu__bar" aria-hidden="true">
          <span style={{ inlineSize: `${Math.min(share, 1) * 100}%` }} />
        </span>
      )}
      <span className="visually-hidden">
        {share !== null ? `, ${Math.round(share * 100)}% of its ${milli(ref)} ${of}` : ''}
        {cpu.hot ? ', hot' : ''}
      </span>
    </td>
  );
}
