import { useState, useEffect, useCallback } from 'react';
import type { Cluster } from '../types/api';

export interface UseClustersResult {
  clusters: Cluster[];
  loading: boolean;
  error: string | null;
  addCluster: (c: Cluster) => Promise<void>;
  updateCluster: (name: string, c: Cluster) => Promise<void>;
  removeCluster: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Fetches and manages the cluster list via the REST API at /api/clusters.
 */
export function useClusters(): UseClustersResult {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/clusters');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: Cluster[] = await res.json();
      setClusters(data ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addCluster = useCallback(async (c: Cluster) => {
    const res = await fetch('/api/clusters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    await refresh();
  }, [refresh]);

  const updateCluster = useCallback(async (name: string, c: Cluster) => {
    const res = await fetch(`/api/clusters/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    await refresh();
  }, [refresh]);

  const removeCluster = useCallback(async (name: string) => {
    const res = await fetch(`/api/clusters/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    await refresh();
  }, [refresh]);

  return { clusters, loading, error, addCluster, updateCluster, removeCluster, refresh };
}
