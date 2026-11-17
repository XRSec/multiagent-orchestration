/**
 * Purpose: Modal dialog host for creating, editing, renaming, and exporting bots and teams.
 * Context: Extracted from BotsSurfaceReady to enforce <= 800 line budget.
 * Usage: <BotsSurfaceModals ... />
 * Prerequisites: Paseo client runtime, @getpaseo/plugin.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import type { Bot, BotGroup, Preset } from "../shared/bot";
import type { TeamDraft } from "../shared/groups";
import type { BotTemplate } from "../shared/templates";
import { ExportDialog, NewBotDialog, RenameDialog } from "./BotDialogs";
import { useT } from "./i18n";
import { TeamSheet } from "./teams/TeamSheet";

type Colors = PluginTheme["colors"];

export interface BotsSurfaceModalsProps {
  colors: Colors;
  editingTeam: BotGroup | "new" | null;
  creating: boolean;
  renaming: Bot | null;
  exporting: Bot | null;
  groups: readonly BotGroup[];
  allBots: readonly Bot[];
  presets: readonly Preset[];
  onCloseTeam: () => void;
  onSaveTeam: (draft: TeamDraft) => void;
  onDeleteTeam?: () => void;
  onCloseCreating: () => void;
  onCreateBot: (start?: { preset?: Preset; template?: BotTemplate }) => void;
  onImportTeam: (json: string) => Promise<void>;
  onCloseRenaming: () => void;
  onSubmitRenaming: (name: string) => Promise<void>;
  onCloseExporting: () => void;
}

export function BotsSurfaceModals({
  colors,
  editingTeam,
  creating,
  renaming,
  exporting,
  groups,
  allBots,
  presets,
  onCloseTeam,
  onSaveTeam,
  onDeleteTeam,
  onCloseCreating,
  onCreateBot,
  onImportTeam,
  onCloseRenaming,
  onSubmitRenaming,
  onCloseExporting,
}: BotsSurfaceModalsProps) {
  const { t } = useT();

  return (
    <>
      {editingTeam ? (
        <TeamSheet
          colors={colors}
          group={editingTeam === "new" ? null : editingTeam}
          groups={groups}
          bots={allBots}
          onClose={onCloseTeam}
          onSave={onSaveTeam}
          onDelete={onDeleteTeam}
        />
      ) : null}

      {creating ? (
        <NewBotDialog
          colors={colors}
          onClose={onCloseCreating}
          presets={presets}
          onCreate={onCreateBot}
          onImport={onImportTeam}
        />
      ) : null}

      {renaming ? (
        <RenameDialog
          colors={colors}
          title={t("surface.renameBotTitle")}
          initialValue={renaming.name}
          placeholder={renaming.name}
          onClose={onCloseRenaming}
          onSubmit={onSubmitRenaming}
        />
      ) : null}

      {exporting ? <ExportDialog colors={colors} bot={exporting} onClose={onCloseExporting} /> : null}
    </>
  );
}
