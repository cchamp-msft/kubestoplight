import Icon from './ui/Icon';

/** "3 hot": pods busy on CPU. Load, so the gauge is violet, not a status dot. */
export default function HotTag({ count }: { count: number }) {
  return (
    <span className="tag ksl-hot-tag">
      <Icon name="hot" size="xs" />
      {count} hot
    </span>
  );
}
