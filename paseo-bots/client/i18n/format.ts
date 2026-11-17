import type { z } from "zod";
import { classifyFile, type AttachmentKind } from "../../shared/attachments";
import { SOUL_MAX_BYTES, utf8Bytes, type Bot, type RoutineSchedule } from "../../shared/bot";
import type { Change } from "../../shared/changes";
import { CRON_PRESETS, ScheduleInput, scheduleFrom } from "../../shared/routines";
import type { ChatBucket } from "../../shared/sidebar";
import type { BotTemplate } from "../../shared/templates";
import { buildToolCallDisplayModel, type ToolCallDisplayInput, type ToolCallDisplayModel } from "../../shared/tools";
import { pluralText, type AppLocale, type TFn } from "./locale";

export type SendBehavior = "interrupt" | "steer" | "queue";

export interface QuestionFormQuestion {
  dismissLabel?: string;
  [key: string]: unknown;
}

const pad2 = (value: number) => String(value).padStart(2, "0");
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const joinItems = (items: readonly string[], locale: AppLocale) => items.join(locale === "zh-CN" ? "、" : ", ");

export function formatRelativeTime(t: TFn, iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return t("time.justNow");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t("time.daysAgo", { count: days });
  return new Date(then).toISOString().slice(0, 10);
}

export function formatNextRun(t: TFn, next: Date, now: number = Date.now()): string {
  const diff = next.getTime() - now;
  if (diff < 60_000) return t("time.soon");
  if (diff < 3_600_000) return t("time.inMinutes", { count: Math.round(diff / 60_000) });
  if (diff < 86_400_000) return t("time.inHours", { count: Math.round(diff / 3_600_000) });
  return t("time.inDays", { count: Math.round(diff / 86_400_000) });
}

export function formatRunTime(t: TFn, locale: AppLocale, at: Date, now: Date): string {
  const dateLocale = locale === "zh-CN" ? "zh-CN" : "en-US";
  const time = at.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const offset = Math.round((day - today) / 86_400_000);
  if (offset === 0) return t("time.todayAt", { time });
  if (offset === 1) return t("time.tomorrowAt", { time });
  if (offset === -1) return t("time.yesterdayAt", { time });
  const date = at.toLocaleDateString(dateLocale, { weekday: "short", month: "short", day: "numeric" });
  return t("time.dateAt", { date, time });
}

