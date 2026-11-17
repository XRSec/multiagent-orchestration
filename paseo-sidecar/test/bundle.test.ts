import { describe, expect, it } from "vitest";
import { aggregateDiscoveredBundles, normalizeCapabilityId } from "../src/registry/bundle.js";

describe("Capability normalization and bundle aggregation", () => {
  it("normalizes duplicated and space-separated IDs like Nowledge mem", () => {
    expect(normalizeCapabilityId("Nowledge mem")).toBe("nowledge-mem");
    expect(normalizeCapabilityId("nowledge-mem_nowledge-mem")).toBe("nowledge-mem");
    expect(normalizeCapabilityId("cua-driver")).toBe("cua-driver");
  });

  it("merges skill + mcp + plugin under one canonical bundle across platforms", () => {
    const bundles = aggregateDiscoveredBundles({
      skills: [
        {
          id: "cua-driver",
          platform: "claude-code",
          sourcePath: "/tmp/cua",
          sha256: "abc",
          alreadyImported: false,
        },
      ],
      plugins: [
        {
          id: "nowledge-mem",
          platform: "claude-code",
          sourcePath: "/tmp/nm",
          version: "0.7.36",
          alreadyImported: true,
        },
      ],
      mcps: [
        {
          id: "cua-driver",
          platform: "claude-desktop-3p",
          config: { command: "cua" },
          alreadyImported: false,
        },
        {
          id: "nowledge-mem_nowledge-mem",
          platform: "gemini-cli",
          config: { type: "agy-mcp-dir" },
          alreadyImported: false,
        },
      ],
    });

    expect(bundles).toHaveLength(2);
    const cua = bundles.find((b) => b.canonicalId === "cua-driver")!;
    expect(cua.kinds).toEqual(["skill", "mcp"]);
    expect(cua.platforms).toEqual(["claude-code", "claude-desktop-3p"]);
    expect(cua.allImported).toBe(false);

    const nm = bundles.find((b) => b.canonicalId === "nowledge-mem")!;
    expect(nm.kinds).toEqual(["plugin", "mcp"]);
    expect(nm.platforms).toEqual(["claude-code", "gemini-cli"]);
    expect(nm.plugins).toHaveLength(1);
    expect(nm.mcps).toHaveLength(1);
  });
});
