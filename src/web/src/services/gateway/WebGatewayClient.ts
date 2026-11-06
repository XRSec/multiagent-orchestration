/**
 * Purpose: Production-grade browser WebSocket client for Cindy-style Device Gateway.
 * Context: Implements full-duplex Envelope JSON-RPC, exponential backoff, auto-resubscription,
 *          and keep-alive ping/pong matching GatewayServer.ts specifications.
 * Usage: const client = WebGatewayClient.getInstance(); client.connect();
 * Prerequisites: Native browser WebSocket, crypto.randomUUID().
 */

import {
  Envelope,
  LinkOpenPayload,
  LinkAcceptPayload,
  InvokePayload,
  InvokeResultPayload,
  PushPayload,
  StreamFrameEvent,
  ConnectionState,
} from './types';

export interface WebGatewayClientOptions {
  url?: string;
  fallbackUrl?: string;
  authToken?: string;
  clientName?: string;
  invokeTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  maxReconnectIntervalMs?: number;
}

export type ConnectionStateListener = (state: ConnectionState) => void;
export type PushListener = (event: StreamFrameEvent) => void;

export class WebGatewayClient {
  private static instance: WebGatewayClient | null = null;

  private primaryUrl: string;
  private fallbackUrl: string;
  private currentUrl: string;
  private authToken?: string;
  private clientName: string;
  private invokeTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private maxReconnectIntervalMs: number;

  private ws: WebSocket | null = null;
  private state: ConnectionState = 'closed';
  private gatewayInfo: LinkAcceptPayload | null = null;

  private pendingInvokes = new Map<
    string,
    {
      channel: string;
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      timer: number;
    }
  >();

  // topic -> Set of push listeners
  private topicListeners = new Map<string, Set<PushListener>>();
  // Active subscribed topics to re-subscribe upon reconnect
  private activeTopics = new Set<string>();

  private stateListeners = new Set<ConnectionStateListener>();

  // Heartbeat & Reconnect timers
  private heartbeatTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private isManuallyClosed = false;

  public static getInstance(options?: WebGatewayClientOptions): WebGatewayClient {
    if (!WebGatewayClient.instance) {
      WebGatewayClient.instance = new WebGatewayClient(options);
    }
    return WebGatewayClient.instance;
  }

  constructor(options: WebGatewayClientOptions = {}) {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5173';
    const wsProto = isHttps ? 'wss:' : 'ws:';

    this.primaryUrl = options.url || `${wsProto}//${host}/gateway`;
    this.fallbackUrl = options.fallbackUrl || 'ws://127.0.0.1:38080/gateway';
    this.currentUrl = this.primaryUrl;
    this.authToken = options.authToken;
    this.clientName = options.clientName || 'WebBrowserClient';
    this.invokeTimeoutMs = options.invokeTimeoutMs || 30000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 15000;
    this.maxReconnectIntervalMs = options.maxReconnectIntervalMs || 10000;
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public getGatewayInfo(): LinkAcceptPayload | null {
    return this.gatewayInfo;
  }

  public onStateChange(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      for (const listener of this.stateListeners) {
        try {
          listener(newState);
        } catch (e) {
          console.error('[WebGatewayClient] Error in state listener:', e);
        }
      }
    }
  }

