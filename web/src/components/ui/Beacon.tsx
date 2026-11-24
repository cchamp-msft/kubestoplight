import type { Lens } from '../../constants/status';

const LENSES = [
  ['stop', 'var(--status-failed)'],
  ['caution', 'var(--status-changing)'],
  ['go', 'var(--status-idle)'],
] as const;

/**
 * The kubestoplight mark: a three-lens traffic light lying on its side,
 * with the lens for the worst status across every cluster lit.
 */
export default function Beacon({ lit, label }: { lit: Lens; label: string }) {
  return (
    <svg className="ksl-beacon" viewBox="0 0 40 16" role="img" aria-label={label}>
      <rect className="ksl-beacon__housing" x="0.5" y="0.5" width="39" height="15" rx="7.5" />
      {LENSES.map(([name, color], i) => (
        <circle
          key={name}
          className={`ksl-beacon__lens${lit === name ? ' is-lit' : ''}`}
          style={{ '--tone': color } as React.CSSProperties}
          cx={8 + i * 12}
          cy="8"
          r="4.5"
        />
      ))}
      {/* A small highlight on the lit lens, so it reads as glass with a lamp behind it. */}
      {LENSES.map(([name], i) =>
        lit === name ? <circle key={name} className="ksl-beacon__glint" cx={6.6 + i * 12} cy="6.6" r="1.3" /> : null,
      )}
    </svg>
  );
}
