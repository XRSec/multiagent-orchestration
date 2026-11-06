/**
 * Purpose: React Hook for Cindy-style Device Gateway WebSocket communication.
 * Context: Exposes connection status, request-response invoke, and streaming topic subscription.
 * Usage:
 *   const { isConnected, connectionState, invoke, subscribe } = useGatewaySocket();
 *   useEffect(() => {
 *     return subscribe(`session:${roomId}`, (evt) => handleStream(evt));
 *   }, [roomId, subscribe]);
 * Prerequisites: React 18/19, WebGatewayClient singleton.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { WebGatewayClient } from '@/services/gateway/WebGatewayClient';
import type {
  ConnectionState,
  StreamFrameEvent,
  LinkAcceptPayload,
} from '@/services/gateway/types';

export interface UseGatewaySocketResult {
  isConnected: boolean;
  connectionState: ConnectionState;
  gatewayInfo: LinkAcceptPayload | null;
  error: Error | null;
  invoke: <T = any>(action: string, payload?: any, timeoutMs?: number) => Promise<T>;
  subscribe: (topic: string, listener: (event: StreamFrameEvent) => void) => () => void;
  reconnect: () => Promise<LinkAcceptPayload>;
  disconnect: () => void;
}

export function useGatewaySocket(): UseGatewaySocketResult {
  const clientRef = useRef<WebGatewayClient>(WebGatewayClient.getInstance());
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    clientRef.current.getState()
  );
  const [gatewayInfo, setGatewayInfo] = useState<LinkAcceptPayload | null>(
    clientRef.current.getGatewayInfo()
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const client = clientRef.current;

    // Listen to connection state updates
    const unbindState = client.onStateChange((state) => {
      setConnectionState(state);
      setGatewayInfo(client.getGatewayInfo());
      if (state === 'open') {
        setError(null);
      }
    });

    // Ensure connection is initiated if currently closed
    if (client.getState() === 'closed') {
      client.connect().catch((err) => {
        setError(err);
      });
    }

    return () => {
      unbindState();
    };
  }, []);

  const invoke = useCallback(
    <T = any>(action: string, payload: any = {}, timeoutMs?: number): Promise<T> => {
      return clientRef.current.invoke<T>(action, payload, timeoutMs);
    },
    []
  );

  const subscribe = useCallback(
    (topic: string, listener: (event: StreamFrameEvent) => void): (() => void) => {
      return clientRef.current.subscribe(topic, listener);
    },
    []
  );

  const reconnect = useCallback(async (): Promise<LinkAcceptPayload> => {
    setError(null);
    return clientRef.current.connect();
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current.disconnect();
  }, []);

  return {
    isConnected: connectionState === 'open',
    connectionState,
    gatewayInfo,
    error,
    invoke,
    subscribe,
    reconnect,
    disconnect,
  };
}
