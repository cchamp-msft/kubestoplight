import { useEffect, useId, useRef, type ReactNode } from 'react';
import Icon from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** center = modal, end = drawer from the right (app extension, see index.scss). */
  placement?: 'center' | 'end';
  /** Extra content in the head, after the title (tags, actions). */
  headExtra?: ReactNode;
  className?: string;
  /** Use Jewel's small uppercase label style for the title. */
  labelTitle?: boolean;
  children: ReactNode;
}

/**
 * Jewel's `.sheet` on a native <dialog>, driven by React state instead of
 * Jewel's sheet.js (which owns open/close itself and would fight React).
 * The dialog gives focus trapping, Esc and the top layer for free.
 */
export default function Sheet({
  open, onClose, title, placement = 'center', headExtra, className, labelTitle = true, children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  // Jewel's scroll lock hook: sheet.js sets this class on <html>.
  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add('has-open-sheet');
    return () => document.documentElement.classList.remove('has-open-sheet');
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sheet sheet--${placement}${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`sheet__panel panel${placement === 'center' ? ' panel--content' : ''}`}>
        <header className="sheet__head">
          <h2 className={`sheet__title${labelTitle ? ' label' : ''}`} id={titleId}>{title}</h2>
          {headExtra}
          <button className="btn btn--ghost btn--icon" type="button" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </dialog>
  );
}
