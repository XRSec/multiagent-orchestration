import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Bot } from "../../shared/bot";
import { newUuid } from "../../shared/uuid";
import {
  validateWorkflowDAG,
  type WorkflowDefinition,
  type WorkflowStageDefinition,
  type WorkflowStepEngine,
} from "../../shared/workflows";
import { useT } from "../i18n";
import { Button, InputField, StatusBadge, TextAreaField } from "../panel/controls";
import { ui } from "../typography";

type Colors = PluginTheme["colors"];

export interface WorkflowListEditorProps {
  colors: Colors;
  title: string;
  info?: string;
  workflows: readonly WorkflowDefinition[];
  bots: readonly Bot[];
  onChange(workflows: WorkflowDefinition[]): void;
}

function makeDefaultStage(bots: readonly Bot[], index: number): WorkflowStageDefinition {
  const botId = bots[0]?.id ?? "";
  return {
    id: `stage-${index + 1}`,
    name: `Stage ${index + 1}`,
    botId,
    prompt: "",
    engine: "auto",
    dependsOn: [],
    maxRetries: 1,
  };
}

function makeDefaultWorkflow(bots: readonly Bot[]): WorkflowDefinition {
  const now = new Date().toISOString();
  return {
    id: `wf-${newUuid().slice(0, 8)}`,
    name: "",
    description: "",
    stages: [makeDefaultStage(bots, 0)],
    createdAt: now,
    updatedAt: now,
  };
}

