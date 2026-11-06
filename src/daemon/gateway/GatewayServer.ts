/**
 * @file src/daemon/gateway/GatewayServer.ts
 * @description Cindy-style Device Gateway Host Server.
 * Exposes a single WebSocket endpoint (/gateway) and /health probe.
 * Handles remote invokes, subscription topics, and push streams.
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
  PROTOCOL_VERSION,
} from './protocol';
import { isChannelAllowed, computeAllowlistHash } from './allowlist';
import { BackpressureGuard } from '../transport/BackpressureGuard';
import { DaemonRpcError, DaemonErrorCode } from '../protocol/errors';

export type InvokeHandler<TArgs = any, TResult = any> = (
  args: TArgs,
  clientId: string
) => Promise<TResult> | TResult;

export interface GatewayServerOptions {
  host: string;
  port: number;
  authToken?: string;
  gatewayId?: string;
  backpressure: BackpressureGuard;
}

export class GatewayServer extends EventEmitter {
  private host: string;
  private port: number;
  private authToken?: string;
  private gatewayId: string;
  private server: http.Server | null = null;
  private backpressure: BackpressureGuard;
  private handlers = new Map<string, InvokeHandler>();

  // Client connection tracking: clientId -> socket
  private clients = new Map<string, any>();
  private clientBuffers = new Map<string, Buffer>();
  // Topic subscriptions: topic -> Set<clientId>
  private subscriptions = new Map<string, Set<string>>();

  constructor(options: GatewayServerOptions) {
    super();
    this.host = options.host;
    this.port = options.port;
    this.authToken = options.authToken;
    this.gatewayId = options.gatewayId || `gw_${crypto.randomUUID().slice(0, 8)}`;
    this.backpressure = options.backpressure;
  }

  public registerHandler<TArgs = any, TResult = any>(
    channel: string,
    handler: InvokeHandler<TArgs, TResult>
  ): void {
    if (!isChannelAllowed(channel)) {
      throw new Error(`Cannot register handler for non-allowlisted channel: '${channel}'`);
    }
    this.handlers.set(channel, handler);
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHttp(req, res);
      });

      this.server.on('upgrade', (req, socket, head) => {
        this.handleWsUpgrade(req, socket, head);
      });

      this.server.on('error', reject);

      this.server.listen(this.port, this.host, () => {
        const address = this.server?.address();
        const actualPort = typeof address === 'object' && address ? address.port : this.port;
        this.port = actualPort;
        resolve(actualPort);
      });
    });
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          gatewayId: this.gatewayId,
          activeClients: this.clients.size,
          timestamp: Date.now(),
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found. Use WebSocket /gateway to connect.' }));
  }

  private handleWsUpgrade(req: http.IncomingMessage, socket: any, head: Buffer): void {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const digest = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${digest}`,
      '\r\n',
    ];

    socket.write(headers.join('\r\n'));

    const clientId = `client_${crypto.randomUUID().slice(0, 8)}`;
    this.clients.set(clientId, socket);
    this.clientBuffers.set(clientId, Buffer.alloc(0));
    this.backpressure.registerConnection(clientId);

    socket.on('data', async (buffer: Buffer) => {
      this.backpressure.touchConnection(clientId);
      const prev = this.clientBuffers.get(clientId) || Buffer.alloc(0);
      const combined = Buffer.concat([prev, buffer]);
      const { frames, remaining } = this.decodeWsFrames(combined);
      this.clientBuffers.set(clientId, remaining);

      for (const text of frames) {
        try {
          const envelope = JSON.parse(text) as Envelope;
          await this.processEnvelope(envelope, socket, clientId);
        } catch (err: any) {
          // ignore corrupted frame
        }
      }
    });

    socket.on('close', () => {
      this.clientBuffers.delete(clientId);
      this.removeClient(clientId);
    });

    socket.on('error', () => {
      this.clientBuffers.delete(clientId);
      this.removeClient(clientId);
    });
  }

  private removeClient(clientId: string): void {
    this.clients.delete(clientId);
    this.backpressure.unregisterConnection(clientId);
    for (const subs of this.subscriptions.values()) {
      subs.delete(clientId);
    }
    this.emit('client.disconnected', clientId);
  }

  private async processEnvelope(envelope: Envelope, socket: any, clientId: string): Promise<void> {
    const { kind, id, payload } = envelope;

    if (kind === 'ping') {
      this.sendEnvelope(socket, clientId, {
        kind: 'pong',
        id,
        dst: clientId,
        src: this.gatewayId,
        payload: { timestamp: Date.now() },
        timestamp: Date.now(),
      });
      return;
    }

    if (kind === 'link-open') {
      const openPayload = payload as LinkOpenPayload;
      if (this.authToken && openPayload.token !== this.authToken) {
        socket.destroy();
        return;
      }

      const acceptPayload: LinkAcceptPayload = {
        gatewayId: this.gatewayId,
        gatewayVersion: `v${PROTOCOL_VERSION}.0`,
        allowlistHash: computeAllowlistHash(),
        capabilities: ['single-speaker', 'shared-blackboard', 'push-streaming', 'delta-slicing'],
      };

      this.sendEnvelope(socket, clientId, {
        kind: 'link-accept',
        id,
        dst: clientId,
        src: this.gatewayId,
        payload: acceptPayload,
        timestamp: Date.now(),
      });
      return;
    }

    if (kind === 'invoke') {
      const { channel, args } = payload as InvokePayload;

      // Handle subscription internally (gateway:subscribe and room:subscribe alias)
      if (channel === 'gateway:subscribe' || channel === 'room:subscribe') {
        const topic = args?.topic || (args?.roomId ? `session:${args.roomId}` : undefined);
        if (topic) {
          if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, new Set());
          }
          this.subscriptions.get(topic)!.add(clientId);
        }
        this.sendInvokeResult(socket, clientId, id, channel, { subscribed: true, topic });
        return;
      }

      if (channel === 'gateway:unsubscribe' || channel === 'room:unsubscribe') {
        const topic = args?.topic || (args?.roomId ? `session:${args.roomId}` : undefined);
        if (topic && this.subscriptions.has(topic)) {
          this.subscriptions.get(topic)!.delete(clientId);
        }
        this.sendInvokeResult(socket, clientId, id, channel, { unsubscribed: true, topic });
        return;
      }

      // Check Allowlist
      if (!isChannelAllowed(channel)) {
        this.sendInvokeError(
          socket,
          clientId,
          id,
          channel,
          DaemonErrorCode.INVALID_REQUEST,
          `Channel '${channel}' is not allowed by gateway security allowlist.`
        );
        return;
      }

      const handler = this.handlers.get(channel);
      if (!handler) {
        this.sendInvokeError(
          socket,
          clientId,
          id,
          channel,
          DaemonErrorCode.METHOD_NOT_FOUND,
          `Channel '${channel}' handler is not implemented on gateway.`
        );
        return;
      }

      try {
        const result = await handler(args, clientId);
        this.sendInvokeResult(socket, clientId, id, channel, result);
      } catch (err: any) {
        const code = err instanceof DaemonRpcError ? err.code : DaemonErrorCode.INTERNAL_ERROR;
        this.sendInvokeError(socket, clientId, id, channel, code, err.message, err.data);
      }
    }
  }

  public sendInvokeResult(
    socket: any,
    clientId: string,
    requestId: string,
    channel: string,
    result: any
  ): void {
    const payload: InvokeResultPayload = {
      channel,
      result,
    };
    this.sendEnvelope(socket, clientId, {
      kind: 'invoke-result',
      id: requestId,
      dst: clientId,
      src: this.gatewayId,
      payload,
      timestamp: Date.now(),
    });
  }

  public sendInvokeError(
    socket: any,
    clientId: string,
    requestId: string,
    channel: string,
    code: number,
    message: string,
    data?: any
  ): void {
    const payload: InvokeResultPayload = {
      channel,
      error: { code, message, data },
    };
    this.sendEnvelope(socket, clientId, {
      kind: 'invoke-result',
      id: requestId,
      dst: clientId,
      src: this.gatewayId,
      payload,
      timestamp: Date.now(),
    });
  }

  /**
   * Push real-time event to clients subscribed to the topic.
   */
  public push(topic: string, event: string, data: any): void {
    const subscribers = this.subscriptions.get(topic);
    if (!subscribers || subscribers.size === 0) {
      // Also broadcast to wildcard '*' subscribers if any
      const wildcardSubs = this.subscriptions.get('*');
      if (!wildcardSubs || wildcardSubs.size === 0) return;
    }

    const payload: PushPayload = { topic, event, data };
    const envelope: Envelope<PushPayload> = {
      kind: 'push',
      id: crypto.randomUUID(),
      src: this.gatewayId,
      payload,
      timestamp: Date.now(),
    };

    const targetClientIds = new Set<string>([
      ...(this.subscriptions.get(topic) || []),
      ...(this.subscriptions.get('*') || []),
    ]);

    for (const clientId of targetClientIds) {
      const socket = this.clients.get(clientId);
      if (socket) {
        try {
          this.sendEnvelope(socket, clientId, envelope);
        } catch {
          // safe skip
        }
      }
    }
  }

  private sendEnvelope(socket: any, clientId: string, envelope: Envelope): void {
    if (!socket || !socket.writable) return;
    this.backpressure.assertOutboundCapacity(socket.writableLength || 0, clientId);
    const jsonStr = JSON.stringify(envelope);
    const frame = this.encodeWsTextFrame(jsonStr);
    socket.write(frame);
  }

  private decodeWsFrames(buffer: Buffer): { frames: string[]; remaining: Buffer } {
    const frames: string[] = [];
    let offset = 0;

    while (offset + 2 <= buffer.length) {
      const secondByte = buffer[offset + 1];
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7f;
      let headerSize = 2;

      if (payloadLength === 126) {
        if (offset + 4 > buffer.length) break;
        payloadLength = buffer.readUInt16BE(offset + 2);
        headerSize = 4;
      } else if (payloadLength === 127) {
        if (offset + 10 > buffer.length) break;
        payloadLength = Number(buffer.readBigUInt64BE(offset + 2));
        headerSize = 10;
      }

      const maskSize = isMasked ? 4 : 0;
      const totalFrameSize = headerSize + maskSize + payloadLength;
      if (offset + totalFrameSize > buffer.length) {
        break; // Wait for full frame
      }

      let maskingKey: Buffer | null = null;
      if (isMasked) {
        maskingKey = buffer.subarray(offset + headerSize, offset + headerSize + 4);
      }

      const payload = Buffer.from(
        buffer.subarray(offset + headerSize + maskSize, offset + totalFrameSize)
      );

      if (isMasked && maskingKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskingKey[i % 4];
        }
      }

      frames.push(payload.toString('utf-8'));
      offset += totalFrameSize;
    }

    return {
      frames,
      remaining: buffer.subarray(offset),
    };
  }

  private encodeWsTextFrame(text: string): Buffer {
    const payload = Buffer.from(text, 'utf-8');
    const length = payload.length;

    let header: Buffer;
    if (length < 126) {
      header = Buffer.from([0x81, length]);
    } else if (length <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    return Buffer.concat([header, payload]);
  }

  public async stop(): Promise<void> {
    for (const socket of this.clients.values()) {
      socket.destroy();
    }
    this.clients.clear();
    this.subscriptions.clear();

    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  public getPort(): number {
    return this.port;
  }

  public getActiveClientsCount(): number {
    return this.clients.size;
  }
}
