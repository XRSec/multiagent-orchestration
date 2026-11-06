/**
 * @file src/daemon/protocol/errors.ts
 * @description Standardized RPC and Domain Errors for Multi-Agent Daemon.
 */

export enum DaemonErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  
  // Custom Domain Errors
  CIRCUIT_BREAKER_TRIPPED = -32000,
  BACKPRESSURE_EXCEEDED = -32001,
  ISOLATION_VIOLATION = -32002,
  BOT_NOT_FOUND = -32003,
  ROOM_NOT_FOUND = -32004,
  TASK_TIMEOUT = -32005,
  UPSTREAM_ERROR = -32006,
}

export class DaemonRpcError extends Error {
  public readonly code: number;
  public readonly data?: any;

  constructor(code: number, message: string, data?: any) {
    super(message);
    this.name = 'DaemonRpcError';
    this.code = code;
    this.data = data;
    Object.setPrototypeOf(this, DaemonRpcError.prototype);
  }

  public toResponseError() {
    return {
      code: this.code,
      message: this.message,
      ...(this.data !== undefined ? { data: this.data } : {}),
    };
  }
}

