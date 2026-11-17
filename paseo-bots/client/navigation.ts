import { createContext, useContext } from "react";
import type { LibraryKind } from "../shared/library";

/** The library item to show: a skill, an MCP server, a connected app, or the app catalog. */
export type LibraryTarget = { kind: LibraryKind | "app"; id: string } | { kind: "apps" };

type Listener = (target: LibraryTarget | null) => void;
const listeners = new Set<Listener>();

export function openLibrary(target: LibraryTarget | null = null): void {
  for (const listener of listeners) listener(target);
}

export function onLibraryTarget(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let globalNavigation: any = null;

export function setGlobalNavigation(navigation: any): void {
  globalNavigation = navigation;
}

export function getGlobalNavigation(): any {
  return globalNavigation;
}

// Navigation belongs to the surface that contains the pressed control. Previous
// mobile routes can remain mounted in Paseo's stack without handling its presses.
export const LibraryNavigation = createContext<(target?: LibraryTarget | null) => void>(() => {});
export const useOpenLibrary = () => useContext(LibraryNavigation);
