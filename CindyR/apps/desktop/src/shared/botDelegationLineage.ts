// Pure admission gate for delegation lineage and depth (I4).
// Shared by the main-process service (fast typed reject) and the DB worker
// transaction (authoritative gate). Must stay import-free.

/** Hard cap on stored lineage entries; independent of maxDepth; bounds JSON size. */
export const DELEGATION_LINEAGE_MAX_ENTRIES = 16;
/** Raw JSON length ceiling checked before parsing; bounds work on corrupted rows. */
export const DELEGATION_LINEAGE_MAX_JSON_CHARS = DELEGATION_LINEAGE_MAX_ENTRIES * 256;

export const DELEGATION_DEPTH_EXCEEDED = 'DELEGATION_DEPTH_EXCEEDED';

export type DelegationAdmissionCode =
  | 'DELEGATION_LINEAGE_INVALID'
  | 'DELEGATION_DEPTH_EXCEEDED'
  | 'DELEGATION_CYCLE'
  | 'DELEGATION_SELF_TARGET'
  | 'DELEGATION_TARGET_VERSION_MISSING';

const ADMISSION_CODES: readonly DelegationAdmissionCode[] = [
  'DELEGATION_LINEAGE_INVALID',
  'DELEGATION_DEPTH_EXCEEDED',
  'DELEGATION_CYCLE',
  'DELEGATION_SELF_TARGET',
  'DELEGATION_TARGET_VERSION_MISSING',
];

export type DelegationAdmission =
  | { ok: true; lineage: string[]; depth: number }
  | { ok: false; code: DelegationAdmissionCode };

export interface DelegationAdmissionInput {
  /** Lineage of the delegation that owns the caller session; [] for top-level callers. */
  parentLineage: readonly string[];
  /** 0 for top-level callers. */
  parentDepth: number;
  requesterBotId: string;
  /** null = plain Cindy task (no target bot). */
  targetBotId: string | null;
  targetProfileVersion: number | null;
  maxDepth: number;
}

function isLineageArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= DELEGATION_LINEAGE_MAX_ENTRIES
    && value.every((item) => typeof item === 'string' && item.length > 0);
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function isPositiveProfileVersion(value: number | null): boolean {
  return value !== null && Number.isInteger(value) && value >= 1;
}

/** Returns [] for empty input, null for anything malformed. Never throws. */
export function parseDelegationLineage(json: string | null | undefined): string[] | null {
  if (json === null || json === undefined || json === '' || json === '[]') return [];
  if (json.length > DELEGATION_LINEAGE_MAX_JSON_CHARS) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return isLineageArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function checkInputs(input: DelegationAdmissionInput): DelegationAdmissionCode | null {
  if (!isNonNegativeInteger(input.maxDepth) || !isNonNegativeInteger(input.parentDepth)) {
    return 'DELEGATION_LINEAGE_INVALID';
  }
  if (!isLineageArray(input.parentLineage)) return 'DELEGATION_LINEAGE_INVALID';
  return null;
}

function checkTarget(input: DelegationAdmissionInput): DelegationAdmissionCode | null {
  if (input.targetBotId === null) return null;
  if (!isPositiveProfileVersion(input.targetProfileVersion)) return 'DELEGATION_TARGET_VERSION_MISSING';
  if (input.targetBotId === input.requesterBotId) return 'DELEGATION_SELF_TARGET';
  return null;
}

function checkCycle(input: DelegationAdmissionInput): DelegationAdmissionCode | null {
  if (input.parentLineage.includes(input.requesterBotId)) return 'DELEGATION_CYCLE';
  if (input.targetBotId !== null && input.parentLineage.includes(input.targetBotId)) return 'DELEGATION_CYCLE';
  return null;
}

export function evaluateDelegationAdmission(input: DelegationAdmissionInput): DelegationAdmission {
  const failure = checkInputs(input) ?? checkTarget(input) ?? checkCycle(input);
  if (failure) return { ok: false, code: failure };
  const depth = input.parentDepth + 1;
  if (depth > input.maxDepth) return { ok: false, code: 'DELEGATION_DEPTH_EXCEEDED' };
  const lineage = [...input.parentLineage, input.requesterBotId];
  if (lineage.length > DELEGATION_LINEAGE_MAX_ENTRIES) return { ok: false, code: 'DELEGATION_LINEAGE_INVALID' };
  // Writer mirrors the reader cap so every stored lineage stays parseable.
  if (JSON.stringify(lineage).length > DELEGATION_LINEAGE_MAX_JSON_CHARS) {
    return { ok: false, code: 'DELEGATION_LINEAGE_INVALID' };
  }
  return { ok: true, lineage, depth };
}

/** Throws `new Error(code)` on rejection, matching the worker tx error convention. */
export function assertDelegationAdmissible(input: DelegationAdmissionInput): { lineage: string[]; depth: number } {
  const result = evaluateDelegationAdmission(input);
  if (!result.ok) throw new Error(result.code);
  return { lineage: result.lineage, depth: result.depth };
}

export function isDelegationAdmissionCode(message: unknown): message is DelegationAdmissionCode {
  return typeof message === 'string' && (ADMISSION_CODES as readonly string[]).includes(message);
}
