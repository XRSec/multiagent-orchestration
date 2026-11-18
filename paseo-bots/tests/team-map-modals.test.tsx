import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import React from "react";
import type { Bot, BotGroup, BotSettingsValues } from "../shared/bot";
import { DEFAULT_BOT_LIST_UI, EMPTY_LIBRARY } from "../shared/bot";
import type { BotSettingsState } from "../client/useBotSettings";
import { makeBot } from "./helpers";

vi.mock("@getpaseo/plugin/client", () => ({
  useRpc: () => vi.fn(async () => ({})),
}));

vi.mock("@getpaseo/plugin/client/react-native", () => ({
  copyText: vi.fn(async () => {}),
  useToast: () => ({ show: vi.fn(), error: vi.fn() }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: vi.fn(() => []),
    invalidateQueries: vi.fn(async () => {}),
  }),
}));

vi.mock("react-native", () => ({
  BackHandler: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default },
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));

vi.mock("../client/data", () => ({
  useBotHost: () => ({ key: "local", label: "Local", isLocal: true }),
  useChatInvalidation: vi.fn(),
  useHostResolver: () => vi.fn(() => ({ key: "local", label: "Local", isLocal: true, online: true, api: null })),
  useProviders: () => ({ data: [] }),
}));

vi.mock("../client/i18n", () => ({
  useT: () => ({ t: (k: string) => k }),
  formatPluralCount: (_t: unknown, singular: string, count: number) => `${count} ${singular}`,
}));

vi.mock("../client/keyboard", () => ({
  homeIndicatorInset: () => 0,
  useKeyboardHeight: () => 0,
}));

vi.mock("../client/native", () => ({
  confirmDialog: vi.fn(async () => true),
  errorText: (e: unknown) => String(e),
  nativeTokens: () => ({ dark: false, surfaceSidebar: "#fff", interactionHighlight: "#eee" }),
}));

vi.mock("../client/ui/Menu", () => ({
  measureAnchor: vi.fn(),
  useMenu: () => ({ open: vi.fn(), close: vi.fn() }),
}));

vi.mock("../client/BotSidebar", () => ({
  BotSidebar: "BotSidebar",
  BotSidebarFooter: ({ onTeamMap }: { onTeamMap?: () => void }) => (
    <div data-testid="sidebar-footer">
      <button data-testid="btn-open-team-map" onClick={onTeamMap} />
    </div>
  ),
}));

vi.mock("../client/teams/TeamTabs", () => ({
  TeamTabsRow: "TeamTabsRow",
  TeamTabSwitcher: "TeamTabSwitcher",
}));

vi.mock("../client/ui/Columns", () => ({
  ResizeHandle: "ResizeHandle",
  RowResizeHandle: "RowResizeHandle",
  SlideOver: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../client/launcher/BotLauncherCore", () => ({
  BotLauncherCore: "BotLauncherCore",
}));

vi.mock("../client/panel/BotPanel", () => ({
  BotPanel: "BotPanel",
}));

vi.mock("../client/Splash", () => ({
  Splash: "Splash",
}));

vi.mock("../client/AgyOrphanBanner", () => ({
  AgyOrphanBanner: "AgyOrphanBanner",
}));

vi.mock("../client/settings/PartnerSettingsModal", () => ({
  PartnerSettingsModal: "PartnerSettingsModal",
}));

vi.mock("../client/teams/TeamMap", () => ({
  TeamMap: ({ onNewTeam, onEditTeam, onBack }: { onNewTeam: () => void; onEditTeam: (g: BotGroup) => void; onBack: () => void }) => (
    <div data-testid="team-map-view">
      <button data-testid="team-map-back" onClick={onBack} />
      <button data-testid="team-map-new-team" onClick={onNewTeam} />
      <button
        data-testid="team-map-edit-team"
        onClick={() =>
          onEditTeam({
            id: "team-1",
            name: "Alpha Team",
            logo: null,
            leadId: null,
            memberIds: [],
            instructions: "",
            cwd: null,
            mounts: [],
            createdAt: "",
            updatedAt: "",
          })
        }
      />
    </div>
  ),
}));

