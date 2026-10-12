import { useState, useEffect, useRef, useCallback } from 'react';
import type { NamespaceGroup, WebSocketMessage } from '../types/api';

const WS_RECONNECT_DELAY_MS = 3000;
const STALE_MIN_MS = 15000;

export interface UseWebSocketResult {
  groups: NamespaceGroup[];
  connected: boolean;
  /** Counts snapshots received; changes once per heartbeat. */
  beat: number;
  /** Connected, but no snapshot for 3 polling intervals (at least 15 s). */
  stale: boolean;
}

/**
 * Connects to the Go WebSocket at /ws/pods and returns live namespace groups.
 * Automatically reconnects on disconnect with a 3-second delay.
 */
export function useWebSocket(): UseWebSocketResult {
  const [groups, setGroups] = useState<NamespaceGroup[]>([]);
  const [connected, setConnected] = useState(false);
  const [beat, setBeat] = useState(0);
  const [stale, setStale] = useState(false);
  const lastAt = useRef(0);
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/pods`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return; }
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data);
        if (msg.type === 'snapshot') {
          setGroups(msg.groups ?? []);
          setBeat((b) => b + 1);
          setStale(false);
          // The server's polling interval isn't sent, so learn it from the gaps.
          const now = Date.now();
          const gap = lastAt.current ? now - lastAt.current : 0;
          lastAt.current = now;
          if (staleTimer.current) clearTimeout(staleTimer.current);
          staleTimer.current = setTimeout(() => setStale(true), Math.max(STALE_MIN_MS, gap * 3));
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setConnected(false);
      lastAt.current = 0;
      if (staleTimer.current) clearTimeout(staleTimer.current);
      reconnectTimer.current = setTimeout(connect, WS_RECONNECT_DELAY_MS);
    };
  }, []);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (staleTimer.current) clearTimeout(staleTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { groups, connected, beat, stale: connected && stale };
}