export function formatDayName(t: TFn, locale: AppLocale, day: string, now: Date): string {
  const [year, month, date] = day.split("-").map(Number);
  const at = new Date(year!, month! - 1, date!);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(at, now)) return t("time.today");
  if (sameDay(at, yesterday)) return t("time.yesterday");
  const dateLocale = locale === "zh-CN" ? "zh-CN" : "en-US";
  return at.toLocaleDateString(dateLocale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(at.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function formatDurationLocalized(t: TFn, durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return t("time.durationSec", { s: 0 });
  const totalSeconds = durationMs / 1000;
  if (totalSeconds < 60) return t("time.durationSec", { s: Math.floor(totalSeconds) });
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = Math.floor(totalSeconds) % 60;
    return seconds === 0 ? t("time.durationMin", { m: totalMinutes }) : t("time.durationMinSec", { m: totalMinutes, s: seconds });
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? t("time.durationHour", { h: hours }) : t("time.durationHourMin", { h: hours, m: minutes });
}

export function formatMessageTimestampLocalized(locale: AppLocale, date: Date, now: Date = new Date()): string {
  const dateLocale = locale === "zh-CN" ? "zh-CN" : "en-US";
  const resolved = new Intl.DateTimeFormat(dateLocale, { hour: "numeric", minute: "2-digit" }).resolvedOptions();
  const time = new Intl.DateTimeFormat(dateLocale, { hour: "numeric", minute: "2-digit", hourCycle: resolved.hourCycle }).format(date);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysAgo = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (daysAgo === 0) return time;
  if (daysAgo > 0 && daysAgo < 7) return `${date.toLocaleDateString(dateLocale, { weekday: "long" })} ${time}`;
  return `${date.toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" })}, ${time}`;
}

export function formatBucketLabel(t: TFn, bucket: ChatBucket): string {
  return t(`buckets.${bucket}`);
}

const PRESET_LABEL_KEYS: Record<string, Parameters<TFn>[0]> = {
  "every-minute": "schedule.everyMinute",
  "every-hour": "schedule.everyHour",
  "daily-9": "schedule.daily9",
  "weekdays-9": "schedule.weekdays9",
  "mondays-9": "schedule.mondays9",
};

export function formatCronPresets(t: TFn): { id: string; label: string; expression: string }[] {
  return CRON_PRESETS.map((preset) => ({
    ...preset,
    label: PRESET_LABEL_KEYS[preset.id] ? t(PRESET_LABEL_KEYS[preset.id]!) : preset.label,
  }));
}

const CRON_PLURAL_DAY_KEYS = [
  "schedule.sundayPlural",
  "schedule.mondayPlural",
  "schedule.tuesdayPlural",
  "schedule.wednesdayPlural",
  "schedule.thursdayPlural",
  "schedule.fridayPlural",
  "schedule.saturdayPlural",
] as const;

const WEEKDAY_SHORT_KEYS = [
  "schedule.sunShort",
  "schedule.monShort",
  "schedule.tueShort",
  "schedule.wedShort",
  "schedule.thuShort",
  "schedule.friShort",
  "schedule.satShort",
] as const;

const CRON_FIELD_LIMITS = [
  { min: 0, max: 59, key: "schedule.fieldMinute" as const },
  { min: 0, max: 23, key: "schedule.fieldHour" as const },
  { min: 1, max: 31, key: "schedule.fieldDayOfMonth" as const },
  { min: 1, max: 12, key: "schedule.fieldMonth" as const },
  { min: 0, max: 6, key: "schedule.fieldDayOfWeek" as const },
];

export function formatValidateCron(t: TFn, expression: string): string | null {
  const trimmed = expression.trim();
  if (!trimmed) return t("schedule.cronEmpty");
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) return t("schedule.cronFiveFields");
  for (let i = 0; i < 5; i++) {
    const bounds = CRON_FIELD_LIMITS[i]!;
    const field = t(bounds.key);
    for (const rawPart of parts[i]!.split(",")) {
      const part = rawPart.trim();
      if (!part) return t("schedule.cronInvalidField", { field });
      const stepParts = part.split("/");
      if (stepParts.length > 2) return t("schedule.cronInvalidStep", { field });
      const [base = "", stepSource] = stepParts;
      const step = stepSource === undefined ? 1 : Number.parseInt(stepSource, 10);
      if (!Number.isInteger(step) || step <= 0 || (stepSource !== undefined && String(step) !== stepSource.trim())) {
        return t("schedule.cronInvalidStep", { field });
      }
      const range = /^(\d+)-(\d+)$/.exec(base);
      if (base === "*") continue;
      if (range) {
        const start = Number.parseInt(range[1]!, 10);
        const end = Number.parseInt(range[2]!, 10);
        if (start > end || start < bounds.min || end > bounds.max) return t("schedule.cronInvalidRange", { field });
      } else {
        if (!/^\d+$/.test(base)) return t("schedule.cronInvalidValue", { field });
        const start = Number.parseInt(base, 10);
        if (start < bounds.min || start > bounds.max) return t("schedule.cronInvalidValue", { field });
      }
    }
  }
  return null;
}

export function formatDescribeCron(t: TFn, expression: string): string | null {
  const trimmed = expression.trim();
  if (formatValidateCron(t, trimmed) !== null) return null;
  const [minute = "", hour = "", dayOfMonth = "", month = "", dayOfWeek = ""] = trimmed.split(/\s+/);
  const dateWildcard = dayOfMonth === "*" && month === "*";
  if (minute === "*" && hour === "*" && dateWildcard && dayOfWeek === "*") return t("schedule.everyMinute");
  const everyMinutes = /^\*\/(\d+)$/.exec(minute);
  if (everyMinutes && hour === "*" && dateWildcard && dayOfWeek === "*") return t("schedule.everyNMinutes", { count: Number(everyMinutes[1]) });
  if (!/^\d+$/.test(minute) || !dateWildcard) return null;
  const minuteNumber = Number.parseInt(minute, 10);
  if (hour === "*") {
    if (dayOfWeek !== "*") return null;
    return minuteNumber === 0 ? t("schedule.everyHour") : t("schedule.everyHourAt", { minute: pad2(minuteNumber) });
  }
  const everyHours = /^\*\/(\d+)$/.exec(hour);
  if (everyHours && dayOfWeek === "*") {
    return minuteNumber === 0
      ? t("schedule.everyNHours", { count: Number(everyHours[1]) })
      : t("schedule.everyNHoursAt", { count: Number(everyHours[1]), minute: pad2(minuteNumber) });
  }
  if (!/^\d+$/.test(hour)) return null;
  const time = `${pad2(Number.parseInt(hour, 10))}:${pad2(minuteNumber)}`;
  let days: string | null = null;
  if (dayOfWeek === "*") days = t("schedule.daily");
  else if (dayOfWeek === "1-5") days = t("schedule.weekdays");
  else if (dayOfWeek === "0,6" || dayOfWeek === "6,0") days = t("schedule.weekends");
  else if (/^\d$/.test(dayOfWeek)) {
    const key = CRON_PLURAL_DAY_KEYS[Number.parseInt(dayOfWeek, 10)];
    days = key ? t(key) : null;
  }
  return days ? t("schedule.scheduleAtTime", { days, time }) : null;
}

export function formatDescribeSchedule(t: TFn, locale: AppLocale, schedule: RoutineSchedule): string {
  switch (schedule.kind) {
    case "webhook":
      return t("schedule.whenWebhookCalled");
    case "cron":
      return formatDescribeCron(t, schedule.expression) ?? schedule.expression.trim();
    case "once":
      return t("schedule.onceAt", { time: new Date(schedule.at).toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US") });
    case "interval":
      return schedule.minutes % 60 === 0
        ? t("schedule.everyHoursCompact", { count: schedule.minutes / 60 })
        : t("schedule.everyMinutesCompact", { count: schedule.minutes });
    case "daily": {
      const days = [...schedule.weekdays].sort();
      const which =
        days.length === 7
          ? t("schedule.everyDay")
          : days.join(",") === "1,2,3,4,5"
            ? t("schedule.weekdays")
            : joinItems(
                days.map((day) => t(WEEKDAY_SHORT_KEYS[day]!)),
                locale,
              );
      return t("schedule.scheduleAtTime", { days: which, time: schedule.time });
    }
  }
}

export function formatScanSkillText(t: TFn, text: string): string[] {
  const warnings: string[] = [];
  if (/[A-Za-z0-9+/]{400,}={0,2}/.test(text)) warnings.push(t("library.warnEncodedBlob"));
  if (/\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b/.test(text)) warnings.push(t("library.warnPipeToShell"));
  if (/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/.test(text)) warnings.push(t("library.warnInvisibleChars"));
  if (/\b(ignore|disregard)\b[^\n]{0,30}\b(previous|prior|above|all)\b[^\n]{0,20}\binstructions\b/i.test(text)) {
    warnings.push(t("library.warnIgnoreInstructions"));
  }
  if (/\b(rm\s+-rf\s+[~/]|mkfs\b|dd\s+if=)/.test(text)) warnings.push(t("library.warnEraseData"));
  return warnings;
}

const TEMPLATE_KEYS: Record<string, { name: Parameters<TFn>[0]; title: Parameters<TFn>[0]; description: Parameters<TFn>[0] }> = {
  assistant: { name: "templates.assistantName", title: "templates.assistantTitle", description: "templates.assistantDescription" },
  inbox: { name: "templates.inboxName", title: "templates.inboxTitle", description: "templates.inboxDescription" },
  research: { name: "templates.researchName", title: "templates.researchTitle", description: "templates.researchDescription" },
  community: { name: "templates.communityName", title: "templates.communityTitle", description: "templates.communityDescription" },
  ops: { name: "templates.opsName", title: "templates.opsTitle", description: "templates.opsDescription" },
};

export function formatTemplateDisplay(t: TFn, template: BotTemplate): { name: string; title: string; description: string } {
  const keys = TEMPLATE_KEYS[template.id];
  if (!keys) return { name: template.name, title: template.title, description: template.description };
  return { name: t(keys.name), title: t(keys.title), description: t(keys.description) };
}

export function formatBotProblems(t: TFn, bot: Bot, isLocalHost: boolean): string[] {
  const problems: string[] = [];
  if (!bot.name.trim()) problems.push(t("panel.problemName"));
  if (!bot.provider) problems.push(t("panel.problemProvider"));
  if (!isLocalHost && !bot.cwd) problems.push(t("panel.problemFolder"));
  if (utf8Bytes(bot.soul) > SOUL_MAX_BYTES) problems.push(t("panel.problemSoulSize", { maxKb: SOUL_MAX_BYTES / 1000 }));
  return problems;
}

export function formatBotLimits(t: TFn, bot: Bot, facts: { local: boolean; appsConfigured: boolean }): string[] {
  const lines: string[] = [];
  if (!/bypass|full|yolo|dangerous/i.test(bot.modeId ?? "")) lines.push(t("panel.limitAskCommands"));
  if (!facts.local || bot.contactBots === "off") lines.push(t("panel.limitNoContactBots"));
  else if (bot.contactBots === "ask") lines.push(t("panel.limitAskContactBots"));
  if (!facts.local || !facts.appsConfigured || bot.apps.length === 0) lines.push(t("panel.limitNoApps"));
  if (!bot.routines.some((routine) => routine.enabled)) lines.push(t("panel.limitNoSchedule"));
  if (facts.local) lines.push(t("panel.limitConfirmProposals"));
  return lines;
}

const CANONICAL_TOOL_KEY: Record<string, Parameters<TFn>[0]> = {
  Shell: "tools.shell",
  Read: "tools.read",
  Edit: "tools.edit",
  Write: "tools.write",
  Search: "tools.search",
  Fetch: "tools.fetch",
  "Worktree setup": "tools.worktreeSetup",
  Task: "tools.task",
  Plan: "tools.plan",
  Thinking: "tools.thinking",
  Terminal: "tools.terminal",
};

export function formatToolDisplayModel(t: TFn, input: ToolCallDisplayInput): ToolCallDisplayModel {
  const model = buildToolCallDisplayModel(input);
  const key = CANONICAL_TOOL_KEY[model.displayName];
  return key ? { ...model, displayName: t(key) } : model;
}

export function formatSubmitAccessibilityLabel(
  t: TFn,
  input: { canPressLoading: boolean; behavior: SendBehavior; running: boolean },
): string {
  if (input.canPressLoading) return t("chat.submitInterruptAgent");
  if (input.behavior === "queue" && input.running) return t("chat.submitQueueMessage");
  if (input.running) return input.behavior === "steer" ? t("chat.submitSendAndSteer") : t("chat.submitSendAndInterrupt");
  return t("chat.submitSendMessage");
}

export function formatDismissLabel(t: TFn, questions: QuestionFormQuestion[]): string {
  return questions.find((question) => question.dismissLabel)?.dismissLabel ?? t("chat.dismiss");
}

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const TEXT_MAX_BYTES = 1024 * 1024;
const FILE_MAX_BYTES = 25 * 1024 * 1024;

export function formatRejectReason(t: TFn, kind: AttachmentKind, size: number, canUpload: boolean): string | null {
  if (kind === "image" && size > IMAGE_MAX_BYTES) return t("chat.rejectImageTooLarge");
  if (kind === "text" && size > TEXT_MAX_BYTES) return canUpload ? null : t("chat.rejectTextTooLarge");
  if (kind === "file" && !canUpload) return t("chat.rejectFileRemoteHost");
  if (size > FILE_MAX_BYTES) return t("chat.rejectFileTooLarge");
  return null;
}

export function formatPreflightFile(
  t: TFn,
  name: string,
  mimeType: string,
  size: number,
  canUpload: boolean,
): { kind: AttachmentKind; reason: string | null } {
  let kind = classifyFile(name, mimeType);
  if (kind === "text" && size > TEXT_MAX_BYTES) kind = "file";
  return { kind, reason: formatRejectReason(t, kind, size, canUpload) };
}

// ---------------------------------------------------------------- setup changes

type AppEntry = NonNullable<Extract<Change, { type: "create_bot" }>["apps"]>[number];
type AgentFieldSubset = Pick<
  Extract<Change, { type: "create_bot" }>,
  "provider" | "model" | "mode" | "thinking"
>;
type BotFieldSubset = AgentFieldSubset &
  Pick<
    Extract<Change, { type: "create_bot" }>,
    "title" | "description" | "instructions" | "contact_bots" | "avatar" | "working_folder" | "pinned"
  >;

function formatAppEntry(t: TFn, locale: AppLocale, entry: AppEntry): string {
  const tools =
    !entry.tools || entry.tools === "all"
      ? ""
      : entry.tools === "read"
        ? locale === "zh-CN"
          ? `（${t("changes.readOnlyTools")}）`
          : ` (${t("changes.readOnlyTools")})`
        : locale === "zh-CN"
          ? `（${joinItems(entry.tools, locale)}）`
          : ` (${joinItems(entry.tools, locale)})`;
  return `${entry.app}${tools}${entry.account ? t("changes.withOneAccount") : ""}`;
}

function formatAgentFields(t: TFn, fields: AgentFieldSubset): string[] {
  const parts: string[] = [];
  if (fields.provider !== undefined) parts.push(t("changes.provider", { value: fields.provider }));
  if (fields.model !== undefined) parts.push(fields.model ? t("changes.model", { value: fields.model }) : t("changes.defaultModel"));
  if (fields.mode !== undefined) parts.push(fields.mode ? t("changes.approvalMode", { value: fields.mode }) : t("changes.defaultApprovalMode"));
  if (fields.thinking !== undefined) parts.push(fields.thinking ? t("changes.thinking", { value: fields.thinking }) : t("changes.defaultThinking"));
  return parts;
}

function formatBotFields(t: TFn, fields: BotFieldSubset): string[] {
  const parts: string[] = [];
  if (fields.title !== undefined) parts.push(t("changes.fieldTitle", { value: oneLine(fields.title) }));
  if (fields.description !== undefined) parts.push(t("changes.newBlurb"));
  if (fields.instructions !== undefined) parts.push(t("changes.newInstructions"));
  parts.push(...formatAgentFields(t, fields));
  if (fields.contact_bots !== undefined) {
    const key = { ask: "changes.asksContactBots", allow: "changes.allowsContactBots", off: "changes.offContactBots" }[fields.contact_bots] as Parameters<TFn>[0];
    parts.push(t(key));
  }
  if (fields.avatar) {
    parts.push(
      fields.avatar.image_url
        ? t("changes.avatarPicture")
        : fields.avatar.image_url === null
          ? t("changes.avatarPixelBack")
          : t("changes.avatarDifferentFace"),
    );
  }
  if (fields.working_folder !== undefined) {
    parts.push(fields.working_folder ? t("changes.workingFolder", { value: fields.working_folder }) : t("changes.ownWorkingFolder"));
  }
  if (fields.pinned !== undefined) parts.push(fields.pinned ? t("changes.pinned") : t("changes.unpinned"));
  return parts;
}

function formatChangeSchedule(t: TFn, locale: AppLocale, input: z.infer<typeof ScheduleInput>): string {
  try {
    return formatDescribeSchedule(t, locale, scheduleFrom(input, new Date()));
  } catch {
    return input.type;
  }
}

export function formatDescribeChange(t: TFn, locale: AppLocale, change: Change): string {
  const sep = locale === "zh-CN" ? "；" : "; ";
  const colon = locale === "zh-CN" ? "：" : ": ";
  switch (change.type) {
    case "create_bot": {
      const roleKey = change.role ? TEMPLATE_KEYS[change.role]?.title : undefined;
      const roleLabel = roleKey ? t(roleKey) : change.role;
      const parts = [
        ...(roleLabel ? [t("changes.startsAsRole", { role: roleLabel })] : []),
        ...formatBotFields(t, change),
        ...(change.skills?.length ? [t("changes.skillsList", { items: joinItems(change.skills, locale) })] : []),
        ...(change.mcp_servers?.length ? [t("changes.mcpServersList", { items: joinItems(change.mcp_servers, locale) })] : []),
        ...(change.apps?.length ? [t("changes.appsList", { items: joinItems(change.apps.map((entry) => formatAppEntry(t, locale, entry)), locale) })] : []),
        ...(change.playbooks?.length ? [t("changes.playbooksList", { items: joinItems(change.playbooks.map((p) => p.name), locale) })] : []),
      ];
      return t("changes.newBot", { name: oneLine(change.name), details: parts.length ? `${colon}${parts.join(sep)}` : "" });
    }
    case "update_bot": {
      const parts = [
        ...(change.name !== undefined ? [t("changes.renamedTo", { name: oneLine(change.name) })] : []),
        ...formatBotFields(t, change),
        ...(change.archived !== undefined ? [change.archived ? t("changes.archived") : t("changes.unarchived")] : []),
        ...(change.add_skills?.length ? [t("changes.turnsOnSkills", { items: joinItems(change.add_skills, locale) })] : []),
        ...(change.remove_skills?.length ? [t("changes.turnsOffSkills", { items: joinItems(change.remove_skills, locale) })] : []),
        ...(change.add_mcp_servers?.length ? [t("changes.turnsOnMcp", { items: joinItems(change.add_mcp_servers, locale) })] : []),
        ...(change.remove_mcp_servers?.length ? [t("changes.turnsOffMcp", { items: joinItems(change.remove_mcp_servers, locale) })] : []),
        ...(change.add_apps?.length ? [t("changes.mayUseApps", { items: joinItems(change.add_apps.map((entry) => formatAppEntry(t, locale, entry)), locale) })] : []),
        ...(change.remove_apps?.length ? [t("changes.noLongerUsesApps", { items: joinItems(change.remove_apps, locale) })] : []),
        ...(change.allow_tools?.length ? [t("changes.allowsTools", { items: joinItems(change.allow_tools, locale) })] : []),
        ...(change.disallow_tools?.length ? [t("changes.disallowsTools", { items: joinItems(change.disallow_tools, locale) })] : []),
        ...(change.add_playbooks?.length ? [t("changes.playbooksList", { items: joinItems(change.add_playbooks.map((p) => p.name), locale) })] : []),
        ...(change.remove_playbooks?.length ? [t("changes.removesPlaybooks", { items: joinItems(change.remove_playbooks, locale) })] : []),
      ];
      return t("changes.updateBot", { bot: change.bot, details: parts.join(sep) || t("changes.noChanges") });
    }
    case "delete_bot":
      return t("changes.deleteBot", { bot: change.bot });
    case "add_routine":
      return t("changes.addRoutine", { bot: change.bot, name: change.name, schedule: formatChangeSchedule(t, locale, change.schedule) });
    case "update_routine": {
      const parts = [
        ...(change.name !== undefined ? [t("changes.renamedToQuoted", { name: change.name })] : []),
        ...(change.instructions !== undefined ? [t("changes.newInstructions")] : []),
        ...(change.schedule ? [formatChangeSchedule(t, locale, change.schedule)] : []),
        ...(change.enabled !== undefined ? [change.enabled ? t("changes.resumed") : t("changes.paused")] : []),
      ];
      return t("changes.updateRoutine", { bot: change.bot, routine: change.routine, details: parts.join(sep) || t("changes.unchanged") });
    }
    case "delete_routine":
      return t("changes.deleteRoutine", { bot: change.bot, routine: change.routine });
    case "create_team": {
      const members = (change.members ?? []).filter((member) => member !== change.lead);
      const parts = [
        ...(change.lead ? [t("changes.ledBy", { lead: change.lead })] : []),
        ...(members.length ? [t("changes.withMembers", { items: joinItems(members, locale) })] : []),
        ...(change.instructions?.trim() ? [t("changes.sharedInstructions")] : []),
      ];
      return t("changes.newTeam", { name: oneLine(change.name), details: parts.length ? `${colon}${parts.join(sep)}` : "" });
    }
    case "update_team": {
      const parts = [
        ...(change.name !== undefined ? [t("changes.renamedTo", { name: oneLine(change.name) })] : []),
        ...(change.lead !== undefined ? [change.lead ? t("changes.ledBy", { lead: change.lead }) : t("changes.noChiefOfStaff")] : []),
        ...(change.add_members?.length ? [t("changes.addsMembers", { items: joinItems(change.add_members, locale) })] : []),
        ...(change.remove_members?.length ? [t("changes.removesMembers", { items: joinItems(change.remove_members, locale) })] : []),
        ...(change.instructions !== undefined ? [t("changes.newSharedInstructions")] : []),
        ...(change.logo ? [t("changes.newLogo")] : []),
      ];
      return t("changes.updateTeam", { team: change.team, details: parts.join(sep) || t("changes.noChanges") });
    }
    case "delete_team":
      return t("changes.deleteTeam", { team: change.team });
    case "set_skill":
      return t("changes.setSkill", { skill: change.skill, state: change.enabled ? t("common.on") : t("common.off") });
    case "add_mcp_server": {
      const target = change.command
        ? t("changes.addMcpRuns", { command: [change.command, ...(change.args ?? [])].join(" ") })
        : t("changes.addMcpConnects", { url: change.url ?? "" });
      return t("changes.addMcpServer", { name: change.name, target });
    }
    case "set_mcp_server":
      return t("changes.setMcpServer", { server: change.server, state: change.enabled ? t("common.on") : t("common.off") });
    case "remove_mcp_server":
      return t("changes.removeMcpServer", { server: change.server });
    case "set_defaults": {
      const parts = [
        ...formatAgentFields(t, change),
        ...(change.contact_bots ? [t("changes.contactOtherBotsValue", { value: change.contact_bots })] : []),
      ];
      return t("changes.setDefaults", { details: parts.join(sep) || t("changes.theSameDefaults") });
    }
    case "save_preset":
      return t("changes.savePreset", { bot: change.bot });
    case "delete_preset":
      return t("changes.deletePreset", { preset: change.preset });
  }
}

export function formatChangeWarnings(t: TFn, locale: AppLocale, changes: readonly Change[]): string[] {
  const warnings: string[] = [];
  for (const change of changes) {
    const who = change.type === "create_bot" ? change.name : "bot" in change ? change.bot : "";
    if ((change.type === "create_bot" || change.type === "update_bot") && change.mode) {
      warnings.push(t("changes.warnMode", { who, mode: change.mode }));
    }
    if ((change.type === "create_bot" || change.type === "update_bot") && change.contact_bots === "allow") {
      warnings.push(t("changes.warnContactAllow", { who }));
    }
    if (change.type === "update_bot" && change.allow_tools?.length) {
      warnings.push(t("changes.warnAllowTools", { who, tools: joinItems(change.allow_tools, locale) }));
    }
    const apps = change.type === "create_bot" ? change.apps : change.type === "update_bot" ? change.add_apps : undefined;
    if (apps?.length) {
      warnings.push(t("changes.warnApps", { who, apps: joinItems(apps.map((entry) => entry.app), locale) }));
    }
    if ((change.type === "create_bot" || change.type === "update_bot") && change.working_folder) {
      warnings.push(t("changes.warnWorkingFolder", { who, folder: change.working_folder }));
    }
    if (change.type === "add_mcp_server" && change.command) {
      warnings.push(t("changes.warnMcpCommand", { name: change.name }));
    }
    if (change.type === "delete_bot") warnings.push(t("changes.warnDeleteBot", { bot: change.bot }));
    if (change.type === "delete_team") warnings.push(t("changes.warnDeleteTeam", { team: change.team }));
    if (change.type === "remove_mcp_server") warnings.push(t("changes.warnRemoveMcp", { server: change.server }));
  }
  return warnings;
}

export function formatPluralCount(t: TFn, unit: "bot" | "team" | "server" | "command" | "tool" | "change" | "day" | "entry" | "line" | "routine" | "otherFile" | "word", count: number): string {
  const map: Record<typeof unit, [Parameters<TFn>[0], Parameters<TFn>[0]]> = {
    bot: ["units.botOne", "units.botOther"],
    team: ["units.teamOne", "units.teamOther"],
    server: ["units.serverOne", "units.serverOther"],
    command: ["units.commandOne", "units.commandOther"],
    tool: ["units.toolOne", "units.toolOther"],
    change: ["units.changeOne", "units.changeOther"],
    day: ["units.dayOne", "units.dayOther"],
    entry: ["units.entryOne", "units.entryOther"],
    line: ["units.lineOne", "units.lineOther"],
    routine: ["units.routineOne", "units.routineOther"],
    otherFile: ["units.otherFileOne", "units.otherFileOther"],
    word: ["units.wordOne", "units.wordOther"],
  };
  const [one, other] = map[unit];
  return pluralText(t, one, other, count);
}

interface JournalRowLike {
  file: string;
  actor: "bot" | "you";
  via: "chat" | "app" | "disk" | "undo";
  chat: { title: string } | null;
  kind: "created" | "edited" | "deleted";
  added: number;
  removed: number;
}

export function formatJournalSummary(t: TFn, row: JournalRowLike, botName: string): string {
  const who = row.actor === "bot" ? botName : t("panel.journalYou");
  const target = row.file === "MEMORY.md" ? "MEMORY.md" : t("panel.journalTopicTarget", { name: row.file.replace(/\.md$/, "") });
  if (row.kind === "created") {
    return row.added
      ? t("panel.journalCreatedWithLines", { who, target, lines: formatPluralCount(t, "line", row.added) })
      : t("panel.journalCreated", { who, target });
  }
  if (row.kind === "deleted") return t("panel.journalDeleted", { who, target });
  if (row.added && !row.removed) return t("panel.journalAdded", { who, target, lines: formatPluralCount(t, "line", row.added) });
  if (row.removed && !row.added) return t("panel.journalRemoved", { who, target, lines: formatPluralCount(t, "line", row.removed) });
  return t("panel.journalRewrote", { who, target, lines: formatPluralCount(t, "line", Math.max(row.added, row.removed)) });
}

export function formatJournalSource(t: TFn, row: Pick<JournalRowLike, "via" | "chat">): string {
  if (row.via === "undo") return t("panel.journalViaUndo");
  if (row.via === "disk") return t("panel.journalViaDisk");
  if (row.chat) return t("panel.journalViaChat", { title: row.chat.title });
  return t("panel.journalViaSettings");
}
