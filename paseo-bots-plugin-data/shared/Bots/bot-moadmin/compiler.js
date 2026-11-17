import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import pLimit from "p-limit";
import { ZodError } from "zod";
export { SERVER_HOST_MODULES, resolveExistingAsarUnpackedEsbuildBinary, unpackedEsbuildBinaryFromPackageDir, } from "./compiler-esbuild.js";
const IDLE_TIMEOUT_MS = 1000;
const source = import.meta.url.endsWith(".ts");
const workerUrl = new URL(source ? "./compiler-worker.ts" : "./compiler-worker.js", import.meta.url);
// Resolve the development loader once at module initialization, never during a
// compile request. Packaged workers execute ordinary JavaScript without tsx.
const workerEntrypoint = source
    ? `import(${JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve("tsx/esm/api")).href)}).then(({ register }) => { register(); return import(${JSON.stringify(workerUrl.href)}); });`
    : workerUrl;
// Reuse the isolate during a build batch (notably daemon bootstrap), then release
// TypeScript's heap when idle. Only this owner admits work or stops the worker.
class PluginCompiler {
    constructor() {
        this.queue = pLimit(1);
        this.worker = null;
        this.idleTimer = null;
        this.stopping = Promise.resolve();
    }
    run(task, onLog) {
        return this.queue(async () => {
            if (this.idleTimer)
                clearTimeout(this.idleTimer);
            this.idleTimer = null;
            await this.stopping;
            const worker = this.worker ?? this.startWorker();
            worker.ref();
            try {
                return await this.request(worker, task, onLog);
            }
            finally {
                if (this.worker === worker) {
                    worker.unref();
                    this.idleTimer = setTimeout(() => this.stopWorker(worker), IDLE_TIMEOUT_MS);
                    this.idleTimer.unref();
                }
                else {
                    await this.stopping;
                }
            }
        });
    }
    startWorker() {
        const worker = new Worker(workerEntrypoint, { eval: source, execArgv: [] });
        this.worker = worker;
        // Keep error/exit ownership while idle too. The next caller gets a fresh
        // isolate after a crash; author build commands are never retried.
        worker.on("error", () => this.stopWorker(worker));
        worker.on("exit", () => {
            if (this.worker === worker)
                this.stopWorker(worker);
        });
        return worker;
    }
    stopWorker(worker) {
        if (this.worker !== worker)
            return;
        this.worker = null;
        if (this.idleTimer)
            clearTimeout(this.idleTimer);
        this.idleTimer = null;
        this.stopping = worker.terminate();
    }
    async request(worker, task, onLog) {
        let onMessage;
        let onError;
        let onExit;
        try {
            return await new Promise((resolve, reject) => {
                onError = reject;
                onExit = (code) => reject(new Error(`Plugin compiler worker exited (code ${code})`));
                onMessage = (reply) => {
                    if (reply.kind === "log") {
                        onLog?.(reply.data, reply.message);
                    }
                    else if (reply.kind === "result") {
                        resolve(reply.value);
                    }
                    else {
                        const error = reply.issues ? new ZodError(reply.issues) : reply.error;
                        Object.assign(error, reply.properties);
                        if (reply.errors)
                            Object.assign(error, { errors: reply.errors });
                        if (reply.warnings)
                            Object.assign(error, { warnings: reply.warnings });
                        // Promise.all can reject while the other target is still compiling.
                        // Retire the isolate before another request can enter it.
                        this.stopWorker(worker);
                        reject(error);
                    }
                };
                worker.on("error", onError);
                worker.on("exit", onExit);
                worker.on("message", onMessage);
                worker.postMessage(task, []);
            });
        }
        finally {
            worker.off("message", onMessage);
            worker.off("error", onError);
            worker.off("exit", onExit);
        }
    }
}
const compiler = new PluginCompiler();
export function runCompilerTask(task, onLog) {
    return compiler.run(task, onLog);
}
export function compilePlugin(entries) {
    return runCompilerTask({ kind: "entries", entries });
}
export function compileDirectoryPlugin(directory, version, builtinId) {
    return runCompilerTask({ kind: "directory", directory, version, builtinId });
}
//# sourceMappingURL=compiler.js.map