export function WorkflowListEditor({
  colors,
  title,
  info,
  workflows,
  bots,
  onChange,
}: WorkflowListEditorProps) {
  const { t } = useT();
  const liveBots = useMemo(() => bots.filter((b) => !b.archived), [bots]);
  const [editing, setEditing] = useState<WorkflowDefinition | null>(null);
  const [isNew, setIsNew] = useState(false);

  const dagCheck = useMemo(() => (editing ? validateWorkflowDAG(editing.stages) : null), [editing]);

  const startNew = () => {
    setIsNew(true);
    setEditing(makeDefaultWorkflow(liveBots));
  };

  const startEdit = (wf: WorkflowDefinition) => {
    setIsNew(false);
    setEditing({
      ...wf,
      stages: wf.stages.map((s) => ({ ...s, dependsOn: [...s.dependsOn] })),
    });
  };

  const saveDraft = () => {
    if (!editing || !editing.name.trim() || !dagCheck?.valid) return;
    const now = new Date().toISOString();
    const cleaned: WorkflowDefinition = {
      ...editing,
      id: editing.id.trim() || `wf-${newUuid().slice(0, 8)}`,
      name: editing.name.trim(),
      description: editing.description.trim(),
      updatedAt: now,
      createdAt: editing.createdAt ?? now,
    };
    const next = isNew
      ? [...workflows, cleaned]
      : workflows.some((w) => w.id === cleaned.id)
        ? workflows.map((w) => (w.id === cleaned.id ? cleaned : w))
        : [...workflows, cleaned];
    onChange(next);
    setEditing(null);
  };

  const deleteWorkflow = (id: string) => {
    onChange(workflows.filter((w) => w.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  const updateStage = (idx: number, patch: Partial<WorkflowStageDefinition>) => {
    setEditing((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stages: prev.stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
      };
    });
  };

  const toggleDependency = (stageIdx: number, depId: string) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const target = prev.stages[stageIdx];
      if (!target) return prev;
      const has = target.dependsOn.includes(depId);
      const nextDeps = has ? target.dependsOn.filter((id) => id !== depId) : [...target.dependsOn, depId];
      return {
        ...prev,
        stages: prev.stages.map((s, i) => (i === stageIdx ? { ...s, dependsOn: nextDeps } : s)),
      };
    });
  };

  const removeStage = (idx: number) => {
    setEditing((prev) => {
      if (!prev || prev.stages.length <= 1) return prev;
      const removedId = prev.stages[idx]?.id;
      const remaining = prev.stages
        .filter((_, i) => i !== idx)
        .map((s) => ({
          ...s,
          dependsOn: removedId ? s.dependsOn.filter((d) => d !== removedId) : s.dependsOn,
        }));
      return { ...prev, stages: remaining };
    });
  };

  const addStage = () => {
    setEditing((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stages: [...prev.stages, makeDefaultStage(liveBots, prev.stages.length)],
      };
    });
  };

  return (
    <SettingsSection title={title} info={info}>
      <SettingsCard>
        {workflows.length === 0 && !editing ? (
          <SettingsRow label={t("workflows.emptyTitle")} hint={t("workflows.emptyHint")} />
        ) : null}

        {workflows.map((wf) => (
          <SettingsRow
            key={wf.id}
            label={wf.name}
            hint={`${wf.id} · ${t("workflows.stagesCount", { count: wf.stages.length })}${wf.description ? ` · ${wf.description}` : ""}`}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Button colors={colors} size="xs" variant="outline" label={t("common.edit")} onPress={() => startEdit(wf)} />
              <Button colors={colors} size="xs" variant="ghost" icon="Trash2" label={t("common.delete")} onPress={() => deleteWorkflow(wf.id)} />
            </View>
          </SettingsRow>
        ))}

        {!editing ? (
          <SettingsAction label={t("workflows.addWorkflow")} actionLabel={t("common.create")} onPress={startNew} />
        ) : null}
      </SettingsCard>

      {editing ? (
        <View style={{ marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: ui(14), fontWeight: "600", color: colors.foreground }}>
              {isNew ? t("workflows.newWorkflowTitle") : t("workflows.editWorkflowTitle")}
            </Text>
            <StatusBadge colors={colors} label={editing.id} variant="muted" />
          </View>

          <SettingsCard>
            <InputField
              colors={colors}
              label={t("workflows.nameLabel")}
              initialValue={editing.name}
              placeholder={t("workflows.namePlaceholder")}
              onChangeText={(name) => setEditing((prev) => (prev ? { ...prev, name } : prev))}
            />
            <InputField
              colors={colors}
              label={t("workflows.descriptionLabel")}
              initialValue={editing.description}
              placeholder={t("workflows.descriptionPlaceholder")}
              onChangeText={(description) => setEditing((prev) => (prev ? { ...prev, description } : prev))}
            />
          </SettingsCard>

          <Text style={{ fontSize: ui(13), fontWeight: "600", color: colors.foreground }}>
            {t("workflows.stagesHeader")}
          </Text>

          {editing.stages.map((stage, idx) => {
            const otherStages = editing.stages.filter((s) => s.id !== stage.id);
            return (
              <View
                key={`${idx}-${stage.id}`}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface0,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ fontSize: ui(13), fontWeight: "600", color: colors.foreground }}>
                    #{idx + 1} · {stage.name || stage.id}
                  </Text>
                  {editing.stages.length > 1 ? (
                    <Button colors={colors} size="xs" variant="ghost" icon="Trash2" label={t("common.remove")} onPress={() => removeStage(idx)} />
                  ) : null}
                </View>

                <SettingsCard>
                  <InputField
                    colors={colors}
                    label={t("workflows.stageIdLabel")}
                    initialValue={stage.id}
                    placeholder="research"
                    onChangeText={(id) => updateStage(idx, { id: id.trim() })}
                  />
                  <InputField
                    colors={colors}
                    label={t("workflows.stageNameLabel")}
                    initialValue={stage.name}
                    placeholder={t("workflows.stageNamePlaceholder")}
                    onChangeText={(name) => updateStage(idx, { name })}
                  />
                  <SettingsSelect
                    label={t("workflows.stageBotLabel")}
                    value={stage.botId}
                    disabled={liveBots.length === 0}
                    options={liveBots.map((b) => ({ label: b.name, value: b.id }))}
                    onValueChange={(botId) => updateStage(idx, { botId })}
                  />
                  <SettingsSelect
                    label={t("workflows.stageEngineLabel")}
                    value={stage.engine}
                    options={[
                      { label: t("workflows.engineAuto"), value: "auto" },
                      { label: t("workflows.engineNative"), value: "native" },
                      { label: t("workflows.enginePaseoBot"), value: "paseo-bot" },
                    ]}
                    onValueChange={(engine) => updateStage(idx, { engine: engine as WorkflowStepEngine })}
                  />
                  <SettingsSelect
                    label={t("workflows.stageRetriesLabel")}
                    value={String(stage.maxRetries)}
                    options={[
                      { label: "0", value: "0" },
                      { label: "1", value: "1" },
                      { label: "2", value: "2" },
                      { label: "3", value: "3" },
                    ]}
                    onValueChange={(val) => updateStage(idx, { maxRetries: Number(val) || 0 })}
                  />
                </SettingsCard>

                <TextAreaField
                  colors={colors}
                  accessibilityLabel={t("workflows.stagePromptLabel")}
                  value={stage.prompt}
                  onChangeText={(prompt) => updateStage(idx, { prompt })}
                  minHeight={72}
                  placeholder={t("workflows.stagePromptPlaceholder")}
                />

                {otherStages.length > 0 ? (
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: ui(12), color: colors.foregroundMuted }}>
                      {t("workflows.dependsOnField")}
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {otherStages.map((dep) => {
                        const selected = stage.dependsOn.includes(dep.id);
                        return (
                          <Pressable
                            key={dep.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => toggleDependency(idx, dep.id)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: selected ? colors.accent : colors.border,
                              backgroundColor: selected ? colors.surface2 : colors.surface1,
                            }}
                          >
                            <Icon name={selected ? "Check" : "Plus"} size={12} color={selected ? colors.accent : colors.foregroundMuted} />
                            <Text style={{ fontSize: ui(12), color: selected ? colors.foreground : colors.foregroundMuted }}>
                              {dep.name || dep.id}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <Button colors={colors} size="sm" variant="outline" icon="Plus" label={t("workflows.addStage")} onPress={addStage} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Button colors={colors} size="sm" variant="ghost" label={t("common.cancel")} onPress={() => setEditing(null)} />
              <Button
                colors={colors}
                size="sm"
                variant="default"
                label={t("common.save")}
                disabled={!editing.name.trim() || !dagCheck?.valid}
                onPress={saveDraft}
              />
            </View>
          </View>

          {dagCheck && !dagCheck.valid ? (
            <Text style={{ fontSize: ui(12), color: colors.statusDanger }}>
              {dagCheck.error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </SettingsSection>
  );
}
