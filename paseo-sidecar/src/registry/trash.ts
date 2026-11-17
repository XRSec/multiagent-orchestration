import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { UnifiedRegistry } from "./store.js";

export type TrashOrigin = "imported" | "deleted";
export type AssetKind = "skill" | "plugin" | "mcp";

export interface TrashItem {
  key: string;
  id: string;
  kind: AssetKind;
  origin: TrashOrigin;
  platform: string;
  scope?: "global" | "project";
  originalPath?: string;
  path: string;
  createdAt: string;
}

export function getTrashDir(registry: UnifiedRegistry): string {
  const dir = join(registry.paths.home, "trash");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function deleteLibraryAssetToTrash(
  registry: UnifiedRegistry,
  kind: AssetKind,
  id: string,
): TrashItem {
  const trashRoot = join(getTrashDir(registry), kind);
  mkdirSync(trashRoot, { recursive: true });

  let sourcePath = "";
  let platform = "sidecar";

  if (kind === "skill") {
    sourcePath = join(registry.paths.skillsDir, id);
  } else if (kind === "plugin") {
    sourcePath = join(registry.paths.pluginsCacheDir, id);
    if (id.includes("--")) platform = id.split("--")[0];
  } else {
    sourcePath = join(registry.paths.mcpsDir, `${id}.json`);
  }

  if (!existsSync(sourcePath)) {
    throw new Error(`Asset not found: ${kind}/${id}`);
  }

  const stamp = Date.now();
  const destDir = join(trashRoot, `${id}--${stamp}`);
  mkdirSync(destDir, { recursive: true });

  const payloadPath = kind === "mcp" ? join(destDir, `${id}.json`) : join(destDir, "payload");
  cpSync(sourcePath, payloadPath, { recursive: true, dereference: true, force: true });
  rmSync(sourcePath, { recursive: true, force: true });

  const meta: TrashItem = {
    key: `deleted:${kind}:${id}--${stamp}`,
    id,
    kind,
    origin: "deleted",
    platform,
    path: destDir,
    createdAt: new Date(stamp).toISOString(),
  };
  writeFileSync(join(destDir, ".trash-meta.json"), JSON.stringify(meta, null, 2));
  return meta;
}

export function listTrashItems(registry: UnifiedRegistry): TrashItem[] {
  const items: TrashItem[] = [];

  // 1. 本平台删除的资产 (~/.sidecar/trash/<kind>/<id>--<ts>)
  const trashRoot = getTrashDir(registry);
  for (const kind of ["skill", "plugin", "mcp"] as AssetKind[]) {
    const kindDir = join(trashRoot, kind);
    if (!existsSync(kindDir)) continue;
    for (const entry of readdirSync(kindDir)) {
      const entryPath = join(kindDir, entry);
      if (!statSync(entryPath).isDirectory()) continue;
      const metaFile = join(entryPath, ".trash-meta.json");
      if (existsSync(metaFile)) {
        try {
          items.push(JSON.parse(readFileSync(metaFile, "utf8")) as TrashItem);
          continue;
        } catch {
          // fallback below
        }
      }
      items.push({
        key: `deleted:${kind}:${entry}`,
        id: entry.replace(/--\d+$/, ""),
        kind,
        origin: "deleted",
        platform: "sidecar",
        path: entryPath,
        createdAt: statSync(entryPath).mtime.toISOString(),
      });
    }
  }

  // 2. 外部导入备份 / 去重归档 (~/.sidecar/backups/<platform>/<skills|plugins>/<id>)
  const backupsDir = registry.paths.backupsDir;
  if (existsSync(backupsDir)) {
    for (const platform of readdirSync(backupsDir)) {
      const pDir = join(backupsDir, platform);
      if (!statSync(pDir).isDirectory()) continue;
      for (const sub of ["skills", "plugins"] as const) {
        const subDir = join(pDir, sub);
        if (!existsSync(subDir)) continue;
        const kind: AssetKind = sub === "skills" ? "skill" : "plugin";
        for (const entry of readdirSync(subDir)) {
          const entryPath = join(subDir, entry);
          if (!statSync(entryPath).isDirectory()) continue;
          let scope: "global" | "project" | undefined;
          let originalPath: string | undefined;
          const bMetaFile = join(entryPath, ".backup-meta.json");
          if (existsSync(bMetaFile)) {
            try {
              const bm = JSON.parse(readFileSync(bMetaFile, "utf8")) as {
                scope?: "global" | "project";
                originalPath?: string;
              };
              scope = bm.scope;
              originalPath = bm.originalPath;
            } catch {
              // ignore
            }
          }
          items.push({
            key: `imported:${platform}:${sub}:${entry}`,
            id: entry.replace(/--\d+$/, ""),
            kind,
            origin: "imported",
            platform,
            scope,
            originalPath,
            path: entryPath,
            createdAt: statSync(entryPath).mtime.toISOString(),
          });
        }
      }
    }
  }

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function restoreTrashItem(
  registry: UnifiedRegistry,
  itemPath: string,
  mode: "sidecar" | "original" = "sidecar",
): { restoredTo: string } {
  if (!existsSync(itemPath)) {
    throw new Error(`Trash item not found: ${itemPath}`);
  }
  const metaFile = join(itemPath, ".trash-meta.json");
  if (existsSync(metaFile)) {
    const meta = JSON.parse(readFileSync(metaFile, "utf8")) as TrashItem;
    let targetPath = "";
    const payloadPath = meta.kind === "mcp" ? join(itemPath, `${meta.id}.json`) : join(itemPath, "payload");
    if (meta.kind === "skill") targetPath = join(registry.paths.skillsDir, meta.id);
    else if (meta.kind === "plugin") targetPath = join(registry.paths.pluginsCacheDir, meta.id);
    else targetPath = join(registry.paths.mcpsDir, `${meta.id}.json`);

    cpSync(payloadPath, targetPath, { recursive: true, dereference: true, force: true });
    rmSync(itemPath, { recursive: true, force: true });
    return { restoredTo: targetPath };
  }

  const bMetaFile = join(itemPath, ".backup-meta.json");
  let originalPath: string | undefined;
  if (existsSync(bMetaFile)) {
    try {
      const bm = JSON.parse(readFileSync(bMetaFile, "utf8")) as { originalPath?: string };
      originalPath = bm.originalPath;
    } catch {
      // ignore
    }
  }

  const id = basename(itemPath).replace(/--\d+$/, "");
  const targetPath = mode === "original" && originalPath ? originalPath : join(registry.paths.skillsDir, id);
  cpSync(itemPath, targetPath, { recursive: true, dereference: true, force: true });
  rmSync(join(targetPath, ".backup-meta.json"), { force: true });
  return { restoredTo: targetPath };
}

export function purgeTrashItem(itemPath: string): void {
  if (existsSync(itemPath)) {
    rmSync(itemPath, { recursive: true, force: true });
  }
}
