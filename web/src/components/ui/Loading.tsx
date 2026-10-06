// Jewel has no spinner component; an indeterminate .progress is its busy state.
export default function Loading({ label }: { label: string }) {
  return (
    <div className="progress ksl-loading" role="status">
      <div className="progress__meta">
        <span className="progress__label">{label}</span>
      </div>
      <progress className="progress__bar" max={100} aria-label={label} />
    </div>
  );
}
