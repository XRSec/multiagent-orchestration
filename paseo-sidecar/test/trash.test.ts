import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importSkillDeduplicated } from "../src/registry/discover.js";
import { UnifiedRegistry } from "../src/registry/store.js";
import {
  deleteLibraryAssetToTrash,
  listTrashItems,
  purgeTrashItem,
  restoreTrashItem,
} from "../src/registry/trash.js";

describe("Trash management (imported vs deleted)", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("distinguishes imported backups from platform-deleted assets and supports restore/purge", () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-trash-"));
    const extSkill = mkdtempSync(join(tmpdir(), "ext-skill-"));
    tempDirs.push(root, extSkill);

    const registry = new UnifiedRegistry(root);
    const cuaDir = join(extSkill, "cua-driver");
    mkdirSync(cuaDir, { recursive: true });
    writeFileSync(join(cuaDir, "SKILL.md"), "---\nname: cua-driver\n---\n# CUA");

    // 1. Import external skill -> creates imported backup
    importSkillDeduplicated(cuaDir, "cua-driver", registry, "claude-code");
    expect(existsSync(join(registry.paths.skillsDir, "cua-driver"))).toBe(true);

    // 2. Delete from platform Library -> creates deleted trash item
    deleteLibraryAssetToTrash(registry, "skill", "cua-driver");
    expect(existsSync(join(registry.paths.skillsDir, "cua-driver"))).toBe(false);

    const items = listTrashItems(registry);
    const deletedItems = items.filter((i) => i.origin === "deleted");
    const importedItems = items.filter((i) => i.origin === "imported");
    expect(deletedItems).toHaveLength(1);
    expect(importedItems).toHaveLength(1);
    expect(deletedItems[0].id).toBe("cua-driver");
    expect(importedItems[0].platform).toBe("claude-code");

    // 3. Restore deleted item
    restoreTrashItem(registry, deletedItems[0].path);
    expect(existsSync(join(registry.paths.skillsDir, "cua-driver"))).toBe(true);

    // 4. Purge imported backup
    purgeTrashItem(importedItems[0].path);
    expect(listTrashItems(registry)).toHaveLength(0);
  });
});
