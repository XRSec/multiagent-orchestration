// Command Center items and composer pills can open the surface but can't pass
// it arguments directly. They leave an intent here; the surface consumes it
// when it mounts or immediately if already mounted.

export type SurfaceIntent =
  | { kind: "new-bot" }
  | { kind: "select-bot"; botId: string; mode?: "direct" | "team" }
  | { kind: "select-group"; groupId: string };

type IntentListener = (intent: SurfaceIntent) => void;
const listeners = new Set<IntentListener>();

let pending: SurfaceIntent | null = null;

export function requestIntent(intent: SurfaceIntent): void {
  pending = intent;
  for (const listener of listeners) {
    listener(intent);
  }
}

export function takeIntent(): SurfaceIntent | null {
  const intent = pending;
  pending = null;
  return intent;
}

export function onIntent(listener: IntentListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
