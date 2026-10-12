import { useEffect } from 'react';
import type { Lens } from '../constants/status';

const TITLE = 'kubestoplight';

/**
 * Puts the overall status in the browser tab: "(5) kubestoplight" while pods
 * are failing, and a favicon whose lit lens matches the header's Beacon.
 * Colors come from the live --status-* tokens, so the favicon follows the
 * theme. With no data yet the static favicon.svg stays.
 */
export function useTabStatus(lit: Lens, failed: number) {
  useEffect(() => {
    document.title = failed > 0 ? `(${failed}) ${TITLE}` : TITLE;
  }, [failed]);

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link || !lit) return;
    const original = link.href;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const lenses = [
      ['stop', token('--status-failed')],
      ['caution', token('--status-changing')],
      ['go', token('--status-idle')],
    ].map(([name, color], i) =>
      `<circle cx="32" cy="${18.5 + i * 13.5}" r="6" fill="${color}" fill-opacity="${name === lit ? 1 : 0.22}"/>`,
    );
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<rect x="19" y="5" width="26" height="54" rx="13" fill="${token('--surface-solid')}"/>` +
      lenses.join('') +
      `</svg>`;
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    return () => { link.href = original; };
  }, [lit]);
}
