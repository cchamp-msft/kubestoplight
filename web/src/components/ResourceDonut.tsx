import { memo } from 'react';

interface Props {
  title: string;
  total: number;
  statusCounts: Record<string, number>;
  colorMap: Record<string, string>;
  /** Which statuses to draw, in order (worst first). */
  order: string[];
}

const SIZE = 88;
const STROKE = 8;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GAP = 2; // Jewel chart spec: 2px gaps between touching slices

/**
 * Donut drawn to Jewel's chart spec (thin ring, 2px cut gaps, center text in
 * text colors, never series colors). Hand-rolled because Jewel's chart.js
 * draws from a DOM <table> and can't be driven from React data.
 */
const ResourceDonut = memo(function ResourceDonut({ title, total, statusCounts, colorMap, order }: Props) {
  const slices = order
    .map((s) => ({ status: s, count: statusCounts?.[s] ?? 0 }))
    .filter((s) => s.count > 0);
  const sum = slices.reduce((n, s) => n + s.count, 0);
  const label = `${title}: ${total}${slices.length ? ` — ${slices.map((s) => `${s.count} ${s.status.toLowerCase()}`).join(', ')}` : ''}`;

  let offset = 0;
  return (
    <figure className="ksl-donut" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
        <circle className="ksl-donut__track" cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} />
        {sum > 0 && slices.map((s) => {
          const len = (s.count / sum) * C;
          const gap = slices.length > 1 ? Math.min(GAP, len / 2) : 0;
          const el = (
            <circle
              key={s.status}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              strokeWidth={STROKE}
              fill="none"
              style={{ stroke: colorMap[s.status] }}
              strokeDasharray={`${len - gap} ${C - len + gap}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            >
              <title>{`${s.count} ${s.status}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <figcaption className="ksl-donut__center" aria-hidden="true">
        <span className="ksl-donut__value">{total}</span>
        <span className="ksl-donut__label">{title}</span>
      </figcaption>
    </figure>
  );
});

export default ResourceDonut;
