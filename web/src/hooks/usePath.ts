import { useCallback, useEffect, useState, type MouseEvent } from 'react';

// Two pages do not need a router. This reads the path, follows back/forward,
// and lets a plain <a href> change page without reloading.

const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/';

export function usePath() {
  const [path, setPath] = useState(() => clean(window.location.pathname));

  useEffect(() => {
    const onPop = () => setPath(clean(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** onClick for an <a href>: same-tab plain clicks navigate in place. */
  const follow = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const url = new URL(e.currentTarget.href);
    // Keep the query (?bg=, ?motion=, ?picker=) so the chosen look survives.
    const next = url.pathname + window.location.search;
    if (clean(url.pathname) !== clean(window.location.pathname)) {
      window.history.pushState(null, '', next);
    }
    setPath(clean(url.pathname));
  }, []);

  return { path, follow };
}