vi.mock("../client/teams/TeamSheet", () => ({
  TeamSheet: (props: { group: BotGroup | null; onClose: () => void }) => (
    <div data-testid="team-sheet-modal" data-group-name={props.group?.name ?? "new"}>
      <button data-testid="team-sheet-close" onClick={props.onClose} />
    </div>
  ),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { BotsSurfaceReady } from "../client/BotsSurfaceReady";

describe("BotsSurfaceReady sub-view modal mounting", () => {
  it("never early-returns on desktop when teamMap, dataAnalysis, or libraryScreen is active", () => {
    const source = readFileSync(new URL("../client/BotsSurfaceReady.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/if\s*\(\s*\(dataAnalysis\s*\|\|\s*teamMap\)\s*&&\s*!layout\.compact\s*\)\s*return/);
    expect(source).not.toMatch(/if\s*\(\s*libraryScreen\s*&&\s*!layout\.compact\s*\)\s*return/);
  });

  it("renders TeamSheet modal immediately when user clicks new team or edit team from TeamMap on desktop", async () => {
    const theme = {
      colors: {
        surface0: "#000",
        surface1: "#111",
        surface2: "#222",
        border: "#333",
        foreground: "#fff",
        foregroundMuted: "#888",
        accent: "#00f",
      },
    } as any;
    const layout = { compact: false, platform: "web" as const };
    const host = { id: "local", label: "Local" };
    const bots: Bot[] = [
      makeBot({
        id: "bot-1",
        name: "Bot One",
      }),
    ];
    const groups: BotGroup[] = [
      {
        id: "team-1",
        name: "Alpha Team",
        logo: null,
        leadId: null,
        memberIds: ["bot-1"],
        instructions: "",
        cwd: null,
        mounts: [],
        createdAt: "",
        updatedAt: "",
      },
    ];
    const settingsValues: BotSettingsValues = {
      bots,
      groups,
      library: EMPTY_LIBRARY,
      history: [],
      ui: { ...DEFAULT_BOT_LIST_UI, tab: "team-1" },
    };
    const settings: Extract<BotSettingsState, { status: "ready" }> = {
      status: "ready",
      values: settingsValues,
      revision: "rev-1",
      saving: false,
      saveError: null,
      save: vi.fn(async () => true),
      reload: vi.fn(async () => {}),
      reset: vi.fn(async () => true),
    };
    const latest = { current: settings };
    const commit = vi.fn(async () => true);

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <BotsSurfaceReady
          theme={theme}
          layout={layout}
          host={host}
          navigation={{} as any}
          settings={settings}
          latest={latest}
          commit={commit}
        />,
      );
    });

    // 1. Initial desktop view: TeamMap is not active yet
    expect(renderer!.root.findAllByProps({ "data-testid": "team-map-view" }).length).toBe(0);

    // 2. Open TeamMap from sidebar footer
    const openTeamMapBtn = renderer!.root.findByProps({ "data-testid": "btn-open-team-map" });
    await act(async () => {
      openTeamMapBtn.props.onClick();
    });

    // Verify TeamMap is active
    expect(renderer!.root.findAllByProps({ "data-testid": "team-map-view" }).length).toBe(1);
    // TeamSheet modal should not be open yet
    expect(renderer!.root.findAllByProps({ "data-testid": "team-sheet-modal" }).length).toBe(0);

    // 3. Click "New Team" while ON TeamMap
    const newTeamBtn = renderer!.root.findByProps({ "data-testid": "team-map-new-team" });
    await act(async () => {
      newTeamBtn.props.onClick();
    });

    // CRITICAL: TeamMap view is STILL rendered, and TeamSheet modal is NOW IMMEDIATELY rendered!
    expect(renderer!.root.findAllByProps({ "data-testid": "team-map-view" }).length).toBe(1);
    const modalAfterNew = renderer!.root.findAllByProps({ "data-testid": "team-sheet-modal" });
    expect(modalAfterNew.length).toBe(1);
    expect(modalAfterNew[0]!.props["data-group-name"]).toBe("new");

    // Close the modal
    const closeBtn = renderer!.root.findByProps({ "data-testid": "team-sheet-close" });
    await act(async () => {
      closeBtn.props.onClick();
    });
    expect(renderer!.root.findAllByProps({ "data-testid": "team-sheet-modal" }).length).toBe(0);
    expect(renderer!.root.findAllByProps({ "data-testid": "team-map-view" }).length).toBe(1);

    // 4. Click "Edit Team" while ON TeamMap
    const editTeamBtn = renderer!.root.findByProps({ "data-testid": "team-map-edit-team" });
    await act(async () => {
      editTeamBtn.props.onClick();
    });

    // CRITICAL: TeamSheet modal for Alpha Team is immediately visible while on TeamMap!
    expect(renderer!.root.findAllByProps({ "data-testid": "team-map-view" }).length).toBe(1);
    const modalAfterEdit = renderer!.root.findAllByProps({ "data-testid": "team-sheet-modal" });
    expect(modalAfterEdit.length).toBe(1);
    expect(modalAfterEdit[0]!.props["data-group-name"]).toBe("Alpha Team");
  });
});
