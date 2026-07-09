import { useMemo } from 'react';
import type { PodItem } from '../types/api';
import { STATUS_COLORS, SEVERITY_ORDER } from '../constants/status';

interface Props {
  pods: PodItem[];
}

export default function PodGrid({ pods }: Props) {
  const sorted = useMemo(
    () => [...pods].sort((a, b) => (SEVERITY_ORDER[a.status] ?? 5) - (SEVERITY_ORDER[b.status] ?? 5)),
    [pods],
  );

  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {sorted.map((p) => (
        <div
          key={p.name}
          title={`${p.name}: ${p.status}`}
          style={{
            width: 8,
            height: 8,
            backgroundColor: STATUS_COLORS[p.status] ?? STATUS_COLORS.Unknown,
            transition: 'background-color 240ms cubic-bezier(0.2, 0, 0.38, 0.9)',
          }}
        />
      ))}
    </div>
  );
}
