import { useEffect, useState } from 'react';

export interface ServerInfo {
  /** Cluster add/edit/remove is disabled (kubestoplight --web --read-only). */
  readOnly: boolean;
}

/** Fetches /api/info once. Older servers without the route count as writable. */
export function useServerInfo(): ServerInfo {
  const [info, setInfo] = useState<ServerInfo>({ readOnly: false });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/info')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (!cancelled && body) setInfo({ readOnly: !!body.readOnly }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return info;
}
