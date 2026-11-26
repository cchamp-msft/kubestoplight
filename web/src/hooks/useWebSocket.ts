import { useState, useEffect, useRef, useCallback } from 'react';
import type { NamespaceGroup, WebSocketMessage } from '../types/api';
import { WS_AUTH_PROTOCOL, checkSession, sessionToken } from './useAuth';

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
    // A browser can't set headers on a WebSocket, so the session token rides
    // in the subprotocol list.
    const token = sessionToken();
    const ws = token ? new WebSocket(url, [WS_AUTH_PROTOCOL, token]) : new WebSocket(url);
    wsRef.current = ws;
    let opened = false;

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return; }
      opened = true;
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
      // Refused before it opened: the token may have been revoked. If so this locks the app.
      if (!opened) checkSession();
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
