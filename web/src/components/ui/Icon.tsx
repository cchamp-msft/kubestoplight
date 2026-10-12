// Jewel's hairline icons: Lucide, from the vendored sprite, drawn by `.icon`
// (stroke, caps and size come from Jewel's icon.css). Names here are the
// app's; the values are the sprite's symbol ids.
import sprite from '../../vendor/jewel/media/icons.svg?no-inline';

const SYMBOLS = {
  close: 'x',
  plus: 'plus',
  chevron: 'chevron-down',
  arrowUp: 'arrow-up',
  arrowDown: 'arrow-down',
  info: 'info',
  terminal: 'terminal',
  copy: 'copy',
  refresh: 'refresh-cw',
  trash: 'trash-2',
  pause: 'pause',
  play: 'play',
  edit: 'pencil',
  show: 'eye',
  hide: 'eye-off',
  cluster: 'boxes',
  hot: 'gauge',
} as const;

export type IconName = keyof typeof SYMBOLS;

interface Props {
  name: IconName;
  /** Jewel's sizes: xs 14, sm 16 (default, in buttons), md 22, lg 28. */
  size?: 'xs' | 'md' | 'lg';
  className?: string;
}

export default function Icon({ name, size, className }: Props) {
  const cls = ['icon', size && `icon--${size}`, className].filter(Boolean).join(' ');
  return (
    <svg className={cls} aria-hidden="true" focusable="false">
      <use href={`${sprite}#${SYMBOLS[name]}`} />
    </svg>
  );
}
