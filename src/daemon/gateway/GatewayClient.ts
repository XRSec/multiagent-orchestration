/**
 * @file src/daemon/gateway/GatewayClient.ts
 * @description Universal Gateway Client for CLI, Web, and Mobile.
 * Connects to Gateway Host via standard WebSocket, handles invoke/push/reconnect.
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  Envelope,
  InvokePayload,
  InvokeResultPayload,
  PushPayload,
  LinkOpenPayload,
  LinkAcceptPayload,
} from './protocol';

export interface GatewayClientOptions {
  url: string; // e.g. "ws://127.0.0.1:38080/gateway"
  token?: string;
  clientName?: string;
  clientType?: 'cli' | 'desktop' | 'mobile' | 'web';
  autoReconnect?: boolean;
}

export class GatewayClient extends EventEmitter {
  private url: URL;
  private token?: string;
  private clientName: string;
  private clientType: 'cli' | 'desktop' | 'mobile' | 'web';
  private autoReconnect: boolean;

  private socket: any = null;
  private isConnected: boolean = false;
  private pendingInvokes = new Map<
    string,
    { resolve: (val: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }
  >();
  private topicListeners = new Map<string, Set<(event: string, data: any) => void>>();

  constructor(options: GatewayClientOptions) {
    super();
    this.url = new URL(options.url.replace(/^http/, 'ws'));
    this.token = options.token;
    this.clientName = options.clientName || 'GatewayCLI';
    this.clientType = options.clientType || 'cli';
    this.autoReconnect = options.autoReconnect ?? false;
  }

  public async connect(): Promise<LinkAcceptPayload> {
    return new Promise((resolve, reject) => {
      const port = parseInt(this.url.port || (this.url.protocol === 'wss:' ? '443' : '80'), 10);
      const isSecure = this.url.protocol === 'wss:';
      const secKey = crypto.randomBytes(16).toString('base64');

      const req = http.request({
        hostname: this.url.hostname,
        port,
        path: this.url.pathname || '/gateway',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': secKey,
        },
      });

      req.on('upgrade', (res, socket, head) => {
        this.socket = socket;
        this.isConnected = true;

        this.setupSocketListeners();

        // Perform link-open handshake
        const handshakeId = crypto.randomUUID();
        const openPayload: LinkOpenPayload = {
          clientName: this.clientName,
          clientType: this.clientType,
          token: this.token,
          capabilities: ['invoke', 'push', 'subscribe'],
        };

        const cleanup = () => {
          this.off('envelope', onHandshakeMsg);
          this.socket?.off('close', onSocketClose);
          this.socket?.off('error', onSocketError);
        };

        const onHandshakeMsg = (envelope: Envelope) => {
          if (envelope.kind === 'link-accept' && envelope.id === handshakeId) {
            cleanup();
            resolve(envelope.payload as LinkAcceptPayload);
          }
        };

        const onSocketClose = () => {
          cleanup();
          reject(new Error('Socket closed before link-accept handshake completed'));
        };

        const onSocketError = (err: any) => {
          cleanup();
          reject(err);
        };

        this.on('envelope', onHandshakeMsg);
        this.socket.once('close', onSocketClose);
        this.socket.once('error', onSocketError);

        this.sendEnvelope({
          kind: 'link-open',
          id: handshakeId,
          payload: openPayload,
          timestamp: Date.now(),
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  private bufferAccumulator = Buffer.alloc(0);

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('data', (buffer: Buffer) => {
      this.bufferAccumulator = Buffer.concat([this.bufferAccumulator, buffer]);
      const texts = this.decodeWsFrames();
      for (const text of texts) {
        try {
          const envelope = JSON.parse(text) as Envelope;
          this.handleInboundEnvelope(envelope);
        } catch {
          // ignore corrupted frame
        }
      }
    });

    this.socket.on('close', () => {
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.socket.on('error', (err: any) => {
      this.emit('error', err);
    });
  }

  private handleInboundEnvelope(envelope: Envelope): void {
    this.emit('envelope', envelope);

    if (envelope.kind === 'invoke-result') {
      const pending = this.pendingInvokes.get(envelope.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingInvokes.delete(envelope.id);
        const resPayload = envelope.payload as InvokeResultPayload;
        if (resPayload.error) {
          const err = new Error(resPayload.error.message);
          (err as any).code = resPayload.error.code;
          (err as any).data = resPayload.error.data;
          pending.reject(err);
        } else {
          pending.resolve(resPayload.result);
        }
      }
      return;
    }

    if (envelope.kind === 'push') {
      const push = envelope.payload as PushPayload;
      const listeners = this.topicListeners.get(push.topic);
      if (listeners) {
        for (const fn of listeners) {
          fn(push.event, push.data);
        }
      }
      const wildcardListeners = this.topicListeners.get('*');
      if (wildcardListeners) {
        for (const fn of wildcardListeners) {
          fn(push.event, push.data);
        }
      }
    }
  }

  public async invoke<TArgs = any, TResult = any>(
    channel: string,
    args: TArgs,
    timeoutMs: number = 30000
  ): Promise<TResult> {
    if (!this.isConnected || !this.socket) {
      throw new Error('GatewayClient is not connected to gateway host.');
    }

    const requestId = crypto.randomUUID();

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingInvokes.delete(requestId);
        reject(new Error(`Invoke '${channel}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingInvokes.set(requestId, { resolve, reject, timer });

      const payload: InvokePayload<TArgs> = {
        channel,
        args,
      };

      this.sendEnvelope({
        kind: 'invoke',
        id: requestId,
        payload,
        timestamp: Date.now(),
      });
    });
  }

  public async subscribe(
    topic: string,
    onData: (event: string, data: any) => void
  ): Promise<void> {
    if (!this.topicListeners.has(topic)) {
      this.topicListeners.set(topic, new Set());
    }
    this.topicListeners.get(topic)!.add(onData);

    // Send subscribe invoke to gateway
    await this.invoke('gateway:subscribe', { topic });
  }

  public async unsubscribe(topic: string): Promise<void> {
    this.topicListeners.delete(topic);
    await this.invoke('gateway:unsubscribe', { topic });
  }

  public async ping(): Promise<{ pong: boolean; latencyMs: number }> {
    const start = Date.now();
    await this.invoke('system:ping', {});
    return { pong: true, latencyMs: Date.now() - start };
  }

  private sendEnvelope(envelope: Envelope): void {
    if (!this.socket || !this.socket.writable) return;
    const jsonStr = JSON.stringify(envelope);
    const frame = this.encodeWsClientTextFrame(jsonStr);
    this.socket.write(frame);
  }

  private encodeWsClientTextFrame(text: string): Buffer {
    const payload = Buffer.from(text, 'utf-8');
    const length = payload.length;
    const maskKey = crypto.randomBytes(4);

    let headerLength = 6;
    let lengthBytes = 0;

    if (length >= 126 && length <= 0xffff) {
      headerLength = 8;
      lengthBytes = 126;
    } else if (length > 0xffff) {
      headerLength = 14;
      lengthBytes = 127;
    }

    const frame = Buffer.alloc(headerLength + length);
    frame[0] = 0x81; // Fin, Text

    let offset = 2;
    if (lengthBytes === 0) {
      frame[1] = 0x80 | length;
    } else if (lengthBytes === 126) {
      frame[1] = 0x80 | 126;
      frame.writeUInt16BE(length, 2);
      offset = 4;
    } else {
      frame[1] = 0x80 | 127;
      frame.writeBigUInt64BE(BigInt(length), 2);
      offset = 10;
    }

    maskKey.copy(frame, offset);
    offset += 4;

    for (let i = 0; i < length; i++) {
      frame[offset + i] = payload[i] ^ maskKey[i % 4];
    }

    return frame;
  }

  private decodeWsFrames(): string[] {
    const results: string[] = [];
    let offset = 0;

    while (offset + 2 <= this.bufferAccumulator.length) {
      const secondByte = this.bufferAccumulator[offset + 1];
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7f;
      let headerSize = 2;

      if (payloadLength === 126) {
        if (offset + 4 > this.bufferAccumulator.length) break;
        payloadLength = this.bufferAccumulator.readUInt16BE(offset + 2);
        headerSize = 4;
      } else if (payloadLength === 127) {
        if (offset + 10 > this.bufferAccumulator.length) break;
        payloadLength = Number(this.bufferAccumulator.readBigUInt64BE(offset + 2));
        headerSize = 10;
      }

      const maskSize = isMasked ? 4 : 0;
      const totalFrameSize = headerSize + maskSize + payloadLength;
      if (offset + totalFrameSize > this.bufferAccumulator.length) {
        break; // Wait for full frame
      }

      let maskingKey: Buffer | null = null;
      if (isMasked) {
        maskingKey = this.bufferAccumulator.subarray(offset + headerSize, offset + headerSize + 4);
      }

      const payload = Buffer.from(
        this.bufferAccumulator.subarray(offset + headerSize + maskSize, offset + totalFrameSize)
      );

      if (isMasked && maskingKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskingKey[i % 4];
        }
      }

      results.push(payload.toString('utf-8'));
      offset += totalFrameSize;
    }

    if (offset > 0) {
      this.bufferAccumulator = this.bufferAccumulator.subarray(offset);
    }

    return results;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnected = false;
  }

  public get connected(): boolean {
    return this.isConnected;
  }
}
