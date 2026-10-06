// Hairline icons drawn to Jewel's spec (24px grid, square caps, currentColor).
// Jewel ships no icon set, so these cover what kubestoplight needs.

const PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M6 9l6 6 6-6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  info: 'M12 11v6M12 7v1M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0',
  terminal: 'M3 4h18v16H3zM7 9l3 3-3 3M12 15h5',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  refresh: 'M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  stop: 'M7 7h10v10H7z',
  play: 'M8 5l11 7-11 7z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  cluster: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
