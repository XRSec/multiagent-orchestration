/**
 * Purpose: Workflow resolution, availability validation, and prompt formatting for BotLauncher.
 * Context: Used by BotLauncherCore to support workflow quick-select in team chat mode.
 * Usage: resolveAvailableWorkflows(activeGroup, globalWorkflows), formatWorkflowLaunchPrompt(id, input, name)
 * Prerequisites: WorkflowDefinition from shared/workflows.
 */

import type { WorkflowDefinition } from "../../shared/workflows";

/**
 * Resolves deduplicated list of available workflows for a given team group.
 * Group-scoped workflows take precedence over global workflows sharing the same ID.
 */
export function resolveAvailableWorkflows(
  group: { id?: string; workflows?: readonly WorkflowDefinition[] | WorkflowDefinition[] } | null | undefined,
  globalWorkflows: readonly WorkflowDefinition[] | WorkflowDefinition[] | null | undefined,
): WorkflowDefinition[] {
  if (!group) return [];
  const teamWorkflows = group.workflows ?? [];
  const teamWorkflowIds = new Set(teamWorkflows.map((w) => w.id));
  const globals = (globalWorkflows ?? []).filter((w) => !teamWorkflowIds.has(w.id));
  return [...teamWorkflows, ...globals];
}

/**
 * Determines whether a given workflowId is still valid when switching to a new team group,
 * or whether it belongs to global workflows.
 */
export function shouldRetainWorkflowSelection(
  selectedWorkflowId: string | null | undefined,
  nextGroup: { id?: string; workflows?: readonly WorkflowDefinition[] | WorkflowDefinition[] } | null | undefined,
  globalWorkflows: readonly WorkflowDefinition[] | WorkflowDefinition[] | null | undefined,
): boolean {
  if (!selectedWorkflowId) return false;
  // If it's a global workflow, it is available across all teams
  const isGlobal = (globalWorkflows ?? []).some((w) => w.id === selectedWorkflowId);
  if (isGlobal) return true;
  // Otherwise, it must exist in the target team's scoped workflows
  return (nextGroup?.workflows ?? []).some((w) => w.id === selectedWorkflowId);
}

/**
 * Formats the outgoing launch prompt when a workflow is active,
 * instructing the lead bot to immediately invoke `run_workflow` with the selected workflow_id
 * and the user's input as the task objective.
 */
export function formatWorkflowLaunchPrompt(
  workflowId: string,
  userInput: string,
  workflowName?: string,
): string {
  const objective = userInput.trim();
  const label = workflowName ? ` "${workflowName}" (${workflowId})` : ` "${workflowId}"`;
  const instruction = `Please immediately execute workflow${label} using the run_workflow tool with workflow_id: "${workflowId}".`;
  if (!objective) {
    return instruction;
  }
  return `${instruction}\n\nTask Objective:\n${objective}`;
}
