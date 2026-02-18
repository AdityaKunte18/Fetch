import { useRef, useState, useEffect, useCallback } from 'react';
import type { ConnectionStatus, InboundMessage } from '../types';

const WS_URL = 'ws://localhost:3001/ws';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

interface UseWebSocketOptions {
  onMessage?: (message: InboundMessage) => void;
}

interface UseWebSocketReturn {
  connectionStatus: ConnectionStatus;
  sendMessage: (data: string) => void;
}

export function useWebSocket(options?: UseWebSocketOptions): UseWebSocketReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onMessageRef = useRef(options?.onMessage);

  useEffect(() => {
    onMessageRef.current = options?.onMessage;
  });

  useEffect(() => {
    const connect = () => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      setConnectionStatus('connecting');
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        let parsed: InboundMessage;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          parsed = { type: 'echo', data: String(event.data) };
        }
        onMessageRef.current?.(parsed);
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        wsRef.current = null;
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectTimer.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        // onclose will fire after this
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  const sendMessage = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  return { connectionStatus, sendMessage };
}
