import { useState, useEffect, useRef, useCallback } from 'react';
import type { NamespaceGroup, WebSocketMessage } from '../types/api';

const WS_RECONNECT_DELAY_MS = 3000;

export interface UseWebSocketResult {
  groups: NamespaceGroup[];
  connected: boolean;
}

/**
 * Connects to the Go WebSocket at /ws/pods and returns live namespace groups.
 * Automatically reconnects on disconnect with a 3-second delay.
 */
export function useWebSocket(): UseWebSocketResult {
  const [groups, setGroups] = useState<NamespaceGroup[]>([]);
  const [connected, setConnected] = useState(false);
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
      reconnectTimer.current = setTimeout(connect, WS_RECONNECT_DELAY_MS);
    };
  }, []);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { groups, connected };
}
