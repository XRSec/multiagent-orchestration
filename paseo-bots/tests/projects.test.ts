import { describe, expect, it } from "vitest";
import { mapHostProjects } from "../client/data";

describe("mapHostProjects", () => {
  it("maps projects to { id, label, directory } and filters out the managed Bots folder", () => {
    const result = mapHostProjects([
      {
        projectId: "proj-1",
        projectDisplayName: "multiagent-orchestration",
        projectCustomName: null,
        projectRootPath: "/Users/mock/IDEA.localized/multiagent-orchestration",
        projectKind: "git",
      },
      {
        projectId: "proj-2",
        projectDisplayName: "Bots",
        projectCustomName: null,
        projectRootPath: "/Users/mock/.paseo/plugin-data/paseo-bots/shared/Bots",
        projectKind: "directory",
      },
      {
        projectId: "proj-3",
        projectDisplayName: "sidecar-mcp",
        projectCustomName: "Sidecar Custom",
        projectRootPath: "/Users/mock/Projects/sidecar-mcp",
        projectKind: "git",
      },
      {
        projectId: "proj-4",
        projectDisplayName: "sidecar-mcp-dup",
        projectCustomName: null,
        projectRootPath: "/Users/mock/Projects/sidecar-mcp",
        projectKind: "git",
      },
      {
        projectId: "proj-5",
        projectDisplayName: "Bots",
        projectCustomName: null,
        projectRootPath: "C:\\Users\\mock\\.paseo\\plugin-data\\paseo-bots\\shared\\Bots\\",
        projectKind: "directory",
      },
      {
        projectId: "proj-6",
        projectDisplayName: "team-alpha",
        projectCustomName: "Alpha Squad",
        projectRootPath: "/Users/mock/.paseo/plugin-data/paseo-bots/shared/Teams/team-alpha",
        projectKind: "directory",
      },
      {
        projectId: "proj-7",
        projectDisplayName: "Teams",
        projectCustomName: null,
        projectRootPath: "C:\\Users\\mock\\.paseo\\plugin-data\\paseo-bots\\shared\\Teams\\team-beta\\",
        projectKind: "directory",
      },
    ]);

    expect(result).toEqual([
      {
        id: "proj-1",
        label: "multiagent-orchestration",
        directory: "/Users/mock/IDEA.localized/multiagent-orchestration",
      },
      {
        id: "proj-3",
        label: "Sidecar Custom",
        directory: "/Users/mock/Projects/sidecar-mcp",
      },
    ]);
  });
});
