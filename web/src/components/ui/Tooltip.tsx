import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from 'react';

interface Props {
  /** A few words. It's a hint: the trigger still needs its own aria-label. */
  label: string;
  /** One focusable element (usually an icon button). */
  children: ReactElement<{ 'aria-describedby'?: string }>;
}

const DELAY = 300; // ms before showing on hover, so passing over doesn't flash it

/**
 * Jewel's `.tooltip` driven by React instead of tooltip.js: shown after a
 * short hover or on keyboard focus, in the top layer (popover) so no panel
 * clips it, below the trigger or above when there's no room. Esc, click and
 * blur hide it; touch never shows it.
 */
export default function Tooltip({ label, children }: Props) {
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);
  const [open, setOpen] = useState(false);

  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  const hideSoon = () => { clearTimeout(timer.current); timer.current = window.setTimeout(hide, 100); };

  useEffect(() => () => clearTimeout(timer.current), []);

  // Place it like Jewel.float(…, { align: 'center' }).
  useEffect(() => {
    const b = bubble.current;
    const trigger = wrap.current?.firstElementChild;
    if (!b || !trigger) return;
    if (!open) {
      if (b.matches(':popover-open')) b.hidePopover();
      return;
    }
    if (typeof b.showPopover === 'function') {
      b.classList.add('is-floating');
      if (!b.matches(':popover-open')) b.showPopover();
    }
    const gap = 4, edge = 8;
    const a = trigger.getBoundingClientRect();
    const r = b.getBoundingClientRect();
    const below = a.bottom + gap + r.height <= innerHeight || innerHeight - a.bottom >= a.top;
    const y = Math.max(edge, Math.min(below ? a.bottom + gap : a.top - gap - r.height, innerHeight - r.height - edge));
    const x = Math.max(edge, Math.min(a.left + (a.width - r.width) / 2, innerWidth - r.width - edge));
    b.style.top = `${Math.round(y)}px`;
    b.style.left = `${Math.round(x)}px`;
    b.dataset.side = below ? 'bottom' : 'top';
    b.style.setProperty('--tooltip-arrow-x', `${Math.round(a.left + a.width / 2 - x)}px`);

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <span
      ref={wrap}
      className="tooltip"
      onPointerEnter={(e) => {
        if (e.pointerType === 'touch') return;
        clearTimeout(timer.current);
        timer.current = window.setTimeout(show, DELAY);
      }}
      onPointerLeave={hideSoon}
      onFocus={(e) => { if ((e.target as Element).matches(':focus-visible')) show(); }}
      onBlur={hide}
      onClick={hide}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        ref={bubble}
        className="tooltip__bubble"
        role="tooltip"
        id={id}
        popover="manual"
        hidden={!open}
        onPointerEnter={() => clearTimeout(timer.current)}
        onPointerLeave={hideSoon}
      >
        {label}
      </span>
    </span>
  );
}
