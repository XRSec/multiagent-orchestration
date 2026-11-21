/**
 * Purpose: Visual workflow editor with real-time DAG pipeline preview and template presets.
 * Context: Rendered in WorkflowsScreen and PartnerSettingsModal.
 * Usage: <WorkflowListEditor colors={colors} workflows={workflows} bots={bots} onChange={...} />
 * Prerequisites: validateWorkflowDAG, WORKFLOW_TEMPLATES, WorkflowPipelinePreview.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Bot } from "../../shared/bot";
import { newUuid } from "../../shared/uuid";
import { instantiateWorkflowTemplate, WORKFLOW_TEMPLATES, type WorkflowTemplate } from "../../shared/workflow-templates";
import {
  validateWorkflowDAG,
  type WorkflowDefinition,
  type WorkflowStageDefinition,
  type WorkflowStepEngine,
} from "../../shared/workflows";
import { useT } from "../i18n";
import { isImeComposing } from "../keyboard";
import { Button, InputField, StatusBadge, TextAreaField } from "../panel/controls";
import { ui } from "../typography";
import { WorkflowPipelinePreview } from "./WorkflowPipelinePreview";

type Colors = PluginTheme["colors"];

export interface WorkflowListEditorProps {
  colors: Colors;
  title: string;
  info?: string;
  workflows: readonly WorkflowDefinition[];
  bots: readonly Bot[];
  onChange(workflows: WorkflowDefinition[]): void;
  onRunWorkflow?(workflow: WorkflowDefinition): void;
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
  onRunWorkflow,
}: WorkflowListEditorProps) {
  const { t } = useT();
  const liveBots = useMemo(() => bots.filter((b) => !b.archived), [bots]);
  const [editing, setEditing] = useState<WorkflowDefinition | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const dagCheck = useMemo(() => (editing ? validateWorkflowDAG(editing.stages) : null), [editing]);

  const startNew = () => {
    setIsNew(true);
    setShowTemplatePicker(false);
    const initial = makeDefaultWorkflow(liveBots);
    setEditing(initial);
    setActiveStageId(initial.stages[0]?.id ?? null);
  };

  const applyTemplate = (tpl: WorkflowTemplate) => {
    setIsNew(true);
    setShowTemplatePicker(false);
    const instantiated = instantiateWorkflowTemplate(tpl, liveBots);
    setEditing(instantiated);
    setActiveStageId(instantiated.stages[0]?.id ?? null);
  };

  const startEdit = (wf: WorkflowDefinition) => {
    setIsNew(false);
    setShowTemplatePicker(false);
    setEditing({
      ...wf,
      stages: wf.stages.map((s) => ({ ...s, dependsOn: [...s.dependsOn] })),
    });
    setActiveStageId(wf.stages[0]?.id ?? null);
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
      const newStage = makeDefaultStage(liveBots, prev.stages.length);
      setActiveStageId(newStage.id);
      return {
        ...prev,
        stages: [...prev.stages, newStage],
      };
    });
  };

  return (
    <SettingsSection title={title} info={info}>
      {/* Graphical Empty State with 1-click Preset Templates (AC-2) */}
      {workflows.length === 0 && !editing ? (
        <View
          style={{
            padding: 20,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface1,
            alignItems: "center",
            gap: 14,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.surface2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="GitBranch" size={24} color={colors.accent} />
          </View>

          <View style={{ alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: ui(15), fontWeight: "600", color: colors.foreground, textAlign: "center" }}>
              {t("workflows.emptyTitle")}
            </Text>
            <Text style={{ fontSize: ui(13), color: colors.foregroundMuted, textAlign: "center", maxWidth: 440 }}>
              {t("workflows.emptyHint")}
            </Text>
          </View>

          <View style={{ width: "100%", gap: 10, marginTop: 6 }}>
            <Text style={{ fontSize: ui(12), fontWeight: "600", color: colors.foregroundMuted, textTransform: "uppercase" }}>
              {t("workflows.starterTemplatesTitle")}
            </Text>

            <View style={{ gap: 8 }}>
              {WORKFLOW_TEMPLATES.map((tpl) => (
                <Pressable
                  key={tpl.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Template ${tpl.name}`}
                  onPress={() => applyTemplate(tpl)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface0,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Icon name={tpl.icon} size={16} color={colors.accent} />
                      <Text style={{ fontSize: ui(13), fontWeight: "600", color: colors.foreground }}>
                        {tpl.name}
                      </Text>
                    </View>
                    <Button colors={colors} size="xs" variant="default" label={t("workflows.useTemplate")} onPress={() => applyTemplate(tpl)} />
                  </View>
                  <Text style={{ fontSize: ui(12), color: colors.foregroundMuted }}>
                    {tpl.description}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                    <StatusBadge colors={colors} label={t("workflows.stagesCount", { count: tpl.stages.length })} variant="muted" />
                    {tpl.tags.map((tag) => (
                      <StatusBadge key={tag} colors={colors} label={tag} variant="muted" />
                    ))}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
            <Button colors={colors} size="sm" variant="outline" icon="Plus" label={t("workflows.addCustomWorkflow")} onPress={startNew} />
          </View>
        </View>
      ) : null}

      {/* Existing Workflows List */}
      {workflows.length > 0 && !editing ? (
        <SettingsCard>
          {workflows.map((wf) => (
            <SettingsRow
              key={wf.id}
              label={wf.name}
              hint={`${wf.id} · ${t("workflows.stagesCount", { count: wf.stages.length })}${wf.description ? ` · ${wf.description}` : ""}`}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {onRunWorkflow ? (
                  <Button colors={colors} size="xs" variant="default" icon="Play" label={t("workflows.runWorkflow")} onPress={() => onRunWorkflow(wf)} />
                ) : null}
                <Button colors={colors} size="xs" variant="outline" label={t("common.edit")} onPress={() => startEdit(wf)} />
                <Button colors={colors} size="xs" variant="ghost" icon="Trash2" label={t("common.delete")} onPress={() => deleteWorkflow(wf.id)} />
              </View>
            </SettingsRow>
          ))}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 }}>
            <Button colors={colors} size="xs" variant="ghost" icon="Layers" label={t("workflows.fromTemplate")} onPress={() => setShowTemplatePicker((v) => !v)} />
            <Button colors={colors} size="xs" variant="default" icon="Plus" label={t("workflows.addWorkflow")} onPress={startNew} />
          </View>
        </SettingsCard>
      ) : null}

      {/* Template picker drawer when workflows already exist */}
      {showTemplatePicker && !editing ? (
        <View style={{ marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: ui(13), fontWeight: "600", color: colors.foreground }}>
              {t("workflows.starterTemplatesTitle")}
            </Text>
            <Button colors={colors} size="xs" variant="ghost" icon="X" label={t("common.close")} onPress={() => setShowTemplatePicker(false)} />
          </View>
          <View style={{ gap: 8 }}>
            {WORKFLOW_TEMPLATES.map((tpl) => (
              <Pressable
                key={tpl.id}
                accessibilityRole="button"
                onPress={() => applyTemplate(tpl)}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface0,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: ui(13), fontWeight: "600", color: colors.foreground }}>
                    {tpl.name}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: ui(12), color: colors.foregroundMuted }}>
                    {tpl.description}
                  </Text>
                </View>
                <Button colors={colors} size="xs" variant="outline" label={t("workflows.useTemplate")} onPress={() => applyTemplate(tpl)} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* Workflow Editor Form */}
      {editing ? (
        <View style={{ marginTop: 12, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <Text style={{ fontSize: ui(15), fontWeight: "600", color: colors.foreground }}>
              {isNew ? t("workflows.newWorkflowTitle") : t("workflows.editWorkflowTitle")}
            </Text>
            <StatusBadge colors={colors} label={editing.id} variant="muted" />
          </View>

          {/* AC-1: Live Visual Stage Pipeline Preview */}
          <WorkflowPipelinePreview
            colors={colors}
            stages={editing.stages}
            bots={liveBots}
            activeStageId={activeStageId}
            onSelectStage={(id) => setActiveStageId(id)}
          />

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

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: ui(13), fontWeight: "600", color: colors.foreground }}>
              {t("workflows.stagesHeader")}
            </Text>
            <Text style={{ fontSize: ui(12), color: colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>
              {t("workflows.stagesCount", { count: editing.stages.length })}
            </Text>
          </View>

          {editing.stages.map((stage, idx) => {
            const otherStages = editing.stages.filter((s) => s.id !== stage.id);
            const isSelected = stage.id === activeStageId;

            return (
              <View
                key={`${idx}-${stage.id}`}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: isSelected ? 1.5 : 1,
                  borderColor: isSelected ? colors.accent : colors.border,
                  backgroundColor: colors.surface0,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <Pressable onPress={() => setActiveStageId(stage.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: ui(13), fontWeight: "600", color: isSelected ? colors.accent : colors.foreground, fontVariant: ["tabular-nums"] }}>
                      #{idx + 1} · {stage.name || stage.id}
                    </Text>
                  </Pressable>
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
                  <View style={{ gap: 6 }}>
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
                              borderWidth: 0,
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
