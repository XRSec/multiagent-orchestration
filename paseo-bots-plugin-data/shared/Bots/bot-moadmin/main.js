"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const console_streams_js_1 = require("./diagnostics/console-streams.js");
(0, console_streams_js_1.protectConsoleStreams)();
process.emitWarning = (() => { });
const main_1 = __importDefault(require("electron-log/main"));
main_1.default.transports.console.level = "info";
main_1.default.initialize({ spyRendererConsole: true });
const login_shell_env_js_1 = require("./login-shell-env.js");
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const electron_1 = require("electron");
const daemon_manager_js_1 = require("./daemon/daemon-manager.js");
const passthrough_js_1 = require("./daemon/cli/passthrough.js");
const local_transport_js_1 = require("./daemon/local-transport.js");
const window_manager_js_1 = require("./window/window-manager.js");
const index_js_1 = require("./window/compositor-watchdog/index.js");
const show_when_ready_js_1 = require("./window/show-when-ready.js");
const chrome_js_1 = require("./window/chrome.js");
const dialogs_js_1 = require("./features/dialogs.js");
const notifications_js_1 = require("./features/notifications.js");
const opener_js_1 = require("./features/opener.js");
const browser_capture_js_1 = require("./features/browser-capture.js");
const ipc_js_1 = require("./features/editor-targets/ipc.js");
const stamped_icon_js_1 = require("./features/stamped-icon.js");
const menu_js_1 = require("./features/menu.js");
const index_js_2 = require("./features/browser-webviews/index.js");
const browser_profile_js_1 = require("./features/browser-profile.js");
const open_project_routing_js_1 = require("./open-project-routing.js");
const desktop_window_owner_js_1 = require("./window/desktop-window-owner.js");
const desktop_settings_electron_js_1 = require("./settings/desktop-settings-electron.js");
const window_state_js_1 = require("./settings/window-state.js");
const daemon_manager_js_2 = require("./daemon/daemon-manager.js");
const quit_lifecycle_js_1 = require("./daemon/quit-lifecycle.js");
const desktop_startup_js_1 = require("./desktop-startup.js");
const ipc_js_2 = require("./features/browser-automation/ipc.js");
const index_js_3 = require("./features/browser-keyboard/index.js");
const auto_updater_js_1 = require("./features/auto-updater.js");
const agent_deep_link_1 = require("@getpaseo/protocol/agent-deep-link");
const agent_navigation_js_1 = require("./agent-navigation.js");
const DEV_SERVER_URL = process.env.EXPO_DEV_URL ?? "http://localhost:8081";
const APP_SCHEME = "paseo";
const PASEO_DEBUG = process.env.PASEO_DEBUG === "1";
const DISABLE_SINGLE_INSTANCE_LOCK = process.env.PASEO_DISABLE_SINGLE_INSTANCE_LOCK === "1";
const APP_NAME = process.env.PASEO_TEST_APP_NAME?.trim() || "Paseo";
const DESKTOP_WINDOW_CHROME_MODE = (0, chrome_js_1.resolveDesktopWindowChromeMode)({
    platform: process.platform,
    override: process.env.PASEO_DESKTOP_WINDOW_CONTROLS,
    isPackaged: electron_1.app.isPackaged,
});
const UPDATE_QUIT_DEADLINE_MS = 5_000;
const pendingBrowserWindowOpenRequests = new index_js_2.PendingBrowserWindowOpenRequests();
const agentNavigationInbox = new agent_navigation_js_1.AgentNavigationInbox();
// A second-instance launch can arrive before the packaged protocol handler,
// IPC handlers, and first window exist. Wait for full bootstrap, not just
// app.whenReady(), before delivering navigation to the renderer.
let resolveBootstrapComplete;
const bootstrapComplete = new Promise((resolve) => {
    resolveBootstrapComplete = resolve;
});
let bootstrapIsComplete = false;
electron_1.app.setName(APP_NAME);
main_1.default.info("[desktop] app startup", {
    version: electron_1.app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: electron_1.app.isPackaged,
});
function readAttachedBrowserInput(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return null;
    }
    const record = input;
    if (typeof record.browserId !== "string" || record.browserId.trim().length === 0) {
        return null;
    }
    if (typeof record.workspaceId !== "string" || record.workspaceId.trim().length === 0) {
        return null;
    }
    if (typeof record.webContentsId !== "number" ||
        !Number.isInteger(record.webContentsId) ||
        record.webContentsId <= 0) {
        return null;
    }
    return {
        browserId: record.browserId.trim(),
        workspaceId: record.workspaceId.trim(),
        webContentsId: record.webContentsId,
    };
}
function readActiveBrowserInput(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return null;
    }
    const record = input;
    if (typeof record.workspaceId !== "string" || record.workspaceId.trim().length === 0) {
        return null;
    }
    const browserId = typeof record.browserId === "string" ? record.browserId.trim() : null;
    return { workspaceId: record.workspaceId.trim(), browserId: browserId || null };
}
const browserKeyboard = new index_js_3.BrowserKeyboard((0, index_js_2.getPaseoBrowserWebviewRegistry)());
browserKeyboard.registerIpc();
function showBrowserWebviewContextMenu(win, contents, params) {
    const menu = electron_1.Menu.buildFromTemplate([
        ...(0, window_manager_js_1.buildStandardContextMenuItems)(contents, params),
        ...(electron_1.app.isPackaged
            ? []
            : [
                { type: "separator" },
                {
                    label: "Inspect Element",
                    click: () => {
                        main_1.default.info("[browser-devtools] inspect-element.request", {
                            webContentsId: contents.id,
                            browserId: (0, index_js_2.getPaseoBrowserIdForWebContents)(contents),
                            x: params.x,
                            y: params.y,
                            isDevToolsOpened: contents.isDevToolsOpened(),
                        });
                        contents.openDevTools({ mode: "detach" });
                        contents.inspectElement(params.x, params.y);
                        main_1.default.info("[browser-devtools] inspect-element.done", {
                            webContentsId: contents.id,
                            isDevToolsOpened: contents.isDevToolsOpened(),
                        });
                    },
                },
            ]),
    ]);
    menu.popup({ window: win });
}
function getBrowserPopupWindowOptions(mainWindow) {
    return {
        parent: mainWindow,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
            partition: browser_profile_js_1.PASEO_BROWSER_PROFILE_PARTITION,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            nodeIntegrationInWorker: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            webviewTag: false,
            allowRunningInsecureContent: false,
        },
    };
}
function installBrowserWindowOpenHandler(input) {
    const { contents, sourceContents, mainWindow } = input;
    contents.setWindowOpenHandler(({ url, disposition, frameName, features, postBody }) => {
        const decision = (0, index_js_2.decideBrowserWindowOpenRequest)({
            url,
            disposition,
            frameName,
            features,
            hasPostBody: postBody !== undefined && postBody !== null,
        });
        if (decision.kind === "deny") {
            return { action: "deny" };
        }
        if (decision.kind === "popup") {
            return {
                action: "allow",
                overrideBrowserWindowOptions: getBrowserPopupWindowOptions(mainWindow),
            };
        }
        const sourceBrowserId = (0, index_js_2.getPaseoBrowserIdForWebContents)(sourceContents);
        if (sourceBrowserId) {
            mainWindow.webContents.send(index_js_2.BROWSER_NEW_TAB_REQUEST_EVENT, {
                sourceBrowserId,
                url: decision.url,
            });
        }
        else {
            pendingBrowserWindowOpenRequests.add(sourceContents.id, decision.url);
        }
        return { action: "deny" };
    });
    contents.on("did-create-window", (popupWindow) => {
        const popupContents = popupWindow.webContents;
        (0, index_js_2.registerBrowserWebviewNavigationGuards)(popupContents);
        popupContents.on("context-menu", (_event, params) => {
            showBrowserWebviewContextMenu(popupWindow, popupContents, params);
        });
        installBrowserWindowOpenHandler({
            contents: popupContents,
            sourceContents,
            mainWindow,
        });
    });
}
// In dev mode, detect git worktrees and isolate each instance so multiple
// Electron windows can run side-by-side (separate userData = separate lock).
let devWorktreeName = null;
const forcedUserDataDir = process.env.PASEO_ELECTRON_USER_DATA_DIR?.trim();
if (forcedUserDataDir) {
    electron_1.app.setPath("userData", forcedUserDataDir);
    main_1.default.info("[dev-user-data] forced userData dir:", forcedUserDataDir);
}
else if (!electron_1.app.isPackaged) {
    try {
        const topLevel = (0, node_child_process_1.execFileSync)("git", ["rev-parse", "--show-toplevel"], {
            encoding: "utf-8",
            timeout: 3000,
            windowsHide: true,
        }).trim();
        devWorktreeName = node_path_1.default.basename(topLevel);
        // Main checkout (e.g. "paseo") gets default userData — only worktrees diverge.
        const commonDir = node_path_1.default.resolve(topLevel, (0, node_child_process_1.execFileSync)("git", ["rev-parse", "--git-common-dir"], {
            cwd: topLevel,
            encoding: "utf-8",
            timeout: 3000,
            windowsHide: true,
        }).trim());
        const isWorktree = node_path_1.default.resolve(topLevel, ".git") !== commonDir;
        if (isWorktree) {
            electron_1.app.setPath("userData", node_path_1.default.join(electron_1.app.getPath("appData"), `Paseo-${devWorktreeName}`));
            main_1.default.info("[worktree] isolated userData for worktree:", devWorktreeName);
        }
        else {
            devWorktreeName = null;
        }
    }
    catch {
        devWorktreeName = null;
    }
}
// Allow users to pass Chromium flags via PASEO_ELECTRON_FLAGS for debugging
// rendering issues (e.g. "--disable-gpu --ozone-platform=x11").
// Must run before app.whenReady().
const electronFlags = process.env.PASEO_ELECTRON_FLAGS?.trim();
if (electronFlags) {
    for (const token of electronFlags.split(/\s+/)) {
        const [key, ...rest] = token.replace(/^--/, "").split("=");
        electron_1.app.commandLine.appendSwitch(key, rest.join("=") || undefined);
    }
    main_1.default.info("[electron-flags]", electronFlags);
}
if (process.platform === "linux") {
    // Keep the desktop/dock identity independent of the wrapped Electron filename.
    electron_1.app.setDesktopName("Paseo.desktop");
    if (!electron_1.app.commandLine.hasSwitch("class"))
        electron_1.app.commandLine.appendSwitch("class", "Paseo");
    main_1.default.info("[linux-sandbox]", {
        enabled: !electron_1.app.commandLine.hasSwitch("no-sandbox"),
        reason: process.env.PASEO_DESKTOP_SANDBOX_REASON ?? "Chromium default",
    });
}
let pendingOpenProjectPath = (0, open_project_routing_js_1.parseOpenProjectPathFromArgv)({
    argv: process.argv,
    isDefaultApp: process.defaultApp,
});
let pendingAgentNavigation = (0, agent_navigation_js_1.parseAgentDeepLinkFromArgv)(process.argv);
// Each window pulls its own pending open-project path on mount, keyed by
// webContents id, so deep-linked windows (second-instance launches, the
// in-app "Open in new window" action) land on the right project without
// racing a global.
let desktopWindowOwner;
if (PASEO_DEBUG) {
    main_1.default.info("[open-project] argv:", process.argv);
    main_1.default.info("[open-project] isDefaultApp:", process.defaultApp);
    main_1.default.info("[open-project] pendingOpenProjectPath:", pendingOpenProjectPath);
}
// The renderer pulls the pending path on mount via IPC — this avoids
// a race where the push event arrives before React registers its listener.
electron_1.ipcMain.handle("paseo:get-pending-open-project", (event) => {
    const webContentsId = event.sender.id;
    const result = desktopWindowOwner.takePendingProject(webContentsId);
    main_1.default.info("[open-project] renderer requested pending path:", {
        webContentsId,
        pendingPath: result,
    });
    return result;
});
electron_1.ipcMain.handle("paseo:agent-navigation:ready", (event) => {
    return agentNavigationInbox.windowReady(event.sender.id);
});
electron_1.ipcMain.handle("paseo:browser:register-attached", (event, rawInput) => {
    const input = readAttachedBrowserInput(rawInput);
    if (!input) {
        throw new Error("Invalid attached browser registration");
    }
    const registered = (0, index_js_2.registerAttachedPaseoBrowser)({
        ...input,
        sender: event.sender,
        profileSession: (0, browser_profile_js_1.getPaseoBrowserProfileSession)(electron_1.session),
        findWebContents: (webContentsId) => electron_1.webContents.fromId(webContentsId) ?? null,
    });
    if (!registered) {
        throw new Error("Attached browser registration was rejected");
    }
    const guest = electron_1.webContents.fromId(input.webContentsId);
    if (!guest) {
        throw new Error("Attached browser guest disappeared after registration");
    }
    browserKeyboard.attach({ contents: guest, hostContents: event.sender });
    main_1.default.info("[browser-webview] registered", {
        browserId: input.browserId,
        webContentsId: input.webContentsId,
        registeredBrowserIds: (0, index_js_2.listRegisteredPaseoBrowserIds)(),
    });
    for (const url of pendingBrowserWindowOpenRequests.take(input.webContentsId)) {
        event.sender.send(index_js_2.BROWSER_NEW_TAB_REQUEST_EVENT, {
            sourceBrowserId: input.browserId,
            url,
        });
    }
});
electron_1.ipcMain.handle("paseo:browser:unregister-workspace-browser", async (event, browserId) => {
    if (typeof browserId === "string" && browserId.trim().length > 0) {
        const normalizedBrowserId = browserId.trim();
        const hasOtherHost = (0, index_js_2.getPaseoBrowserWebviewRegistry)().hasBrowserInOtherHostWindow(event.sender.id, normalizedBrowserId);
        (0, index_js_2.unregisterPaseoBrowserFromHost)(event.sender.id, normalizedBrowserId);
        // COMPAT(browserProfile): added in v0.1.108; remove after 2027-01-15.
        const legacyProfile = hasOtherHost
            ? null
            : (0, browser_profile_js_1.getLegacyPaseoBrowserProfileSession)(electron_1.session, normalizedBrowserId);
        if (legacyProfile) {
            try {
                await (0, browser_profile_js_1.clearPaseoBrowserProfile)({
                    profileSessions: [legacyProfile],
                    listGuests: () => [],
                    logReloadError: () => { },
                });
            }
            catch (error) {
                main_1.default.warn("[browser-profile] failed to clear legacy tab profile", {
                    browserId: normalizedBrowserId,
                    error,
                });
            }
        }
    }
});
electron_1.ipcMain.handle("paseo:browser:set-workspace-active-browser", (event, rawInput) => {
    const input = readActiveBrowserInput(rawInput);
    if (input) {
        (0, index_js_2.setWorkspaceActivePaseoBrowserId)({ ...input, hostWebContentsId: event.sender.id });
    }
});
electron_1.ipcMain.handle("paseo:browser:focus", (event, browserId) => {
    if (typeof browserId !== "string" || browserId.trim().length === 0) {
        return false;
    }
    const contents = (0, index_js_2.getPaseoBrowserWebContentsForHostWindow)(browserId, event.sender.id);
    if (!contents) {
        return false;
    }
    contents.focus();
    return true;
});
electron_1.ipcMain.handle("paseo:browser:open-devtools", (event, browserId) => {
    if (typeof browserId !== "string" || browserId.trim().length === 0) {
        const result = {
            ok: false,
            reason: "invalid-browser-id",
            browserId,
            registeredBrowserIds: (0, index_js_2.listRegisteredPaseoBrowserIds)(),
        };
        main_1.default.warn("[browser-devtools] open-devtools.invalid", result);
        return result;
    }
    const contents = (0, index_js_2.getPaseoBrowserWebContentsForHostWindow)(browserId, event.sender.id);
    if (!contents) {
        const result = {
            ok: false,
            reason: "browser-webcontents-not-found",
            browserId,
            registeredBrowserIds: (0, index_js_2.listRegisteredPaseoBrowserIds)(),
        };
        main_1.default.warn("[browser-devtools] open-devtools.not-found", result);
        return result;
    }
    main_1.default.info("[browser-devtools] open-devtools.request", {
        browserId,
        webContentsId: contents.id,
        isDestroyed: contents.isDestroyed(),
        isDevToolsOpened: contents.isDevToolsOpened(),
        registeredBrowserIds: (0, index_js_2.listRegisteredPaseoBrowserIds)(),
    });
    contents.openDevTools({ mode: "detach" });
    const result = {
        ok: true,
        reason: "opened",
        browserId,
        webContentsId: contents.id,
        isDevToolsOpened: contents.isDevToolsOpened(),
    };
    main_1.default.info("[browser-devtools] open-devtools.done", result);
    return result;
});
electron_1.ipcMain.handle("paseo:browser:clear-profile", async (_event, rawLegacyBrowserIds) => {
    const profileSessions = (0, browser_profile_js_1.getPaseoBrowserProfileSessions)(electron_1.session, (0, browser_profile_js_1.readLegacyPaseoBrowserIds)(rawLegacyBrowserIds));
    const profileSession = profileSessions[0];
    await (0, browser_profile_js_1.clearPaseoBrowserProfile)({
        profileSessions,
        listGuests: () => (0, browser_profile_js_1.listPaseoBrowserProfileGuests)({
            profileSession,
            webContents: electron_1.webContents.getAllWebContents(),
        }),
        logReloadError: (webContentsId, error) => {
            main_1.default.warn("[browser-profile] failed to reload guest", { webContentsId, error });
        },
    });
});
const browserCapture = (0, browser_capture_js_1.createBrowserCaptureService)({
    findGuest: index_js_2.getPaseoBrowserWebContentsForHostWindow,
    decodeImage: (dataUrl) => electron_1.nativeImage.createFromDataURL(dataUrl),
    clipboard: {
        write: async ({ text, image }) => {
            const items = {};
            if (text)
                items["text/plain"] = text;
            if (image) {
                const png = image.toPNG();
                const bytes = new Uint8Array(png.byteLength);
                bytes.set(png);
                items["image/png"] = new Blob([bytes], { type: "image/png" });
            }
            await electron_1.clipboard.write([new electron_1.ClipboardItem(items)]);
        },
    },
    warn: (event, details) => main_1.default.warn(`[browser-capture] ${event}`, details),
});
electron_1.ipcMain.handle("paseo:browser:capture-element", (event, browserId, rect) => browserCapture.capture({ browserId, hostWebContentsId: event.sender.id, rect }));
electron_1.ipcMain.handle("paseo:browser:copy-element", (_event, payload) => browserCapture.copy(payload));
electron_1.protocol.registerSchemesAsPrivileged([
    {
        scheme: APP_SCHEME,
        privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
]);
// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
function getPreloadPath() {
    return node_path_1.default.join(__dirname, "preload.js");
}
function getBrowserKeyboardPreloadPath() {
    return node_path_1.default.join(__dirname, "features", "browser-keyboard", "guest-preload.js");
}
function getAppDistDir() {
    if (electron_1.app.isPackaged) {
        return node_path_1.default.join(process.resourcesPath, "app-dist");
    }
    return node_path_1.default.resolve(__dirname, "../../app/dist");
}
function getWindowIconCandidates() {
    if (electron_1.app.isPackaged) {
        if (process.platform === "win32") {
            return [
                node_path_1.default.join(process.resourcesPath, "icon.ico"),
                node_path_1.default.join(process.resourcesPath, "icon.png"),
            ];
        }
        return [node_path_1.default.join(process.resourcesPath, "icon.png")];
    }
    if (process.platform === "win32") {
        return [
            node_path_1.default.resolve(__dirname, "../assets/icon-dev.png"),
            node_path_1.default.resolve(__dirname, "../assets/icon.ico"),
            node_path_1.default.resolve(__dirname, "../assets/icon.png"),
        ];
    }
    return [
        node_path_1.default.resolve(__dirname, "../assets/icon-dev.png"),
        node_path_1.default.resolve(__dirname, "../assets/icon.png"),
    ];
}
function getWindowIconPath() {
    const candidates = getWindowIconCandidates();
    return candidates.find((candidate) => (0, node_fs_1.existsSync)(candidate)) ?? null;
}
function getDevBuildLabel() {
    if (electron_1.app.isPackaged) {
        return null;
    }
    return process.env.EXPO_PUBLIC_PASEO_DEV_BUILD_LABEL?.trim() || null;
}
let cachedEffectiveIconPath = null;
async function getEffectiveAppIconPath() {
    if (cachedEffectiveIconPath !== null) {
        return cachedEffectiveIconPath;
    }
    const baseIconPath = getWindowIconPath();
    if (electron_1.app.isPackaged || !baseIconPath) {
        cachedEffectiveIconPath = baseIconPath;
        return baseIconPath;
    }
    const devLabel = getDevBuildLabel();
    cachedEffectiveIconPath = await (0, stamped_icon_js_1.resolveAppIconPath)({
        isPackaged: false,
        baseIconPath,
        devLabel,
        cacheDir: electron_1.app.getPath("userData"),
    });
    return cachedEffectiveIconPath;
}
async function applyAppIcon() {
    // Packaged apps keep the bundle icon and its macOS system appearance.
    if (electron_1.app.isPackaged || process.platform !== "darwin") {
        return;
    }
    const iconPath = await getEffectiveAppIconPath();
    if (!iconPath) {
        return;
    }
    const icon = electron_1.nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
        return;
    }
    electron_1.app.dock?.setIcon(icon);
}
// Work areas with the primary display first, so window-state clamping treats
// it as the fallback. getAllDisplays() order is not guaranteed to lead with it.
function getWorkAreasPrimaryFirst() {
    const primary = electron_1.screen.getPrimaryDisplay();
    const others = electron_1.screen.getAllDisplays().filter((display) => display.id !== primary.id);
    return [primary, ...others].map((display) => display.workArea);
}
async function createWindow(options = {}) {
    const iconPath = await getEffectiveAppIconPath();
    const systemTheme = (0, window_manager_js_1.resolveSystemWindowTheme)();
    // Only the first window of a session restores and persists saved geometry.
    // Additional windows (⌘N, second-instance, "Open in new window") open at the
    // default size and let the OS cascade them, so they neither stack on top of
    // the restored window nor fight over the single window-state store.
    const restoreWindowState = options.restoreWindowState ?? false;
    const windowStateStore = restoreWindowState
        ? (0, window_state_js_1.createWindowStateStore)({ userDataPath: electron_1.app.getPath("userData") })
        : null;
    const savedWindowState = windowStateStore ? await windowStateStore.load() : null;
    const restoredWindowState = savedWindowState
        ? (0, window_state_js_1.clampWindowStateToWorkAreas)(savedWindowState, getWorkAreasPrimaryFirst())
        : null;
    const title = devWorktreeName ? `${APP_NAME} (${devWorktreeName})` : APP_NAME;
    const mainWindow = new electron_1.BrowserWindow({
        title,
        ...(0, window_manager_js_1.resolveWindowBounds)(restoredWindowState),
        show: false,
        backgroundColor: (0, window_manager_js_1.getWindowBackgroundColor)(systemTheme),
        ...(iconPath ? { icon: iconPath } : {}),
        ...(0, window_manager_js_1.getMainWindowChromeOptions)({
            mode: DESKTOP_WINDOW_CHROME_MODE,
        }),
        webPreferences: {
            preload: getPreloadPath(),
            additionalArguments: [(0, chrome_js_1.windowChromeModeArgument)(DESKTOP_WINDOW_CHROME_MODE)],
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
        },
    });
    (0, window_manager_js_1.applyDesktopWindowChromeMode)({ win: mainWindow, mode: DESKTOP_WINDOW_CHROME_MODE });
    const webContentsId = mainWindow.webContents.id;
    options.onCreated?.(webContentsId);
    mainWindow.webContents.on("did-start-navigation", (_event, _url, isSameDocument, isMainFrame) => {
        if (isMainFrame && !isSameDocument) {
            agentNavigationInbox.windowLoading(webContentsId);
        }
    });
    mainWindow.on("closed", () => {
        options.onClosed?.(webContentsId);
        agentNavigationInbox.removeWindow(webContentsId);
        (0, index_js_2.unregisterPaseoBrowserHost)(webContentsId);
        browserKeyboard.detachHost(webContentsId);
    });
    if (devWorktreeName) {
        electron_1.app.dock?.setBadge(devWorktreeName);
    }
    if (restoredWindowState?.isMaximized) {
        mainWindow.maximize();
    }
    (0, index_js_1.setupDarwinCompositorWatchdog)(mainWindow);
    (0, window_manager_js_1.setupWindowResizeEvents)(mainWindow);
    if (windowStateStore) {
        (0, window_manager_js_1.setupWindowStatePersistence)(mainWindow, windowStateStore);
    }
    (0, window_manager_js_1.setupDefaultContextMenu)(mainWindow);
    (0, window_manager_js_1.setupDragDropPrevention)(mainWindow);
    mainWindow.webContents.on("will-attach-webview", (event, webPreferences, params) => {
        if (!(0, index_js_2.isPaseoBrowserWebviewAttach)(params)) {
            event.preventDefault();
            return;
        }
        webPreferences.nodeIntegration = false;
        // The sandboxed keyboard preload must run in every frame so focused iframes keep
        // the same page-first shortcut boundary. Node integration remains disabled.
        webPreferences.nodeIntegrationInSubFrames = true;
        webPreferences.nodeIntegrationInWorker = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = true;
        webPreferences.webSecurity = true;
        webPreferences.webviewTag = false;
        webPreferences.allowRunningInsecureContent = false;
        delete webPreferences.preload;
        delete params.preload;
        delete webPreferences.preloadURL;
        delete params.preloadURL;
        webPreferences.preload = getBrowserKeyboardPreloadPath();
    });
    mainWindow.webContents.on("did-attach-webview", (_event, contents) => {
        (0, index_js_2.preparePaseoBrowserWebContents)(contents);
        contents.once("destroyed", () => {
            pendingBrowserWindowOpenRequests.delete(contents.id);
        });
        installBrowserWindowOpenHandler({
            contents,
            sourceContents: contents,
            mainWindow,
        });
        contents.on("context-menu", (_contextMenuEvent, params) => {
            showBrowserWebviewContextMenu(mainWindow, contents, params);
        });
        (0, index_js_2.registerBrowserWebviewNavigationGuards)(contents);
    });
    (0, show_when_ready_js_1.showWindowWhenReady)(mainWindow, {
        showOnLoad: process.platform === "linux",
    });
    if (!electron_1.app.isPackaged) {
        const { loadReactDevTools } = await import("./features/react-devtools.js");
        await loadReactDevTools();
        const initialUrl = options.initialRoute
            ? new URL(options.initialRoute, `${DEV_SERVER_URL}/`).toString()
            : DEV_SERVER_URL;
        await mainWindow.loadURL(initialUrl);
        return mainWindow;
    }
    await mainWindow.loadURL(`${APP_SCHEME}://app${options.initialRoute ?? "/"}`);
    return mainWindow;
}
function ownedDesktopWindow(win) {
    return {
        webContentsId: win.webContents.id,
        isDestroyed: () => win.isDestroyed(),
        isVisible: () => win.isVisible(),
        isMinimized: () => win.isMinimized(),
        restore: () => win.restore(),
        show: () => win.show(),
        focus: () => win.focus(),
        sendAgent: (target) => win.webContents.send("paseo:event:open-agent", target),
    };
}
desktopWindowOwner = (0, desktop_window_owner_js_1.createDesktopWindowOwner)({
    async create(input) {
        const win = await createWindow({
            initialRoute: input.initialRoute,
            restoreWindowState: input.restoreWindowState,
            onCreated: input.onCreated,
            onClosed: input.onClosed,
        });
        return ownedDesktopWindow(win);
    },
    windows: () => electron_1.BrowserWindow.getAllWindows().map(ownedDesktopWindow),
    focusedWindow: () => {
        const win = electron_1.BrowserWindow.getFocusedWindow();
        if (!win)
            return null;
        return ownedDesktopWindow(win);
    },
    agentRoute: agent_deep_link_1.buildAgentDeepLinkRoute,
    deliverAgent: (webContentsId, target) => agentNavigationInbox.deliverOrQueue(webContentsId, target),
});
// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
function receiveAgentDeepLink(input) {
    const target = (0, agent_deep_link_1.parseAgentDeepLink)(input);
    if (!target) {
        return;
    }
    if (bootstrapIsComplete) {
        void desktopWindowOwner
            .openOrFocusAgent(target)
            .catch((error) => main_1.default.error("[window] failed to route agent link", error));
        return;
    }
    pendingAgentNavigation = target;
    void bootstrapComplete.then(() => {
        if (pendingAgentNavigation !== target) {
            return undefined;
        }
        pendingAgentNavigation = null;
        void desktopWindowOwner
            .openOrFocusAgent(target)
            .catch((error) => main_1.default.error("[window] failed to route queued agent link", error));
        return undefined;
    });
}
electron_1.app.on("open-url", (event, url) => {
    event.preventDefault();
    receiveAgentDeepLink(url);
});
function setupSingleInstanceLock() {
    if (DISABLE_SINGLE_INSTANCE_LOCK) {
        main_1.default.info("[single-instance] disabled by PASEO_DISABLE_SINGLE_INSTANCE_LOCK");
        return true;
    }
    const gotLock = electron_1.app.requestSingleInstanceLock();
    if (!gotLock) {
        electron_1.app.quit();
        return false;
    }
    electron_1.app.on("second-instance", (_event, commandLine) => {
        const agentTarget = (0, agent_navigation_js_1.parseAgentDeepLinkFromArgv)(commandLine);
        if (agentTarget) {
            void bootstrapComplete
                .then(() => desktopWindowOwner.openOrFocusAgent(agentTarget))
                .catch((error) => main_1.default.error("[window] failed to route second-instance agent link", error));
            return;
        }
        main_1.default.info("[open-project] second-instance commandLine:", commandLine);
        const openProjectPath = (0, open_project_routing_js_1.parseOpenProjectPathFromArgv)({
            argv: commandLine,
            isDefaultApp: false,
        });
        main_1.default.info("[open-project] second-instance openProjectPath:", openProjectPath);
        // Relaunching the app (CLI `paseo [path]`, double-click, etc.) opens a new
        // window rather than focusing the existing one. Wait for bootstrap (not just
        // app.whenReady) so the protocol + IPC handlers exist before the window loads.
        void bootstrapComplete
            .then(() => desktopWindowOwner.openAdditional({ pendingProjectPath: openProjectPath }))
            .catch((error) => {
            main_1.default.error("[window] failed to create window from second-instance", error);
        });
    });
    return true;
}
async function runCliPassthroughIfRequested() {
    const cliArgs = (0, passthrough_js_1.parsePassthroughCliArgsFromArgv)(process.argv);
    if (!cliArgs) {
        return false;
    }
    try {
        const exitCode = await (0, passthrough_js_1.runPassthroughCli)(cliArgs);
        electron_1.app.exit(exitCode);
    }
    catch (error) {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        process.stderr.write(`${message}\n`);
        electron_1.app.exit(1);
    }
    return true;
}
async function bootstrap() {
    if (!setupSingleInstanceLock()) {
        return;
    }
    await electron_1.app.whenReady();
    const appDistDir = getAppDistDir();
    electron_1.protocol.handle(APP_SCHEME, (request) => {
        const { pathname, search, hash } = new URL(request.url);
        const decodedPath = decodeURIComponent(pathname);
        // Chromium can occasionally request the exported entrypoint directly.
        // Canonicalize it back to the route URL so Expo Router sees `/`, not `/index.html`.
        if (decodedPath.endsWith("/index.html")) {
            const normalizedPath = decodedPath.slice(0, -"/index.html".length) || "/";
            return Response.redirect(`${APP_SCHEME}://app${normalizedPath}${search}${hash}`, 307);
        }
        const filePath = node_path_1.default.join(appDistDir, decodedPath);
        const relativePath = node_path_1.default.relative(appDistDir, filePath);
        if (relativePath.startsWith("..") || node_path_1.default.isAbsolute(relativePath)) {
            return new Response("Not found", { status: 404 });
        }
        // SPA fallback: serve index.html for routes without a file extension
        if (!relativePath || !node_path_1.default.extname(relativePath)) {
            return electron_1.net.fetch((0, node_url_1.pathToFileURL)(node_path_1.default.join(appDistDir, "index.html")).toString());
        }
        return electron_1.net.fetch((0, node_url_1.pathToFileURL)(filePath).toString());
    });
    await applyAppIcon();
    (0, menu_js_1.setupApplicationMenu)({
        onNewWindow: () => {
            void desktopWindowOwner.openAdditional().catch((error) => {
                main_1.default.error("[window] failed to create window from menu", error);
            });
        },
    });
    (0, notifications_js_1.ensureNotificationCenterRegistration)();
    (0, daemon_manager_js_1.registerDaemonManager)();
    (0, window_manager_js_1.registerWindowManager)({ mode: DESKTOP_WINDOW_CHROME_MODE });
    (0, dialogs_js_1.registerDialogHandlers)();
    (0, notifications_js_1.registerNotificationHandlers)();
    const openExternalUrl = (0, opener_js_1.createExternalUrlOpener)({ open: electron_1.shell.openExternal });
    electron_1.ipcMain.handle("paseo:opener:openUrl", (_event, value) => openExternalUrl(value));
    (0, ipc_js_1.registerEditorTargetHandlers)();
    (0, ipc_js_2.registerBrowserAutomationIpc)();
    // In-app "Open in new window": opens a window that lands on the given project
    // via the same open-project flow as a CLI launch (no move, no ownership).
    electron_1.ipcMain.handle("paseo:window:openNew", async (_event, options) => {
        const pendingPath = options && typeof options === "object" && "pendingOpenProjectPath" in options
            ? options.pendingOpenProjectPath
            : null;
        await desktopWindowOwner.openAdditional({
            pendingProjectPath: typeof pendingPath === "string" ? pendingPath : null,
        });
    });
    // The first window of the session restores and persists saved geometry.
    const initialAgentNavigation = pendingAgentNavigation;
    pendingAgentNavigation = null;
    await desktopWindowOwner.openPrimary({
        initialRoute: initialAgentNavigation ? (0, agent_deep_link_1.buildAgentDeepLinkRoute)(initialAgentNavigation) : null,
        pendingProjectPath: pendingOpenProjectPath,
    });
    pendingOpenProjectPath = null;
    // Protocol + IPC handlers and the first window now exist: release any
    // second-instance launches that arrived during cold start.
    bootstrapIsComplete = true;
    resolveBootstrapComplete();
    if (pendingAgentNavigation) {
        const target = pendingAgentNavigation;
        pendingAgentNavigation = null;
        await desktopWindowOwner.openOrFocusAgent(target);
    }
    electron_1.app.on("activate", () => {
        void desktopWindowOwner.restoreWhenActivated().catch((error) => {
            console.error("Failed to restore a desktop window after activation", error);
        });
    });
}
void (0, desktop_startup_js_1.runDesktopStartup)({
    hasPendingGuiLaunchRequest: Boolean(pendingOpenProjectPath || pendingAgentNavigation),
    runCliPassthroughIfRequested,
    inheritLoginShellEnv: login_shell_env_js_1.inheritLoginShellEnv,
    bootstrapGui: bootstrap,
}).catch((error) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
});
function showDaemonShutdownDialog() {
    for (const win of electron_1.BrowserWindow.getAllWindows()) {
        win.webContents.send("paseo:event:quitting", {});
    }
}
const quitLifecycle = (0, quit_lifecycle_js_1.createQuitLifecycle)({
    app: electron_1.app,
    closeTransportSessions: local_transport_js_1.closeAllTransportSessions,
    stopDesktopManagedDaemonIfNeeded: () => (0, quit_lifecycle_js_1.stopDesktopManagedDaemonOnQuitIfNeeded)({
        settingsStore: (0, desktop_settings_electron_js_1.getDesktopSettingsStore)(),
        isDesktopManagedDaemonRunning: daemon_manager_js_2.isDesktopManagedDaemonRunningSync,
        stopDaemon: () => (0, daemon_manager_js_2.stopDesktopDaemonViaCli)("quit"),
        showShutdownFeedback: showDaemonShutdownDialog,
    }),
    installAppUpdateOnQuit: async (signal) => {
        const settings = await (0, desktop_settings_electron_js_1.getDesktopSettingsStore)().get();
        return (0, auto_updater_js_1.installAppUpdateOnQuit)({
            currentVersion: electron_1.app.getVersion(),
            releaseChannel: settings.releaseChannel,
            signal,
        });
    },
    createUpdateDeadlineSignal: () => AbortSignal.timeout(UPDATE_QUIT_DEADLINE_MS),
    onStopError: (error) => {
        main_1.default.error("[desktop daemon] failed to stop managed daemon on quit", error);
    },
    onUpdateError: (error) => {
        main_1.default.error("[auto-updater] failed to validate downloaded update on quit", error);
    },
});
// electron-updater forwards this event through Electron's built-in autoUpdater.
electron_1.autoUpdater.on("before-quit-for-update", () => {
    main_1.default.info("[auto-updater] before-quit-for-update", { currentVersion: electron_1.app.getVersion() });
    quitLifecycle.handleBeforeQuitForUpdate();
});
electron_1.app.on("before-quit", quitLifecycle.handleBeforeQuit);
(0, quit_lifecycle_js_1.registerExternalQuitSignals)({ signals: process, quit: () => electron_1.app.quit() });
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
//# sourceMappingURL=main.js.map