import { useEffect, useState } from 'react';
import type { ServerInfo } from '../types/api';

/** Fetches /api/info once. Older servers without the route count as writable. */
export function useServerInfo(): Pick<ServerInfo, 'readOnly'> {
  const [info, setInfo] = useState<Pick<ServerInfo, 'readOnly'>>({ readOnly: false });
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
