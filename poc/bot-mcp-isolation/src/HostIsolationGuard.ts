import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HostIsolationCheckResult } from './types.js';

export class HostIsolationGuard {
  private static instance: HostIsolationGuard | null = null;
  private readonly hostClaudeDir: string;
  private readonly userClaudeJson: string;
  private isMonitoring = false;
  private readViolations: string[] = [];
  private writeViolations: string[] = [];
  private initialFileSnapshots: Map<string, { mtimeMs: number; size: number }> = new Map();

  // Saved original fs functions
  private originalReadFileSync: typeof fs.readFileSync | null = null;
  private originalWriteFileSync: typeof fs.writeFileSync | null = null;
  private originalOpenSync: typeof fs.openSync | null = null;
  private originalPromisesReadFile: typeof fs.promises.readFile | null = null;
  private originalPromisesWriteFile: typeof fs.promises.writeFile | null = null;

  constructor(customHostClaudeDir?: string) {
    this.hostClaudeDir = customHostClaudeDir || path.resolve(os.homedir(), '.claude');
    this.userClaudeJson = path.resolve(os.homedir(), '.claude.json');
  }

  public static getInstance(): HostIsolationGuard {
    if (!HostIsolationGuard.instance) {
      HostIsolationGuard.instance = new HostIsolationGuard();
    }
    return HostIsolationGuard.instance;
  }

  public getHostClaudeDir(): string {
    return this.hostClaudeDir;
  }

  /**
   * Starts monitoring file operations against ~/.claude and takes initial snapshot.
   */
  public startSurveillance(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    this.readViolations = [];
    this.writeViolations = [];
    this.initialFileSnapshots.clear();

    this.takeSnapshot();
    this.hookFsOperations();
  }

  /**
   * Stops monitoring and restores original fs functions.
   */
  public stopSurveillance(): HostIsolationCheckResult {
    if (!this.isMonitoring) {
      return this.generateReport();
    }
    this.restoreFsOperations();
    this.isMonitoring = false;
    return this.generateReport();
  }

  private isTargetHostPath(targetPath: string): boolean {
    try {
      const resolved = path.resolve(targetPath);
      if (resolved === this.userClaudeJson) return true;
      if (resolved === this.hostClaudeDir || resolved.startsWith(this.hostClaudeDir + path.sep)) {
        return true;
      }
    } catch {
      // Ignore resolution errors
    }
    return false;
  }

  private takeSnapshot(): void {
    if (!fs.existsSync(this.hostClaudeDir)) return;

    try {
      const stat = fs.statSync(this.hostClaudeDir);
      this.initialFileSnapshots.set(this.hostClaudeDir, { mtimeMs: stat.mtimeMs, size: stat.size });

      const inspectTargets = [
        path.join(this.hostClaudeDir, 'settings.json'),
        path.join(this.hostClaudeDir, 'history.jsonl'),
        this.userClaudeJson,
      ];

      for (const target of inspectTargets) {
        if (fs.existsSync(target)) {
          const s = fs.statSync(target);
          this.initialFileSnapshots.set(target, { mtimeMs: s.mtimeMs, size: s.size });
        }
      }
    } catch {
      // Best effort snapshot
    }
  }

