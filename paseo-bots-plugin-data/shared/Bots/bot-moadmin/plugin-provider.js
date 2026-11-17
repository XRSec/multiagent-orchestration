import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { PluginSessionHistory } from "./plugin-session-history.js";
import { resolve as resolvePath } from "node:path";
import { z } from "zod";
import { PROVIDER_CAPABILITIES, PROVIDER_PROTOCOL_VERSION, ProviderEventSchema, ProviderInputSchema, ProviderStatusSchema, requireProviderCapabilities, } from "@getpaseo/plugin/server/provider";
import { resolveProviderLaunch, checkProviderLaunchAvailable, createProviderEnv, } from "./provider-launch-config.js";
import { readPluginOptionState } from "./plugin-provider-options.js";
import { runProviderTurn } from "./providers/provider-runner.js";
import { StaleProviderSessionError } from "./stale-provider-session-error.js";
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    // Provider events can reject before send() settles and the caller awaits this promise.
    // Observe that interval without replacing the rejecting promise returned to the caller.
    void promise.catch(() => undefined);
    return { promise, resolve, reject };
}
function providerError(error) {
    return Object.assign(new Error(error.message), {
        code: error.code,
        diagnostic: error.diagnostic,
    });
}
function isProviderRequestReply(event) {
    return (event.type === "request.completed" ||
        event.type === "catalog" ||
        event.type === "sessions" ||
        event.type === "session.can_stop_runtime");
}
class ProviderRuntime {
    constructor(registration, runtimeSettings) {
        this.registration = registration;
        this.runtimeSettings = runtimeSettings;
        this.connection = null;
        this.connecting = null;
        this.closed = false;
        this.generation = 0;
        this.closePromise = null;
        this.unsubscribe = null;
        this.sessions = new Map();
        this.providerSessions = new Map();
        this.sessionListeners = new Set();
        this.requests = new Map();
        this.sessionRequests = new Map();
        this.pendingOpenDescendants = new Map();
        this.pendingOpenDescendantsByRoot = new Map();
    }
    async resolveLaunch() {
        const command = this.registration.command;
        if (!command)
            return undefined;
        const launch = await resolveProviderLaunch({
            commandConfig: this.runtimeSettings?.command,
            defaultBinary: command[0],
        });
        if (launch.source !== "override")
            launch.args.unshift(...command.slice(1));
        const env = createProviderEnv({ runtimeSettings: this.runtimeSettings });
        launch.env = env;
        const availability = await checkProviderLaunchAvailable(launch);
        if (!availability.resolvedPath)
            throw new Error(`${launch.command} not found on PATH`);
        return { command: resolvePath(availability.resolvedPath), args: launch.args, env };
    }
    async status() {
        try {
            const launch = await this.resolveLaunch();
            if (this.registration.status)
                return ProviderStatusSchema.parse(await this.registration.status({ launch }));
            if (!this.registration.command)
                await this.getConnection();
            return { available: true };
        }
        catch (error) {
            return {
                available: false,
                diagnostic: error instanceof Error ? error.message : String(error),
            };
        }
    }
    async catalogCacheKey(options) {
        const callback = this.registration.getCatalogCacheKey;
        if (!callback)
            return undefined;
        return callback({ ...options, launch: await this.resolveLaunch() });
    }
    get negotiatedCapabilities() {
        return this.connection?.capabilities ?? [];
    }
    get isClosed() {
        return this.closed;
    }
    async isAvailable() {
        return (await this.status()).available;
    }
    async catalog(cwd, signal) {
        const event = await this.complete({ type: "catalog", requestId: randomUUID(), cwd }, signal);
        if (event.type !== "catalog")
            throw new Error("Provider returned an invalid catalog response");
        return event.catalog;
    }
    async listSessions(input = {}) {
        const connection = await this.getConnection();
        if (!connection.capabilities.includes("session.list"))
            return [];
        const event = await this.complete({ type: "sessions", requestId: randomUUID(), ...input });
        if (event.type !== "sessions")
            throw new Error("Provider returned an invalid sessions response");
        return event.sessions;
    }
    onSessionOpened(listener) {
        this.sessionListeners.add(listener);
        return () => this.sessionListeners.delete(listener);
    }
    async openSession(input) {
        if (this.sessions.has(input.sessionId)) {
            throw new Error(`Provider session already exists: ${input.sessionId}`);
        }
        const connection = await this.getConnection();
        requireProviderCapabilities(connection.capabilities, {
            type: "session.open",
            requestId: "capability-check",
            ...input,
        });
        const session = new ProviderRuntimeSession(this, connection, input.sessionId, input.sessionId, "core");
        this.sessions.set(input.sessionId, session);
        this.providerSessions.set(input.sessionId, session);
        const requestId = randomUUID();
        const ready = session.beginOpen(requestId);
        this.sessionRequests.set(requestId, input.sessionId);
        try {
            await connection.send({
                type: "session.open",
                requestId,
                sessionId: input.sessionId,
                config: input.config,
                persistence: input.persistence,
                history: input.history,
            });
            await ready;
            return session;
        }
        catch (error) {
            this.sessionRequests.delete(requestId);
            this.discardPendingOpenDescendants(session);
            this.sessions.delete(input.sessionId);
            this.providerSessions.delete(input.sessionId);
            throw error;
        }
    }
    async archive(persistence) {
        const connection = await this.getConnection();
        if (!connection.capabilities.includes("session.archive"))
            return;
        await this.complete({ type: "session.archive", requestId: randomUUID(), persistence });
    }
    async unarchive(persistence) {
        const connection = await this.getConnection();
        if (!connection.capabilities.includes("session.unarchive"))
            return;
        await this.complete({ type: "session.unarchive", requestId: randomUUID(), persistence });
    }
    close() {
        if (this.closePromise)
            return this.closePromise;
        this.closed = true;
        this.generation += 1;
        const connection = this.connection;
        const connecting = connection ? null : this.connecting;
        this.connection = null;
        this.unsubscribe?.();
        this.unsubscribe = null;
        for (const session of this.sessions.values())
            session.connectionClosed();
        this.sessions.clear();
        this.providerSessions.clear();
        this.pendingOpenDescendants.clear();
        this.pendingOpenDescendantsByRoot.clear();
        this.sessionListeners.clear();
        for (const request of this.requests.values())
            request.reject(new Error("Provider closed"));
        this.requests.clear();
        this.closePromise = Promise.all([
            connection?.close(),
            connecting?.then(() => undefined, () => undefined),
        ]).then(() => undefined);
        return this.closePromise;
    }
    async complete(input, signal) {
        signal?.throwIfAborted();
        const connection = await this.getConnection();
        signal?.throwIfAborted();
        const pending = deferred();
        this.requests.set(input.requestId, {
            kind: input.type,
            sessionId: "sessionId" in input
                ? (this.providerSessions.get(input.sessionId)?.id ?? input.sessionId)
                : undefined,
            resolve: pending.resolve,
            reject: pending.reject,
        });
        const abort = () => {
            if (!this.requests.delete(input.requestId))
                return;
            pending.reject(signal?.reason instanceof Error ? signal.reason : new Error("Provider request aborted"));
        };
        signal?.addEventListener("abort", abort, { once: true });
        try {
            await connection.send(input);
            return await pending.promise;
        }
        catch (error) {
            this.requests.delete(input.requestId);
            throw error;
        }
        finally {
            signal?.removeEventListener("abort", abort);
        }
    }
    removeSession(sessionId, providerSessionId) {
        this.sessions.delete(sessionId);
        this.providerSessions.delete(providerSessionId);
    }
    getConnection() {
        if (this.closed)
            return Promise.reject(new Error("Provider runtime is closed"));
        if (this.connection)
            return Promise.resolve(this.connection);
        if (this.connecting)
            return this.connecting;
        const generation = this.generation;
        const connecting = this.establishConnection(generation);
        this.connecting = connecting;
        connecting.then(() => {
            if (this.connecting === connecting)
                this.connecting = null;
            return undefined;
        }, () => {
            if (this.connecting === connecting)
                this.connecting = null;
            return undefined;
        });
        return connecting;
    }
    async establishConnection(generation) {
        const rawConnection = await this.registration.connect({
            launch: await this.resolveLaunch(),
            versions: [PROVIDER_PROTOCOL_VERSION],
            capabilities: PROVIDER_CAPABILITIES,
        });
        if (this.closed || generation !== this.generation) {
            await rawConnection.close().catch(() => undefined);
            throw new Error("Provider runtime is closed");
        }
        try {
            this.validateConnection(rawConnection);
        }
        catch (error) {
            await rawConnection.close().catch(() => undefined);
            throw error;
        }
        const connection = normalizeConnection(rawConnection);
        const unsubscribe = connection.onEvent((event) => this.accept(event));
        if (this.closed || generation !== this.generation) {
            unsubscribe();
            await connection.close().catch(() => undefined);
            throw new Error("Provider runtime is closed");
        }
        this.unsubscribe = unsubscribe;
        this.connection = connection;
        return connection;
    }
    validateConnection(connection) {
        if (connection.version !== PROVIDER_PROTOCOL_VERSION) {
            throw new Error(`Provider selected unsupported version ${connection.version}`);
        }
    }
    accept(event) {
        if (event.type === "request.failed") {
            this.failRequest(event);
            return;
        }
        if (isProviderRequestReply(event)) {
            this.finishRequest(event);
            return;
        }
        this.finishSessionReadyRequest(event);
        if (this.holdPendingOpenDescendant(event))
            return;
        if (this.acceptProviderChild(event))
            return;
        if ("sessionId" in event) {
            const session = this.providerSessions.get(event.sessionId);
            if (!session)
                return;
            event = {
                ...event,
                sessionId: session.id,
                ...(event.type === "session.opened" && event.parentSessionId
                    ? { parentSessionId: this.providerSessions.get(event.parentSessionId)?.id }
                    : {}),
            };
        }
        if (event.type === "session.runtime_failed") {
            this.failSessionRequests(event.sessionId, providerError(event.error));
        }
        else if (event.type === "session.closed") {
            this.settleClosedSessionRequests(event.sessionId, new Error(event.error?.message ?? `Provider session ${event.sessionId} closed`), event);
        }
        if ("sessionId" in event) {
            const session = this.sessions.get(event.sessionId);
            session?.accept(event);
            if (event.type === "session.closed" && session) {
                this.removeSession(session.id, session.providerId);
            }
        }
    }
    finishSessionReadyRequest(event) {
        if (event.type !== "session.ready" || !event.requestId)
            return;
        this.sessionRequests.delete(event.requestId);
        const request = this.requests.get(event.requestId);
        if (!request)
            return;
        this.requests.delete(event.requestId);
        request.resolve(event);
    }
    acceptProviderChild(event) {
        if (event.type !== "session.opened" || this.providerSessions.has(event.sessionId))
            return false;
        const parent = event.parentSessionId
            ? this.providerSessions.get(event.parentSessionId)
            : undefined;
        if (!parent)
            return true;
        const sessionId = randomUUID();
        const session = new ProviderRuntimeSession(this, this.connection, sessionId, event.sessionId, event.restoration);
        this.sessions.set(sessionId, session);
        this.providerSessions.set(event.sessionId, session);
        const mappedEvent = { ...event, sessionId, parentSessionId: parent.id };
        session.accept(mappedEvent);
        for (const listener of this.sessionListeners)
            listener(session, mappedEvent);
        return true;
    }
    holdPendingOpenDescendant(event) {
        if (!("sessionId" in event))
            return false;
        let state = this.pendingOpenDescendants.get(event.sessionId);
        if (event.type === "session.opened" && event.parentSessionId) {
            const parent = this.providerSessions.get(event.parentSessionId);
            state =
                this.pendingOpenDescendants.get(event.parentSessionId) ??
                    (parent?.hasPendingOpen() ? this.pendingOpenDescendantStateFor(parent) : undefined);
            if (state) {
                state.providerSessionIds.add(event.sessionId);
                this.pendingOpenDescendants.set(event.sessionId, state);
            }
        }
        if (!state)
            return false;
        state.events.push(event);
        return true;
    }
    pendingOpenDescendantStateFor(root) {
        const existing = this.pendingOpenDescendantsByRoot.get(root);
        if (existing)
            return existing;
        const state = { providerSessionIds: new Set(), events: [] };
        this.pendingOpenDescendantsByRoot.set(root, state);
        return state;
    }
    releasePendingOpenDescendants(root) {
        const state = this.takePendingOpenDescendants(root);
        if (!state)
            return;
        for (const event of state.events)
            this.accept(event);
    }
    discardPendingOpenDescendants(root) {
        this.takePendingOpenDescendants(root);
    }
    takePendingOpenDescendants(root) {
        const state = this.pendingOpenDescendantsByRoot.get(root);
        if (!state)
            return undefined;
        this.pendingOpenDescendantsByRoot.delete(root);
        for (const providerSessionId of state.providerSessionIds) {
            if (this.pendingOpenDescendants.get(providerSessionId) === state) {
                this.pendingOpenDescendants.delete(providerSessionId);
            }
        }
        return state;
    }
    failSessionRequests(sessionId, error) {
        for (const [requestId, request] of this.requests) {
            if (request.sessionId !== sessionId)
                continue;
            this.requests.delete(requestId);
            request.reject(error);
        }
        for (const [requestId, pendingSessionId] of this.sessionRequests) {
            if (pendingSessionId === sessionId)
                this.sessionRequests.delete(requestId);
        }
    }
    settleClosedSessionRequests(sessionId, error, event) {
        for (const [requestId, request] of this.requests) {
            if (request.sessionId !== sessionId)
                continue;
            this.requests.delete(requestId);
            if (request.kind === "session.close")
                request.resolve(event);
            else
                request.reject(error);
        }
    }
    failRequest(event) {
        const request = this.requests.get(event.requestId);
        if (request) {
            this.requests.delete(event.requestId);
            request.reject(providerError(event.error));
        }
        if (request?.sessionId)
            this.sessions.get(request.sessionId)?.requestFailed(event);
        const sessionId = this.sessionRequests.get(event.requestId);
        if (!sessionId)
            return;
        this.sessionRequests.delete(event.requestId);
        this.sessions.get(sessionId)?.requestFailed(event);
    }
    finishRequest(event) {
        const request = this.requests.get(event.requestId);
        if (!request)
            return;
        if (event.type === "session.can_stop_runtime" &&
            this.providerSessions.get(event.sessionId)?.id !== request.sessionId) {
            this.requests.delete(event.requestId);
            request.reject(new Error("Runtime safety response belongs to another session"));
            return;
        }
        this.requests.delete(event.requestId);
        request.resolve(event);
    }
}
class ProviderRuntimeSession {
    constructor(runtime, connection, id, providerSessionId, restoration) {
        this.runtime = runtime;
        this.connection = connection;
        this.id = id;
        this.providerSessionId = providerSessionId;
        this.restoration = restoration;
        this.history = [];
        this.historyClaimed = false;
        this.listeners = new Set();
        this.capabilities = [];
        this.openRequest = null;
        this.prompts = new Map();
        this.activeTurnIds = new Set();
        this.terminal = false;
        this.closePromise = null;
        this.config = { models: [], modes: [], thinkingOptions: [] };
        this.commands = [];
        this.persistence = null;
    }
    get providerId() {
        return this.providerSessionId;
    }
    get negotiatedCapabilities() {
        return this.capabilities;
    }
    onEvent(listener) {
        // This buffer bridges session.open and adapter attachment. Once replayed,
        // the adapter owns history; retaining live cumulative snapshots is quadratic.
        this.historyClaimed = true;
        this.history.length = 0;
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    async prompt(prompt) {
        requireProviderCapabilities(this.capabilities, {
            type: "session.prompt",
            sessionId: this.providerSessionId,
            prompt,
        });
        if (this.terminal)
            throw new StaleProviderSessionError(this.id);
        const pending = deferred();
        this.prompts.set(prompt.clientMessageId, pending);
        try {
            await this.connection.send({
                type: "session.prompt",
                sessionId: this.providerSessionId,
                prompt,
            });
            return (await pending.promise).result;
        }
        catch (error) {
            if (this.terminal || this.runtime.isClosed)
                throw new StaleProviderSessionError(this.id);
            throw error;
        }
        finally {
            this.prompts.delete(prompt.clientMessageId);
        }
    }
    async canStopRuntime() {
        if (this.terminal ||
            this.prompts.size ||
            this.activeTurnIds.size ||
            !this.capabilities.includes("session.can_stop_runtime"))
            return false;
        const event = await this.runtime.complete({
            type: "session.can_stop_runtime",
            requestId: randomUUID(),
            sessionId: this.providerSessionId,
        }, AbortSignal.timeout(10000));
        if (event.type !== "session.can_stop_runtime")
            throw new Error("Invalid runtime safety response");
        return event.canStop;
    }
    async configure(changes) {
        const input = {
            type: "session.configure",
            requestId: randomUUID(),
            sessionId: this.providerSessionId,
            changes,
        };
        requireProviderCapabilities(this.capabilities, input);
        await this.runtime.complete(input);
    }
    async respondToPermission(permissionId, response) {
        const input = {
            type: "session.permission",
            sessionId: this.providerSessionId,
            permissionId,
            response,
        };
        requireProviderCapabilities(this.capabilities, input);
        await this.connection.send(input);
    }
    async revert(token) {
        const input = { ...token, sessionId: this.providerSessionId };
        requireProviderCapabilities(this.capabilities, input);
        await this.runtime.complete(input);
    }
    async interrupt() {
        await this.runtime.complete({
            type: "session.interrupt",
            requestId: randomUUID(),
            sessionId: this.providerSessionId,
        });
    }
    async close() {
        this.history.length = 0;
        if (this.restoration === "parent") {
            this.runtime.removeSession(this.id, this.providerSessionId);
            return;
        }
        this.closePromise ?? (this.closePromise = this.closeNativeSession().catch((error) => {
            this.closePromise = null;
            throw error;
        }));
        await this.closePromise;
    }
    async closeNativeSession() {
        try {
            await this.runtime.complete({
                type: "session.close",
                requestId: randomUUID(),
                sessionId: this.providerSessionId,
            });
        }
        catch (error) {
            if (!this.runtime.isClosed)
                throw error;
        }
        // A failed close still needs its routing for a subsequent session.closed ack.
        this.runtime.removeSession(this.id, this.providerSessionId);
    }
    beginOpen(requestId) {
        const pending = deferred();
        this.openRequest = { requestId, deferred: pending };
        return pending.promise;
    }
    requestFailed(event) {
        if (this.openRequest?.requestId === event.requestId) {
            this.openRequest.deferred.reject(providerError(event.error));
            this.openRequest = null;
            this.runtime.discardPendingOpenDescendants(this);
        }
    }
    accept(event) {
        if (event.type === "session.opened") {
            event = { ...event, capabilities: this.normalizeSessionCapabilities(event.capabilities) };
        }
        if (event.type === "session.opened") {
            this.capabilities = [...event.capabilities];
            this.persistence = this.restoration === "core" ? (event.persistence ?? null) : null;
            return;
        }
        const openRequest = this.openRequest;
        if (event.type === "session.ready" &&
            openRequest &&
            openRequest.requestId === event.requestId) {
            this.openRequest = null;
            this.runtime.releasePendingOpenDescendants(this);
            openRequest.deferred.resolve();
            return;
        }
        if (event.type === "session.prompt_result") {
            if (event.result.type === "turn")
                this.activeTurnIds.add(event.result.turnId);
            this.prompts.get(event.clientMessageId)?.resolve(event);
            return;
        }
        if (event.type === "session.runtime_failed" || event.type === "session.closed") {
            if (this.terminal)
                return;
            this.terminal = true;
            this.publish(event);
            this.rejectPending(new Error(event.error?.message ?? `Provider session ${this.id} closed`));
            return;
        }
        this.publish(event);
    }
    hasPendingOpen() {
        return this.openRequest !== null;
    }
    connectionClosed(error = new Error("Provider connection closed")) {
        // Closing fails only an interrupted turn. An idle session goes stale, and its next prompt
        // reopens it from persistence.
        if (!this.terminal && this.activeTurnIds.size > 0) {
            this.publish({
                type: "session.runtime_failed",
                sessionId: this.id,
                error: { message: error.message },
            });
        }
        this.terminal = true;
        this.rejectPending(error);
    }
    rejectPending(error) {
        const openRequest = this.openRequest;
        this.openRequest = null;
        openRequest?.deferred.reject(error);
        this.runtime.discardPendingOpenDescendants(this);
        for (const prompt of this.prompts.values())
            prompt.reject(error);
        this.prompts.clear();
    }
    normalizeSessionCapabilities(capabilities) {
        const known = PROVIDER_CAPABILITIES.filter((capability) => capabilities.includes(capability));
        for (const capability of known) {
            if (!this.connection.capabilities.includes(capability)) {
                throw new Error(`Provider session selected unoffered capability ${capability}`);
            }
        }
        return known;
    }
    publish(event) {
        if (event.type === "session.turn") {
            if (event.state === "started")
                this.activeTurnIds.add(event.turnId);
            else
                this.activeTurnIds.delete(event.turnId);
        }
        if (event.type === "session.config")
            this.config = event.config;
        if (event.type === "session.commands")
            this.commands = [...event.commands];
        if (event.type === "session.persistence" && this.restoration === "core") {
            this.persistence = event.persistence;
        }
        if (!this.historyClaimed)
            this.history.push(event);
        for (const listener of this.listeners)
            listener(event);
    }
}
function normalizeConnection(connection) {
    const capabilities = PROVIDER_CAPABILITIES.filter((capability) => connection.capabilities.includes(capability));
    return {
        version: connection.version,
        capabilities,
        send: (input) => connection.send(ProviderInputSchema.parse(input)),
        onEvent: (listener) => connection.onEvent((event) => listener(ProviderEventSchema.parse(event))),
        close: () => connection.close(),
    };
}
/** Owns the complete plugin-provider adaptation behind the existing core provider boundary. */
export class PluginAgentClientRegistry {
    constructor(logger) {
        this.logger = logger;
        this.providers = new Map();
    }
    replace(registrations) {
        const incoming = new Map();
        for (const registration of registrations) {
            if (incoming.has(registration.id)) {
                throw new Error(`Duplicate plugin provider ID: ${registration.id}`);
            }
            incoming.set(registration.id, registration);
        }
        for (const [id, adapted] of this.providers) {
            if (incoming.get(id) === adapted.registration)
                continue;
            this.providers.delete(id);
            void Promise.all([...adapted.clients].map((client) => client.shutdown())).catch((error) => {
                this.logger.warn({ err: error, provider: id }, "Failed to stop plugin provider");
            });
        }
        for (const [id, registration] of incoming) {
            if (this.providers.has(id))
                continue;
            const client = new PluginAgentClient(registration);
            const clients = new Set([client]);
            const definition = createPluginProviderDefinition(registration, (_logger, runtimeSettings) => {
                const configuredClient = new PluginAgentClient(registration, runtimeSettings);
                clients.add(configuredClient);
                return configuredClient;
            });
            this.providers.set(id, { registration, client, definition, clients });
        }
    }
    definitions() {
        return Object.fromEntries([...this.providers].map(([id, provider]) => [id, provider.definition]));
    }
    clients() {
        return Object.fromEntries([...this.providers].map(([id, provider]) => [id, provider.client]));
    }
    has(provider) {
        return this.providers.has(provider);
    }
    async shutdown() {
        const providers = [...this.providers.values()];
        this.providers.clear();
        await Promise.all(providers.flatMap(({ clients }) => [...clients].map((client) => client.shutdown())));
    }
}
function createPluginProviderDefinition(registration, createClient) {
    return {
        id: registration.id,
        label: registration.label,
        description: registration.description ?? `Plugin provider ${registration.label}`,
        iconSvg: registration.icon,
        requiresConfiguration: registration.requiresConfiguration,
        defaultModeId: null,
        modes: [],
        supportsExactMcpPreapproval: true,
        createClient,
    };
}
class PluginAgentClient {
    constructor(registration, runtimeSettings) {
        this.rootsBySession = new Map();
        this.pendingChildren = [];
        this.provider = registration.id;
        this.runtime = new ProviderRuntime(registration, runtimeSettings);
        if (registration.getCatalogCacheKey)
            this.getCatalogCacheKey = (options) => this.runtime.catalogCacheKey(options);
        this.runtime.onSessionOpened((session, opened) => this.acceptChild(session, opened));
    }
    get capabilities() {
        return agentCapabilities(this.runtime.negotiatedCapabilities);
    }
    async createSession(config, launchContext, options) {
        return await this.openSession({
            config,
            launchContext,
            history: "skip",
            persist: options?.persistSession !== false,
        });
    }
    async resumeSession(handle, overrides, launchContext) {
        if (!overrides?.cwd) {
            throw new Error(`Plugin provider '${this.provider}' requires cwd to resume a session`);
        }
        return await this.openSession({
            config: { ...overrides, provider: this.provider, cwd: overrides.cwd },
            launchContext,
            persistence: decodePersistence(handle),
            history: "replay",
            persist: true,
        });
    }
    async fetchCatalog(options, context) {
        const catalog = await this.runtime.catalog(options.scope === "workspace" ? options.cwd : undefined, context?.signal);
        return {
            models: catalog.models.map((model) => mapModel(this.provider, model, catalog.defaultModel, catalog.thinkingOptions, catalog.defaultThinkingOption)),
            modes: catalog.modes.map((mode) => ({ ...mode })),
            defaultModeId: catalog.defaultMode,
        };
    }
    async isAvailable(signal) {
        signal?.throwIfAborted();
        return await this.runtime.isAvailable();
    }
    async getDiagnostic() {
        const status = await this.runtime.status();
        return { diagnostic: status.diagnostic ?? "Provider is available" };
    }
    async listImportableSessions(options = {}) {
        const sessions = await this.runtime.listSessions({
            query: options.query,
            cwd: options.cwd,
            limit: options.limit,
        });
        return sessions.map((session) => ({
            providerHandleId: encodePersistence(session.persistence),
            cwd: session.cwd,
            title: session.title ?? null,
            firstPromptPreview: null,
            lastPromptPreview: session.description ?? null,
            lastActivityAt: parseProviderDate(session.updatedAt),
        }));
    }
    async importSession(input, context) {
        const session = await this.openSession({
            config: { ...context.config, provider: this.provider, cwd: input.cwd },
            launchContext: context.launchContext,
            persistence: decodePersistenceId(input.providerHandleId),
            history: "replay",
            persist: true,
        });
        const persistence = session.describePersistence();
        if (!persistence)
            throw new Error(`Plugin provider '${this.provider}' did not persist import`);
        return {
            session,
            config: { ...context.storedConfig, provider: this.provider, cwd: input.cwd },
            persistence,
            timeline: session.timelineHistory(),
            providerSubagentEvents: session.subagentHistory(),
        };
    }
    async archiveNativeSession(handle) {
        await this.runtime.archive(decodePersistence(handle));
    }
    async unarchiveNativeSession(handle) {
        await this.runtime.unarchive(decodePersistence(handle));
    }
    async shutdown() {
        await this.runtime.close();
    }
    async openSession(input) {
        const sessionId = randomUUID();
        const bridge = await this.runtime.openSession({
            sessionId,
            config: mapSessionConfig(input.config, input.launchContext, input.persist),
            persistence: input.persistence,
            history: input.history,
        });
        const forget = () => {
            for (const [id, owner] of this.rootsBySession) {
                if (owner === session)
                    this.rootsBySession.delete(id);
            }
        };
        const bind = (next) => {
            this.rootsBySession.set(next.id, session);
            this.attachPendingChildren();
        };
        const config = mapSessionConfig(input.config, input.launchContext, input.persist);
        const session = new PluginAgentSession(this.provider, bridge, forget, async (persistence, state, options) => {
            forget();
            return await this.runtime.openSession({
                sessionId: randomUUID(),
                config: {
                    ...config,
                    model: state.model,
                    mode: state.mode,
                    thinkingOption: state.thinkingOption,
                    settings: options,
                    providerOptions: options,
                },
                persistence,
                history: "replay",
            });
        }, bind, config.settings);
        bind(bridge);
        return session;
    }
    acceptChild(session, opened) {
        const root = opened.parentSessionId
            ? this.rootsBySession.get(opened.parentSessionId)
            : undefined;
        if (!root) {
            this.pendingChildren.push({ session, opened });
            return;
        }
        root.attachChild(session, opened);
        this.rootsBySession.set(session.id, root);
        this.attachPendingChildren();
    }
    attachPendingChildren() {
        let attached = true;
        while (attached) {
            attached = false;
            for (let index = this.pendingChildren.length - 1; index >= 0; index -= 1) {
                const pending = this.pendingChildren[index];
                const root = pending.opened.parentSessionId
                    ? this.rootsBySession.get(pending.opened.parentSessionId)
                    : undefined;
                if (!root)
                    continue;
                this.pendingChildren.splice(index, 1);
                root.attachChild(pending.session, pending.opened);
                this.rootsBySession.set(pending.session.id, root);
                attached = true;
            }
        }
    }
}
function isTextSnapshotItem(item) {
    return (item.type === "assistant_message" || item.type === "reasoning" || item.type === "user_message");
}
class PluginAgentSession {
    constructor(provider, bridge, onClose, reopen, onBind, givenOptions) {
        this.provider = provider;
        this.bridge = bridge;
        this.onClose = onClose;
        this.reopen = reopen;
        this.onBind = onBind;
        this.listeners = new Set();
        this.history = new PluginSessionHistory();
        this.pendingPermissions = new Map();
        this.permissionResponses = new Map();
        this.revertTokens = new Map();
        this.timelineSnapshots = new Map();
        this.subagentIdsBySession = new Map();
        this.children = new Map();
        this.childSnapshots = new Map();
        this.unsubscribe = null;
        this.knownOptions = {};
        /** While `applyOptions` waits on the plugin, its `session.config` answers that call. */
        this.applyingOptions = false;
        this.currentTurnId = null;
        this.closed = false;
        this.replay = null;
        this.replaying = null;
        this.subagentIdsBySession.set(bridge.id, null);
        // Every setting the session opened with that was not given, including ones nobody set.
        this.committedOptions = { ...givenOptions };
        this.openOptionsPatch = this.optionDifferences(givenOptions);
        this.commitOptions();
        for (const event of bridge.history)
            this.accept(event, false);
        // Opening notices arrive before the manager subscribes to the session.
        // Commit them on registration and replay the same timestamps from history.
        this.initialTimeline = this.timelineHistory().filter((entry) => entry.item.type === "notification");
        this.unsubscribe = bridge.onEvent((event) => this.accept(event, true));
    }
    get id() {
        return this.describePersistence()?.sessionId ?? this.bridge.id;
    }
    get capabilities() {
        const capabilities = agentCapabilities(this.bridge.negotiatedCapabilities);
        const resumable = this.canReplayHistory;
        return {
            ...capabilities,
            supportsRewindConversation: capabilities.supportsRewindConversation && resumable,
            supportsRewindBoth: capabilities.supportsRewindBoth && resumable,
        };
    }
    get controls() {
        return readPluginOptionState(this.bridge.config).controls;
    }
    async run(prompt, options) {
        return await runProviderTurn({
            prompt,
            runOptions: options,
            startTurn: (nextPrompt, nextOptions) => this.startTurn(nextPrompt, nextOptions),
            subscribe: (callback) => this.subscribe(callback),
            getSessionId: () => this.id,
        });
    }
    async startTurn(prompt, options = {}) {
        this.assertReplayComplete();
        const clientMessageId = options.clientMessageId ?? randomUUID();
        const result = await this.bridge.prompt({
            clientMessageId,
            delivery: "auto",
            input: mapPromptInput(prompt, this.bridge.commands),
            ...(options.outputSchema === undefined
                ? {}
                : { outputSchema: toJsonValue(options.outputSchema, "output schema") }),
        });
        if (result.type === "failed")
            throw providerError(result.error);
        if (result.type === "turn" || result.type === "steer")
            return { turnId: result.turnId };
        const turnId = `command-${clientMessageId}`;
        this.publish({ type: "turn_started", provider: this.provider, turnId });
        this.publish({ type: "turn_completed", provider: this.provider, turnId });
        return { turnId };
    }
    async steerActiveTurn(prompt, options) {
        this.assertReplayComplete();
        if (!this.bridge.negotiatedCapabilities.includes("prompt.steer")) {
            return { status: "unavailable" };
        }
        const result = await this.bridge.prompt({
            clientMessageId: options.clientMessageId ?? randomUUID(),
            delivery: "steer",
            input: { type: "message", content: mapPromptContent(prompt) },
            ...(options.outputSchema === undefined
                ? {}
                : { outputSchema: toJsonValue(options.outputSchema, "output schema") }),
            clearPendingPermissions: options.clearPendingPermissions,
        });
        return result.type === "steer" && result.turnId === options.expectedTurnId
            ? { status: "accepted" }
            : { status: "unavailable" };
    }
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
    async *streamHistory() {
        await this.ensureReplay();
        for (const event of this.history.read(this.provider))
            yield event;
    }
    get canStopRuntime() {
        if (!this.bridge.negotiatedCapabilities.includes("session.can_stop_runtime"))
            return undefined;
        return () => this.bridge.canStopRuntime();
    }
    async getRuntimeInfo() {
        return {
            provider: this.provider,
            sessionId: this.id,
            model: this.bridge.config.model ?? null,
            modeId: this.bridge.config.mode ?? null,
            thinkingOptionId: this.bridge.config.thinkingOption ?? null,
        };
    }
    async getAvailableModes() {
        return this.bridge.config.modes.map((mode) => ({ ...mode }));
    }
    async getCurrentMode() {
        return this.bridge.config.mode ?? null;
    }
    async setMode(modeId) {
        this.assertReplayComplete();
        await this.bridge.configure({ mode: modeId });
    }
    getPendingPermissions() {
        return [...this.pendingPermissions.values()];
    }
    async respondToPermission(requestId, response) {
        this.permissionResponses.set(requestId, response);
        try {
            await this.bridge.respondToPermission(requestId, toJsonValue(response, "permission response"));
        }
        catch (error) {
            this.permissionResponses.delete(requestId);
            throw error;
        }
    }
    describePersistence() {
        return this.bridge.persistence
            ? persistenceHandle(this.provider, this.bridge.persistence)
            : null;
    }
    async interrupt() {
        await this.bridge.interrupt();
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.listeners.clear();
        await this.replaying?.catch(() => undefined);
        await this.clearBinding();
        this.replay = null;
        this.listeners.clear();
        this.onClose();
        await this.bridge.close();
    }
    async listCommands() {
        return this.bridge.commands.map((command) => ({
            ...command,
            argumentHint: command.argumentHint ?? "",
            kind: "command",
        }));
    }
    async setModel(modelId) {
        this.assertReplayComplete();
        await this.bridge.configure({ model: modelId });
        return { model: this.bridge.config.model ?? null };
    }
    async setThinkingOption(thinkingOptionId) {
        this.assertReplayComplete();
        await this.bridge.configure({ thinkingOption: thinkingOptionId });
    }
    /** The agent manager sends one apply at a time per session. */
    async applyOptions(options) {
        this.assertReplayComplete();
        const before = this.currentOptions();
        const { legacySettings } = readPluginOptionState(this.bridge.config);
        // The plugin applies every key it is given or rejects the whole request.
        const settings = {};
        for (const [id, value] of Object.entries(options)) {
            settings[id] = toJsonValue(value, `option '${id}'`);
        }
        if (Object.keys(settings).length === 0)
            return {};
        this.applyingOptions = true;
        try {
            // COMPAT(plugin-provider-settings): added in v0.15.0, remove after 2027-05-01. A plugin
            // reporting `settings` is sent the same keys under that name.
            await this.bridge.configure({
                providerOptions: settings,
                ...(legacySettings ? { settings } : {}),
            });
        }
        catch (error) {
            // Nothing is stored for a refused patch, so what the plugin moved is reported once the
            // call has ended.
            this.applyingOptions = false;
            for (const event of this.reportOptionChanges())
                this.publish(event);
            throw error;
        }
        finally {
            this.applyingOptions = false;
        }
        // A requested key is a request, not a report: only a key the plugin reported before can be
        // one it has now dropped.
        const ended = this.optionChanges({ ...before, ...settings }, before);
        this.commitOptions(settings);
        return ended;
    }
    async revertConversation(input) {
        await this.revert(input.messageId, "conversation");
    }
    async revertFiles(input) {
        await this.revert(input.messageId, "files");
    }
    async revertBoth(input) {
        await this.revert(input.messageId, "both");
    }
    timelineHistory() {
        return this.history
            .read(this.provider)
            .flatMap((event) => event.type === "timeline" ? [{ item: event.item, timestamp: event.timestamp }] : []);
    }
    subagentHistory() {
        return this.history
            .read(this.provider)
            .filter((event) => event.type === "provider_subagent");
    }
    attachChild(child, opened) {
        const parentSubagentId = opened.parentSessionId
            ? this.subagentIdsBySession.get(opened.parentSessionId)
            : undefined;
        if (parentSubagentId === undefined) {
            throw new Error(`Missing plugin child parent ${opened.parentSessionId}`);
        }
        const childId = child.providerId;
        this.subagentIdsBySession.set(child.id, childId);
        this.publish({
            type: "provider_subagent",
            provider: this.provider,
            event: {
                type: "upsert",
                id: childId,
                parentSubagentId,
                toolCallId: opened.toolCallId ?? null,
                title: opened.title ?? null,
                description: opened.description ?? null,
                status: "running",
                cwd: opened.cwd,
            },
        });
        const snapshots = new Map();
        this.childSnapshots.set(childId, snapshots);
        for (const event of child.history)
            this.acceptChildEvent(childId, event, snapshots);
        this.children.set(child.id, {
            session: child,
            unsubscribe: child.onEvent((event) => this.acceptChildEvent(childId, event, snapshots)),
        });
    }
    accept(event, live) {
        const translated = this.translate(event);
        for (const next of translated) {
            this.history.push(next);
            if (live)
                this.emit(next);
        }
    }
    translate(event) {
        switch (event.type) {
            case "session.turn":
                return [this.translateTurn(event)];
            case "session.usage":
                return [
                    {
                        type: "usage_updated",
                        provider: this.provider,
                        usage: { ...event.usage },
                        turnId: event.turnId,
                    },
                ];
            case "timeline.item":
                return this.translateTimeline(event);
            case "session.permission":
                return [this.translatePermission(event)];
            case "session.permission_resolved":
                return [this.translatePermissionResolution(event)];
            case "session.config":
                return this.translateConfig(event);
            case "session.notice":
                return this.translateNotice(event);
            case "session.runtime_failed":
                return [this.translateFailure(event.error)];
            case "session.closed":
                return event.error ? [this.translateFailure(event.error)] : [];
            default:
                return [];
        }
    }
    translateTurn(event) {
        if (event.state === "started") {
            this.currentTurnId = event.turnId;
            return { type: "turn_started", provider: this.provider, turnId: event.turnId };
        }
        if (this.currentTurnId === event.turnId)
            this.currentTurnId = null;
        if (event.state === "completed") {
            return { type: "turn_completed", provider: this.provider, turnId: event.turnId };
        }
        if (event.state === "canceled") {
            return {
                type: "turn_canceled",
                provider: this.provider,
                turnId: event.turnId,
                reason: event.error?.message ?? "Canceled by provider",
            };
        }
        return {
            type: "turn_failed",
            provider: this.provider,
            turnId: event.turnId,
            error: event.error?.message ?? "Provider turn failed",
            code: event.error?.code,
            diagnostic: event.error?.diagnostic,
        };
    }
    translateTimeline(event) {
        const item = mapTimelineItem(event.item, this.timelineSnapshots, this.revertTokens);
        return item
            ? [
                {
                    type: "timeline",
                    provider: this.provider,
                    item,
                    turnId: this.currentTurnId ?? undefined,
                    timestamp: event.timestamp,
                },
            ]
            : [];
    }
    translatePermission(event) {
        const request = { ...event.request, provider: this.provider };
        this.pendingPermissions.set(request.id, request);
        return {
            type: "permission_requested",
            provider: this.provider,
            request,
            turnId: this.currentTurnId ?? undefined,
        };
    }
    translatePermissionResolution(event) {
        this.pendingPermissions.delete(event.permissionId);
        const resolution = this.permissionResponses.get(event.permissionId) ?? {
            behavior: "deny",
            message: "Resolved by provider",
        };
        this.permissionResponses.delete(event.permissionId);
        return {
            type: "permission_resolved",
            provider: this.provider,
            requestId: event.permissionId,
            resolution,
            turnId: this.currentTurnId ?? undefined,
        };
    }
    currentOptions() {
        return readPluginOptionState(this.bridge.config).options;
    }
    /** Options whose value differs from `known`: the plugin's own change or its opening state. */
    optionDifferences(known) {
        const patch = {};
        for (const [id, value] of Object.entries(this.currentOptions())) {
            if (!isDeepStrictEqual(known[id], value))
                patch[id] = value;
        }
        return patch;
    }
    /**
     * Settle the options a reopened session starts with: what is committed, then the request the
     * plugin accepted, then what it reported back. A key it reported before and no longer reports
     * was reset.
     */
    commitOptions(accepted = {}) {
        for (const [id, value] of Object.entries(accepted)) {
            if (value === null)
                delete this.committedOptions[id];
            else
                this.committedOptions[id] = value;
        }
        const current = this.currentOptions();
        for (const id of Object.keys(this.knownOptions)) {
            if (!(id in current))
                delete this.committedOptions[id];
        }
        Object.assign(this.committedOptions, current);
        this.knownOptions = current;
    }
    /**
     * What changed against the options `known` to be set: values that differ, and `null` for a key
     * in `reported` that the plugin no longer reports, which went back to its default.
     */
    optionChanges(known, reported) {
        const patch = this.optionDifferences(known);
        const current = this.currentOptions();
        for (const id of Object.keys(reported)) {
            if (known[id] !== null && !(id in current))
                patch[id] = null;
        }
        return patch;
    }
    reportOptionChanges() {
        if (this.applyingOptions)
            return [];
        const patch = this.optionChanges(this.knownOptions, this.knownOptions);
        if (Object.keys(patch).length === 0)
            return [];
        this.commitOptions();
        return [{ type: "options_changed", provider: this.provider, patch }];
    }
    translateConfig(event) {
        return [
            ...this.reportOptionChanges(),
            {
                type: "mode_changed",
                provider: this.provider,
                currentModeId: event.config.mode ?? null,
                availableModes: event.config.modes.map((mode) => ({ ...mode })),
            },
            {
                type: "model_changed",
                provider: this.provider,
                runtimeInfo: {
                    provider: this.provider,
                    sessionId: this.id,
                    model: event.config.model ?? null,
                    modeId: event.config.mode ?? null,
                    thinkingOptionId: event.config.thinkingOption ?? null,
                },
            },
            {
                type: "thinking_option_changed",
                provider: this.provider,
                thinkingOptionId: event.config.thinkingOption ?? null,
            },
        ];
    }
    translateNotice(event) {
        if (event.notice.dismissed)
            return [];
        return [
            {
                type: "timeline",
                provider: this.provider,
                timestamp: new Date().toISOString(),
                item: {
                    type: "notification",
                    level: event.notice.severity,
                    message: [event.notice.title, event.notice.description].filter(Boolean).join("\n"),
                },
                turnId: this.currentTurnId ?? undefined,
            },
        ];
    }
    translateFailure(error) {
        return {
            type: "turn_failed",
            provider: this.provider,
            turnId: this.currentTurnId ?? undefined,
            error: error.message,
            code: error.code,
            diagnostic: error.diagnostic,
        };
    }
    acceptChildEvent(childId, event, snapshots) {
        if (event.type === "timeline.item") {
            const item = mapTimelineItem(event.item, snapshots);
            if (item) {
                this.publish({
                    type: "provider_subagent",
                    provider: this.provider,
                    event: { type: "timeline", id: childId, item, timestamp: event.timestamp },
                });
            }
            return;
        }
        if (event.type === "session.turn") {
            this.publish({
                type: "provider_subagent",
                provider: this.provider,
                event: {
                    type: "upsert",
                    id: childId,
                    status: event.state === "started" ? "running" : event.state,
                },
            });
            return;
        }
        if (event.type === "session.runtime_failed" || event.type === "session.closed") {
            this.publish({
                type: "provider_subagent",
                provider: this.provider,
                event: {
                    type: "upsert",
                    id: childId,
                    status: event.type === "session.runtime_failed" || event.error ? "failed" : "completed",
                },
            });
        }
    }
    async clearBinding() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        for (const child of this.children.values()) {
            child.unsubscribe();
            await child.session.close();
        }
        this.children.clear();
        this.subagentIdsBySession.clear();
        this.history.clear();
        this.timelineSnapshots.clear();
        this.childSnapshots.clear();
        this.revertTokens.clear();
        this.pendingPermissions.clear();
        this.permissionResponses.clear();
        this.currentTurnId = null;
    }
    assertReplayComplete() {
        if (this.replay) {
            throw new Error("Plugin rewind history refresh is incomplete. Retry the rewind or reload the agent before continuing.");
        }
    }
    // A native rewind has already committed. Until replay succeeds, neither history
    // nor a new prompt may use the retired binding. Keep its latest handle for retry.
    async ensureReplay() {
        if (!this.replay)
            return;
        if (this.closed)
            throw new StaleProviderSessionError(this.id);
        if (!this.replaying) {
            this.replaying = this.replayBinding().finally(() => {
                this.replaying = null;
            });
        }
        await this.replaying;
    }
    async replayBinding() {
        const replay = this.replay;
        if (!replay.closed) {
            for (const request of this.pendingPermissions.values()) {
                await this.respondToPermission(request.id, {
                    behavior: "deny",
                    message: "Session replaced after rewind",
                });
                this.pendingPermissions.delete(request.id);
                this.permissionResponses.delete(request.id);
            }
            await this.clearBinding();
            await this.bridge.close();
            replay.closed = true;
        }
        const bridge = await this.reopen(replay.persistence, replay.config, this.committedOptions);
        this.bridge = bridge;
        this.subagentIdsBySession.set(bridge.id, null);
        for (const event of bridge.history)
            this.accept(event, false);
        this.unsubscribe = bridge.onEvent((event) => this.accept(event, true));
        this.onBind(bridge);
        this.replay = null;
    }
    get canReplayHistory() {
        return (this.bridge.restoration === "core" &&
            this.bridge.persistence !== null &&
            this.bridge.negotiatedCapabilities.includes("session.persistence"));
    }
    async revert(messageId, scope) {
        const pending = this.replay;
        await this.ensureReplay();
        if (pending?.messageId === messageId && pending.scope === scope)
            return;
        if (scope !== "files" && !this.canReplayHistory) {
            throw new Error("Plugin conversation rewind requires session persistence for history replay");
        }
        const token = this.revertTokens.get(messageId);
        if (token === undefined)
            throw new Error(`No provider revert token for message ${messageId}`);
        await this.bridge.revert({
            type: "session.revert",
            requestId: randomUUID(),
            sessionId: this.bridge.providerId,
            token,
            scope,
        });
        if (scope !== "files") {
            const persistence = this.bridge.persistence;
            if (!persistence)
                throw new Error("Plugin rewind removed session persistence");
            this.replay = { persistence, config: this.bridge.config, messageId, scope, closed: false };
            await this.ensureReplay();
        }
    }
    publish(event) {
        this.history.push(event);
        this.emit(event);
    }
    emit(event) {
        for (const listener of this.listeners)
            listener(event);
    }
}
function agentCapabilities(capabilities) {
    const supports = (capability) => capabilities.includes(capability);
    return {
        supportsStreaming: true,
        supportsSessionPersistence: supports("session.persistence"),
        supportsSessionListing: supports("session.list"),
        supportsDynamicModes: supports("session.configure"),
        supportsMcpServers: true,
        supportsNativePaseoTools: false,
        supportsReasoningStream: true,
        supportsToolInvocations: true,
        supportsRewindConversation: supports("session.revert.conversation"),
        supportsRewindFiles: supports("session.revert.files"),
        supportsRewindBoth: supports("session.revert.both"),
    };
}
function mapModel(provider, model, defaultModel, catalogThinkingOptions, catalogDefaultThinkingOption) {
    const thinkingOptions = model.thinkingOptions ?? catalogThinkingOptions;
    return {
        ...model,
        provider,
        isDefault: model.isDefault ?? model.id === defaultModel,
        metadata: model.metadata ? { ...model.metadata } : undefined,
        thinkingOptions: thinkingOptions?.map((option) => Object.assign({}, option)),
        defaultThinkingOptionId: model.defaultThinkingOptionId ?? catalogDefaultThinkingOption,
    };
}
function mapSessionConfig(config, launchContext, persist) {
    return {
        cwd: config.cwd,
        env: createProviderEnv({ baseEnv: {}, overlays: [launchContext?.env] }),
        systemPrompt: combineSystemPrompts(config.systemPrompt, config.daemonAppendSystemPrompt),
        mcpServers: { ...config.mcpServers },
        toolPolicy: config.toolPolicy
            ? { preapproved: config.toolPolicy.preapproved.map((grant) => ({ ...grant })) }
            : undefined,
        model: config.model,
        mode: config.modeId,
        thinkingOption: config.thinkingOptionId,
        // The plugin SDK reads composer values from `settings`; they are options here.
        settings: toJsonObject(config.providerOptions ?? {}, "provider settings"),
        providerOptions: config.providerOptions,
        title: config.title ?? undefined,
        persist,
    };
}
function combineSystemPrompts(systemPrompt, daemonPrompt) {
    const parts = [systemPrompt, daemonPrompt].filter((value) => typeof value === "string" && value.trim().length > 0);
    return parts.length > 0 ? parts.join("\n\n") : undefined;
}
function mapPromptInput(prompt, commands) {
    if (typeof prompt === "string" && prompt.startsWith("/")) {
        const separator = prompt.indexOf(" ");
        const name = prompt.slice(1, separator === -1 ? undefined : separator);
        if (commands.some((command) => command.name === name)) {
            return {
                type: "command",
                name,
                arguments: separator === -1 ? "" : prompt.slice(separator + 1),
            };
        }
    }
    return { type: "message", content: mapPromptContent(prompt) };
}
function mapPromptContent(prompt) {
    const content = typeof prompt === "string" ? [{ type: "text", text: prompt }] : prompt;
    return toJsonValue(content, "prompt content");
}
function mapTimelineItem(item, snapshots, revertTokens) {
    const previous = snapshots.get(item.id);
    if (isTextSnapshotItem(item)) {
        snapshots.set(item.id, { type: item.type, text: item.text });
    }
    const { id, revertToken: _revertToken, ...withoutIdentity } = item;
    rememberRevertToken(item, revertTokens);
    if (item.type === "assistant_message" || item.type === "reasoning") {
        const previousText = previous?.type === item.type ? previous.text : "";
        const suffix = item.text.startsWith(previousText)
            ? item.text.slice(previousText.length)
            : item.text;
        // Match OpenCode's detachedSuffix: a sliced delta otherwise keeps its entire
        // cumulative IPC snapshot alive in the projected timeline. Preserve split surrogates.
        const text = Buffer.from(suffix, "utf16le").toString("utf16le");
        if (text.length === 0)
            return null;
        return item.type === "assistant_message"
            ? { type: "assistant_message", text, messageId: item.messageId ?? id }
            : { type: "reasoning", text };
    }
    if (item.type === "user_message") {
        if (previous?.type === "user_message" && previous.text === item.text)
            return null;
        return {
            type: "user_message",
            text: item.text,
            messageId: item.messageId ?? id,
            clientMessageId: item.clientMessageId,
        };
    }
    if (item.type === "plugin") {
        return {
            type: "plugin",
            id,
            pluginId: item.pluginId,
            kind: item.kind,
            version: item.version,
            data: item.data,
        };
    }
    return withoutIdentity;
}
function rememberRevertToken(item, tokens) {
    if (item.revertToken === undefined || !tokens)
        return;
    tokens.set(item.id, item.revertToken);
    if (item.type === "user_message" || item.type === "assistant_message") {
        tokens.set(item.messageId ?? item.id, item.revertToken);
    }
}
function persistenceHandle(provider, persistence) {
    return {
        provider,
        sessionId: encodePersistence(persistence),
        metadata: { pluginProviderPersistence: persistence },
    };
}
function encodePersistence(persistence) {
    return `plugin:${JSON.stringify(persistence)}`;
}
function decodePersistence(handle) {
    const fromMetadata = handle.metadata?.pluginProviderPersistence;
    if (fromMetadata !== undefined) {
        return ProviderPersistenceSchema.parse(fromMetadata);
    }
    return decodePersistenceId(handle.sessionId);
}
const ProviderPersistenceSchema = z
    .object({ version: z.number().int().nonnegative(), data: z.json() })
    .strict();
function decodePersistenceId(id) {
    if (!id.startsWith("plugin:"))
        throw new Error("Invalid plugin provider persistence handle");
    return ProviderPersistenceSchema.parse(JSON.parse(id.slice("plugin:".length)));
}
function parseProviderDate(value) {
    const timestamp = value ? Date.parse(value) : Number.NaN;
    return new Date(Number.isFinite(timestamp) ? timestamp : 0);
}
function toJsonObject(value, label) {
    const encoded = toJsonValue(value, label);
    if (typeof encoded !== "object" || encoded === null || Array.isArray(encoded)) {
        throw new Error(`${label} must be a JSON object`);
    }
    return encoded;
}
function toJsonValue(value, label) {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
        throw new Error(`${label} must be JSON-serializable`);
    return JSON.parse(encoded);
}
//# sourceMappingURL=plugin-provider.js.map