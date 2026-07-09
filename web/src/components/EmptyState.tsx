interface Props {
  title: string;
  message: string;
}

export default function EmptyState({ title, message }: Props) {
  return (
    <div className="ksl-empty">
      <svg
        width="64"
        height="64"
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        className="ksl-empty__icon"
      >
        <rect x="4" y="4" width="24" height="24" rx="0" />
        <line x1="4" y1="12" x2="28" y2="12" />
        <line x1="12" y1="12" x2="12" y2="28" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="20" cy="20" r="3" />
      </svg>
      <div className="ksl-empty__title">{title}</div>
      <div className="ksl-empty__message">{message}</div>
    </div>
  );
}
