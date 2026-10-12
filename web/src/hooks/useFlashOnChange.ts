import { useState } from 'react';

/**
 * True from the render where `value` changes until `done()` is called
 * (wire it to onAnimationEnd). Never true on first render, so only live
 * changes flash, not the initial load.
 */
export function useFlashOnChange<T>(value: T): [flashing: boolean, done: () => void] {
  const [seen, setSeen] = useState(value);
  const [flashing, setFlashing] = useState(false);
  if (seen !== value) {
    setSeen(value);
    setFlashing(true);
  }
  return [flashing, () => setFlashing(false)];
}

/** Counts up each time `value` rises; use it as a `key` to replay a CSS animation. */
export function useBumpOnRise(value: number): number {
  const [prev, setPrev] = useState(value);
  const [bumps, setBumps] = useState(0);
  if (value !== prev) {
    setPrev(value);
    if (value > prev) setBumps(bumps + 1);
  }
  return bumps;
}
