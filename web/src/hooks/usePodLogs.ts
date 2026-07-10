import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_LINES = 10_000;

interface UsePodLogsOptions {
  tail?: number;
  follow?: boolean;
  enabled?: boolean;
}

interface UsePodLogsResult {
  lines: string[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  clear: () => void;
  stop: () => void;
}

export function usePodLogs(
  cluster: string,
  namespace: string,
  pod: string,
  container: string,
  options: UsePodLogsOptions = {},
): UsePodLogsResult {
  const { tail = 500, follow = true, enabled = true } = options;
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => setLines([]), []);

  const stop = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!cluster || !namespace || !pod || !enabled) return;

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    setError(null);
    setLines([]);

    const params = new URLSearchParams({
      tail: String(tail),
      follow: String(follow),
    });
    if (container) params.set('container', container);

    const url = `/api/pods/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}/logs?${params}`;

    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          try {
            const body = JSON.parse(text);
            throw new Error(body.error || res.statusText);
          } catch {
            throw new Error(text || res.statusText);
          }
        }

        setLoading(false);
        setConnected(true);

        const reader = res.body?.getReader();
        if (!reader) throw new Error('ReadableStream not supported');

        const decoder = new TextDecoder();
        let partial = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          partial += decoder.decode(value, { stream: true });
          const parts = partial.split('\n');
          partial = parts.pop() ?? '';

          if (parts.length > 0) {
            setLines((prev) => {
              const next = [...prev, ...parts.filter(Boolean)];
              return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
            });
          }
        }

        if (partial) {
          setLines((prev) => {
            const next = [...prev, partial];
            return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
          });
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setLoading(false);
        }
      })
      .finally(() => setConnected(false));

    return () => {
      ctrl.abort();
      ctrlRef.current = null;
    };
  }, [cluster, namespace, pod, container, tail, follow, enabled]);

  return { lines, loading, error, connected, clear, stop };
}