  private hookFsOperations(): void {
    const self = this;

    // 1. Sync read
    this.originalReadFileSync = fs.readFileSync;
    // @ts-expect-error override
    fs.readFileSync = function (filePath: any, options: any) {
      const stringPath = typeof filePath === 'string' ? filePath : String(filePath);
      if (self.isTargetHostPath(stringPath)) {
        self.readViolations.push(`[readFileSync] ${stringPath}`);
        throw new Error(`[HostIsolationGuard Security Violation]: Unauthorized read from host ~/.claude: ${stringPath}`);
      }
      return self.originalReadFileSync!.apply(this, arguments as any);
    };

    // 2. Sync write
    this.originalWriteFileSync = fs.writeFileSync;
    // @ts-expect-error override
    fs.writeFileSync = function (filePath: any, data: any, options: any) {
      const stringPath = typeof filePath === 'string' ? filePath : String(filePath);
      if (self.isTargetHostPath(stringPath)) {
        self.writeViolations.push(`[writeFileSync] ${stringPath}`);
        throw new Error(`[HostIsolationGuard Security Violation]: Unauthorized write to host ~/.claude: ${stringPath}`);
      }
      return self.originalWriteFileSync!.apply(this, arguments as any);
    };

    // 3. Sync open
    this.originalOpenSync = fs.openSync;
    // @ts-expect-error override
    fs.openSync = function (filePath: any, flags: any, mode: any) {
      const stringPath = typeof filePath === 'string' ? filePath : String(filePath);
      if (self.isTargetHostPath(stringPath)) {
        const flagStr = String(flags || 'r');
        if (flagStr.includes('w') || flagStr.includes('a') || flagStr.includes('+')) {
          self.writeViolations.push(`[openSync:write] ${stringPath}`);
          throw new Error(`[HostIsolationGuard Security Violation]: Unauthorized write open on ${stringPath}`);
        } else {
          self.readViolations.push(`[openSync:read] ${stringPath}`);
          throw new Error(`[HostIsolationGuard Security Violation]: Unauthorized read open on ${stringPath}`);
        }
      }
      return self.originalOpenSync!.apply(this, arguments as any);
    };

    // 4. Promises readFile
    this.originalPromisesReadFile = fs.promises.readFile;
    // @ts-expect-error override
    fs.promises.readFile = async function (filePath: any, options: any) {
      const stringPath = typeof filePath === 'string' ? filePath : String(filePath);
      if (self.isTargetHostPath(stringPath)) {
        self.readViolations.push(`[promises.readFile] ${stringPath}`);
        throw new Error(`[HostIsolationGuard Security Violation]: Unauthorized async read on ${stringPath}`);
      }
      return self.originalPromisesReadFile!.apply(this, arguments as any);
    };

    // 5. Promises writeFile
    this.originalPromisesWriteFile = fs.promises.writeFile;
    // @ts-expect-error override
    fs.promises.writeFile = async function (filePath: any, data: any, options: any) {
      const stringPath = typeof filePath === 'string' ? filePath : String(filePath);
      if (self.isTargetHostPath(stringPath)) {
        self.writeViolations.push(`[promises.writeFile] ${stringPath}`);
        throw new Error(`[HostIsolationGuard Security Violation]: Unauthorized async write on ${stringPath}`);
      }
      return self.originalPromisesWriteFile!.apply(this, arguments as any);
    };
  }

  private restoreFsOperations(): void {
    if (this.originalReadFileSync) fs.readFileSync = this.originalReadFileSync;
    if (this.originalWriteFileSync) fs.writeFileSync = this.originalWriteFileSync;
    if (this.originalOpenSync) fs.openSync = this.originalOpenSync;
    if (this.originalPromisesReadFile) fs.promises.readFile = this.originalPromisesReadFile;
    if (this.originalPromisesWriteFile) fs.promises.writeFile = this.originalPromisesWriteFile;
  }

  public generateReport(): HostIsolationCheckResult {
    const hostDirExisted = fs.existsSync(this.hostClaudeDir);
    const hostFilesModified: string[] = [];

    for (const [filePath, snap] of this.initialFileSnapshots.entries()) {
      if (fs.existsSync(filePath)) {
        const currentStat = fs.statSync(filePath);
        if (currentStat.mtimeMs !== snap.mtimeMs || currentStat.size !== snap.size) {
          hostFilesModified.push(`${filePath} (modified: mtime ${snap.mtimeMs} -> ${currentStat.mtimeMs})`);
        }
      }
    }

    const hostDirTouched = this.readViolations.length > 0 || this.writeViolations.length > 0 || hostFilesModified.length > 0;

    return {
      hostClaudeDir: this.hostClaudeDir,
      hostDirExisted,
      hostDirTouched,
      hostFilesModified,
      readViolations: [...this.readViolations],
      writeViolations: [...this.writeViolations],
      isFullyIsolated: !hostDirTouched,
    };
  }
}
