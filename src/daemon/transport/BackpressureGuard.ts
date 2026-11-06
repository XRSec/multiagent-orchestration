/**
 * @file src/daemon/transport/BackpressureGuard.ts
 * @description Outbound Socket Backpressure Guard & Lease Watchdog.
 * Implements Paseo's 64 MiB high-water mark protection and heartbeat lease monitoring.
 */

import { EventEmitter } from 'events';
import { DaemonRpcError, DaemonErrorCode } from '../protocol/errors';

export interface BackpressureOptions {
  maxBufferedBytes?: number; // Defaults to 64 MiB
  leaseTimeoutMs?: number;   // Defaults to 30,000 ms (30s)
  heartbeatIntervalMs?: number; // Defaults to 10,000 ms (10s)
}

export class ConnectionLease extends EventEmitter {
  public readonly id: string;
  private lastActivityAt: number;
  private isAlive = true;

  constructor(id: string) {
    super();
    this.id = id;
    this.lastActivityAt = Date.now();
  }

  public touch(): void {
    this.lastActivityAt = Date.now();
    this.isAlive = true;
  }

  public checkHealth(now: number, timeoutMs: number): boolean {
    if (now - this.lastActivityAt > timeoutMs) {
      this.isAlive = false;
      return false;
    }
    return true;
  }

  public get alive(): boolean {
    return this.isAlive;
  }

  public get lastActivity(): number {
    return this.lastActivityAt;
  }
}

export class BackpressureGuard {
  public readonly maxBufferedBytes: number;
  public readonly leaseTimeoutMs: number;
  private leases = new Map<string, ConnectionLease>();
  private watchdogTimer: NodeJS.Timeout | null = null;

  constructor(options: BackpressureOptions = {}) {
    this.maxBufferedBytes = options.maxBufferedBytes ?? 64 * 1024 * 1024; // 64 MiB
    this.leaseTimeoutMs = options.leaseTimeoutMs ?? 30000;
  }

  /**
   * Check whether outbound buffer exceeds the high-water mark limit.
   */
  public assertOutboundCapacity(bufferedAmount: number, connectionId: string): void {
    if (bufferedAmount >= this.maxBufferedBytes) {
      throw new DaemonRpcError(
        DaemonErrorCode.BACKPRESSURE_EXCEEDED,
        `Outbound socket buffer exceeded high-water mark (${bufferedAmount} >= ${this.maxBufferedBytes} bytes) for connection '${connectionId}'`
      );
    }
  }

  public registerConnection(connectionId: string): ConnectionLease {
    const lease = new ConnectionLease(connectionId);
    this.leases.set(connectionId, lease);
    return lease;
  }

  public unregisterConnection(connectionId: string): void {
    this.leases.delete(connectionId);
  }

  public touchConnection(connectionId: string): void {
    const lease = this.leases.get(connectionId);
    if (lease) {
      lease.touch();
    }
  }

  public startWatchdog(onDeadConnection: (connectionId: string) => void): void {
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, lease] of this.leases.entries()) {
        if (!lease.checkHealth(now, this.leaseTimeoutMs)) {
          onDeadConnection(id);
          this.leases.delete(id);
        }
      }
    }, 5000);
    // Don't keep event loop alive just for watchdog
    this.watchdogTimer.unref?.();
  }

  public stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.leases.clear();
  }

  public getActiveConnectionCount(): number {
    return this.leases.size;
  }
}

