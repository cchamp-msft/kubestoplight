import { useState, useEffect, useCallback } from 'react';
import type { PodDescribe } from '../types/api';

interface UsePodDescribeResult {
  data: PodDescribe | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePodDescribe(cluster: string, namespace: string, pod: string): UsePodDescribeResult {
  const [data, setData] = useState<PodDescribe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger((n) => n + 1), []);

  useEffect(() => {
    if (!cluster || !namespace || !pod) return;

    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/pods/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}`, {
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || res.statusText);
        }
        return res.json() as Promise<PodDescribe>;
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [cluster, namespace, pod, trigger]);

  return { data, loading, error, refetch };
}
