/**
 * @file src/daemon/protocol/frames.ts
 * @description Protocol Frame Demuxer, Serialization, and Dotted RPC Dispatcher.
 * Inspired by Paseo's binary-frames/demux.ts and Cindy's RPC router.
 */

import {
  DaemonMessageEnvelope,
  RpcRequestEnvelope,
  RpcResponseEnvelope,
  RpcEventEnvelope,
} from '../types';
import { DaemonErrorCode, DaemonRpcError } from './errors';

export const BINARY_OPCODES = {
  TERMINAL_OUTPUT: 0x01,
  TERMINAL_INPUT: 0x02,
  FILE_CHUNK: 0x10,
  HOST_ROUTE: 0x30,
} as const;

export interface BinaryFrame {
  opcode: number;
  payload: Buffer;
}

export type ParsedFrame =
  | { kind: 'text'; message: DaemonMessageEnvelope }
  | { kind: 'binary'; frame: BinaryFrame };

export class FrameCodec {
  /**
   * Decode incoming raw Buffer or string into parsed frame.
   */
  public static decode(raw: Buffer | string): ParsedFrame {
    if (typeof raw === 'string') {
      try {
        const message = JSON.parse(raw) as DaemonMessageEnvelope;
        return { kind: 'text', message };
      } catch (err: any) {
        throw new DaemonRpcError(DaemonErrorCode.PARSE_ERROR, `Failed to parse JSON text frame: ${err.message}`);
      }
    }

    if (Buffer.isBuffer(raw)) {
      if (raw.length === 0) {
        throw new DaemonRpcError(DaemonErrorCode.PARSE_ERROR, 'Empty frame received');
      }

      // Check if it's UTF-8 JSON starting with '{' (0x7b)
      if (raw[0] === 0x7b) {
        try {
          const str = raw.toString('utf-8');
          const message = JSON.parse(str) as DaemonMessageEnvelope;
          return { kind: 'text', message };
        } catch (err: any) {
          throw new DaemonRpcError(DaemonErrorCode.PARSE_ERROR, `Invalid JSON in buffer: ${err.message}`);
        }
      }

      // Otherwise treated as binary frame with leading Opcode
      const opcode = raw[0];
      const payload = raw.subarray(1);
      return {
        kind: 'binary',
        frame: { opcode, payload },
      };
    }

    throw new DaemonRpcError(DaemonErrorCode.PARSE_ERROR, 'Unsupported raw frame type');
  }

  /**
   * Encode Daemon message into string JSON.
   */
  public static encodeText(message: DaemonMessageEnvelope): string {
    return JSON.stringify(message);
  }

  /**
   * Encode binary frame with opcode prefix.
   */
  public static encodeBinary(opcode: number, payload: Buffer): Buffer {
    const buf = Buffer.allocUnsafe(1 + payload.length);
    buf[0] = opcode;
    payload.copy(buf, 1);
    return buf;
  }
}

export type RpcHandler<TParams = any, TResult = any> = (
  params: TParams,
  connectionId: string
) => Promise<TResult> | TResult;

/**
 * Dotted RPC Dispatcher (e.g. "agent.chat", "room.create", "system.status")
 */
export class RpcDispatcher {
  private handlers = new Map<string, RpcHandler>();

  public register<TParams = any, TResult = any>(method: string, handler: RpcHandler<TParams, TResult>): void {
    if (this.handlers.has(method)) {
      throw new Error(`Handler for method '${method}' is already registered.`);
    }
    this.handlers.set(method, handler);
  }

  public hasMethod(method: string): boolean {
    return this.handlers.has(method);
  }

  public async dispatch(request: RpcRequestEnvelope, connectionId: string): Promise<RpcResponseEnvelope> {
    const handler = this.handlers.get(request.method);
    if (!handler) {
      return {
        type: 'response',
        id: request.id,
        error: new DaemonRpcError(
          DaemonErrorCode.METHOD_NOT_FOUND,
          `Method '${request.method}' not found`
        ).toResponseError(),
        timestamp: Date.now(),
      };
    }

    try {
      const result = await handler(request.params, connectionId);
      return {
        type: 'response',
        id: request.id,
        result,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      if (err instanceof DaemonRpcError) {
        return {
          type: 'response',
          id: request.id,
          error: err.toResponseError(),
          timestamp: Date.now(),
        };
      }
      return {
        type: 'response',
        id: request.id,
        error: {
          code: DaemonErrorCode.INTERNAL_ERROR,
          message: err?.message || 'Internal server error',
          data: String(err),
        },
        timestamp: Date.now(),
      };
    }
  }
}