  /**
   * Connect and execute Cindy link-open / link-accept handshake
   */
  public connect(): Promise<LinkAcceptPayload> {
    this.isManuallyClosed = false;

    if (this.state === 'open' && this.gatewayInfo) {
      return Promise.resolve(this.gatewayInfo);
    }

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.currentUrl);
      } catch (err) {
        this.handleConnectionFailure(err);
        return reject(err);
      }

      const handshakeId = crypto.randomUUID();
      let handshakeTimeout: number | null = window.setTimeout(() => {
        if (this.ws && this.state !== 'open') {
          console.warn('[WebGatewayClient] Handshake timeout on', this.currentUrl);
          this.ws.close();
        }
      }, 8000);

      this.ws.onopen = () => {
        // Send link-open frame
        const openMsg: Envelope<LinkOpenPayload> = {
          kind: 'link-open',
          id: handshakeId,
          payload: {
            clientName: this.clientName,
            clientType: 'web',
            capabilities: ['invoke', 'push', 'subscribe'],
            token: this.authToken,
          },
          timestamp: Date.now(),
        };
        this.sendRaw(openMsg);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const envelope = JSON.parse(event.data) as Envelope;

          // 1. Check for handshake acceptance
          if (envelope.kind === 'link-accept' && envelope.id === handshakeId) {
            if (handshakeTimeout) {
              window.clearTimeout(handshakeTimeout);
              handshakeTimeout = null;
            }
            this.gatewayInfo = envelope.payload as LinkAcceptPayload;
            this.reconnectAttempts = 0;
            this.setState('open');
            this.startHeartbeat();

            // Re-subscribe to all active topics
            this.resubscribeActiveTopics();

            resolve(this.gatewayInfo);
            return;
          }

          // 2. Normal inbound dispatch
          this.handleInboundEnvelope(envelope);
        } catch (err) {
          console.warn('[WebGatewayClient] Failed to parse inbound envelope:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn(`[WebGatewayClient] WebSocket error on ${this.currentUrl}:`, err);
        if (this.state === 'connecting') {
          // Switch to fallback URL if primary fails on initial attempts
          if (this.currentUrl === this.primaryUrl && this.fallbackUrl) {
            console.info(`[WebGatewayClient] Switching to fallback URL: ${this.fallbackUrl}`);
            this.currentUrl = this.fallbackUrl;
          }
        }
      };

      this.ws.onclose = (event) => {
        if (handshakeTimeout) {
          window.clearTimeout(handshakeTimeout);
          handshakeTimeout = null;
        }
        this.stopHeartbeat();
        this.gatewayInfo = null;

        // Reject pending invokes
        this.flushPendingInvokes(new Error(`WebSocket closed (${event.code}: ${event.reason || 'abnormal'})`));

        if (!this.isManuallyClosed) {
          this.scheduleReconnect();
        } else {
          this.setState('closed');
        }
      };
    });
  }

  /**
   * Invoke a remote whitelisted channel (Cindy Envelope invoke contract)
   */
  public invoke<T = any>(actionOrChannel: string, payload: any = {}, timeoutMs?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.state !== 'open') {
        return reject(new Error(`WebSocket is not connected (state: ${this.state})`));
      }

      const id = crypto.randomUUID();
      const actualTimeout = timeoutMs || this.invokeTimeoutMs;

      const timer = window.setTimeout(() => {
        this.pendingInvokes.delete(id);
        reject(new Error(`Invoke timeout (${actualTimeout}ms) on channel '${actionOrChannel}' (id: ${id})`));
      }, actualTimeout);

      this.pendingInvokes.set(id, {
        channel: actionOrChannel,
        resolve,
        reject,
        timer,
      });

      const envelope: Envelope<InvokePayload> = {
        kind: 'invoke',
        id,
        payload: {
          channel: actionOrChannel,
          args: payload,
        },
        timestamp: Date.now(),
      };

      this.sendRaw(envelope);
    });
  }

  /**
   * Subscribe to a topic and register a listener
   */
  public subscribe(topic: string, listener: PushListener): () => void {
    if (!this.topicListeners.has(topic)) {
      this.topicListeners.set(topic, new Set());
    }
    this.topicListeners.get(topic)!.add(listener);

    // If this is the first listener for this topic, register with server
    if (!this.activeTopics.has(topic)) {
      this.activeTopics.add(topic);
      if (this.state === 'open') {
        this.invoke('gateway:subscribe', { topic }).catch((err) => {
          console.warn(`[WebGatewayClient] Failed to subscribe to topic '${topic}':`, err.message);
        });
      }
    }

    // Return unbind teardown function
    return () => {
      const listeners = this.topicListeners.get(topic);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.topicListeners.delete(topic);
          this.activeTopics.delete(topic);
          if (this.state === 'open') {
            this.invoke('gateway:unsubscribe', { topic }).catch(() => {});
          }
        }
      }
    };
  }

  public disconnect(): void {
    this.isManuallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }
    this.setState('closed');
  }

  private handleInboundEnvelope(envelope: Envelope): void {
    const { kind, id, payload } = envelope;

    if (kind === 'invoke-result') {
      const pending = this.pendingInvokes.get(id);
      if (pending) {
        window.clearTimeout(pending.timer);
        this.pendingInvokes.delete(id);

        const resultPayload = payload as InvokeResultPayload;
        if (resultPayload.error) {
          pending.reject(
            new Error(
              `[GatewayError ${resultPayload.error.code}] ${resultPayload.error.message}`
            )
          );
        } else {
          pending.resolve(resultPayload.result);
        }
      }
      return;
    }

    if (kind === 'push') {
      const pushPayload = payload as PushPayload;
      const streamEvent: StreamFrameEvent = {
        topic: pushPayload.topic,
        event: pushPayload.event,
        data: pushPayload.data,
      };

      // 1. Dispatch to exact topic listeners
      const listeners = this.topicListeners.get(pushPayload.topic);
      if (listeners) {
        for (const listener of listeners) {
          try {
            listener(streamEvent);
          } catch (e) {
            console.error('[WebGatewayClient] Listener error on topic', pushPayload.topic, e);
          }
        }
      }

      // 2. Dispatch to wildcard '*' listeners
      const wildcardListeners = this.topicListeners.get('*');
      if (wildcardListeners) {
        for (const listener of wildcardListeners) {
          try {
            listener(streamEvent);
          } catch (e) {
            console.error('[WebGatewayClient] Wildcard listener error:', e);
          }
        }
      }
      return;
    }

    if (kind === 'pong') {
      // Heartbeat acknowledged
      return;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.state === 'open' && this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingEnv: Envelope = {
          kind: 'ping',
          id: crypto.randomUUID(),
          payload: { timestamp: Date.now() },
          timestamp: Date.now(),
        };
        this.sendRaw(pingEnv);
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isManuallyClosed) return;

    this.setState('reconnecting');
    // Exponential backoff: 1s, 2s, 4s, 8s, 10s max
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectIntervalMs);
    this.reconnectAttempts++;

    console.info(`[WebGatewayClient] Scheduling reconnect in ${delay}ms (attempt #${this.reconnectAttempts})...`);

    this.reconnectTimer = window.setTimeout(() => {
      this.connect().catch(() => {
        // Will be re-scheduled by onclose
      });
    }, delay);
  }

  private resubscribeActiveTopics(): void {
    for (const topic of this.activeTopics) {
      this.invoke('gateway:subscribe', { topic }).catch((err) => {
        console.warn(`[WebGatewayClient] Re-subscription failed for topic '${topic}':`, err.message);
      });
    }
  }

  private handleConnectionFailure(err: any): void {
    this.setState('closed');
    this.flushPendingInvokes(new Error(`Connection failed: ${err?.message || 'Network error'}`));
    this.scheduleReconnect();
  }

  private flushPendingInvokes(error: Error): void {
    for (const [, pending] of this.pendingInvokes.entries()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingInvokes.clear();
  }

  private sendRaw(data: Envelope): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}
