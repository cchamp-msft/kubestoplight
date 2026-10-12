// Jewel's `.loading`: a hairline spinner with a line of text.
export default function Loading({ label }: { label: string }) {
  return (
    <div className="ksl-loading" role="status">
      <span className="loading">
        <span className="spinner" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
