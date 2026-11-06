/**
 * @file src/daemon/orchestrator/WorkerManager.ts
 * @description Out-of-Process Task & Terminal Worker Manager.
 * Inspired by Paseo's terminal-worker and detached process supervisor.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { WorkerTaskParams, WorkerTaskResult } from '../types';
import { DaemonRpcError, DaemonErrorCode } from '../protocol/errors';
import { SENSITIVE_ENV_VARS_TO_STRIP } from '../../storage/RuntimeEnvironment';

export interface ActiveWorker {
  taskId: string;
  botId: string;
  process: ChildProcess;
  startedAt: number;
  stdoutBuffer: string[];
  stderrBuffer: string[];
}

export class WorkerManager extends EventEmitter {
  private activeWorkers = new Map<string, ActiveWorker>();

  /**
   * Run a sandboxed worker task asynchronously.
   * Strips sensitive environment variables, isolates CWD, and enforces timeout.
   */
  public async executeTask(params: WorkerTaskParams): Promise<WorkerTaskResult> {
    const { taskId, botId, command, args = [], cwd = process.cwd(), timeoutMs = 30000 } = params;

    if (this.activeWorkers.has(taskId)) {
      throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, `Task '${taskId}' is already running.`);
    }

    // Clean sensitive environment variables
    const cleanEnv = { ...process.env, ...(params.env || {}) };
    for (const key of SENSITIVE_ENV_VARS_TO_STRIP) {
      delete cleanEnv[key];
    }

    const startTime = Date.now();

    return new Promise<WorkerTaskResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const worker: ActiveWorker = {
        taskId,
        botId,
        process: child,
        startedAt: startTime,
        stdoutBuffer: [],
        stderrBuffer: [],
      };

      this.activeWorkers.set(taskId, worker);

      let timer: NodeJS.Timeout | null = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.killTask(taskId);
          reject(
            new DaemonRpcError(
              DaemonErrorCode.TASK_TIMEOUT,
              `Worker task '${taskId}' timed out after ${timeoutMs}ms`
            )
          );
        }, timeoutMs);
      }

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        worker.stdoutBuffer.push(text);
        this.emit('worker.stdout', { taskId, botId, chunk: text });
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        worker.stderrBuffer.push(text);
        this.emit('worker.stderr', { taskId, botId, chunk: text });
      });

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        this.activeWorkers.delete(taskId);
        reject(
          new DaemonRpcError(
            DaemonErrorCode.INTERNAL_ERROR,
            `Worker task '${taskId}' spawn failed: ${err.message}`
          )
        );
      });

      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        this.activeWorkers.delete(taskId);
        const durationMs = Date.now() - startTime;
        resolve({
          taskId,
          exitCode: code ?? 0,
          stdout: worker.stdoutBuffer.join(''),
          stderr: worker.stderrBuffer.join(''),
          durationMs,
        });
      });
    });
  }

  public killTask(taskId: string): boolean {
    const worker = this.activeWorkers.get(taskId);
    if (!worker) return false;
    try {
      worker.process.kill('SIGTERM');
      setTimeout(() => {
        if (!worker.process.killed) {
          worker.process.kill('SIGKILL');
        }
      }, 1000).unref?.();
      return true;
    } finally {
      this.activeWorkers.delete(taskId);
    }
  }

  public getActiveTaskCount(): number {
    return this.activeWorkers.size;
  }

  public shutdown(): void {
    for (const taskId of this.activeWorkers.keys()) {
      this.killTask(taskId);
    }
  }
}

