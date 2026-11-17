import { describe, expect, it } from "vitest";
import { isPresetAvatarUrl, parsePresetId, resolveAvatarUri, resolvePresetDataUri } from "../shared/avatar-presets";

describe("avatar presets resolution", () => {
  it("resolves built-in preset IDs to data URLs", () => {
    const xData = resolvePresetDataUri("preset:x");
    expect(xData).toMatch(/^data:image\/(svg\+xml|png);base64,/);

    const ghData = resolvePresetDataUri("preset:github");
    expect(ghData).toMatch(/^data:image\/(svg\+xml|png);base64,/);

    const xhsData = resolvePresetDataUri("preset:xiaohongshu");
    expect(xhsData).toMatch(/^data:image\/(svg\+xml|png);base64,/);

    // Alias xhs matches the same xiaohongshu preset
    const xhsAliasData = resolvePresetDataUri("preset:xhs");
    expect(xhsAliasData).toBe(xhsData);

    // Cindy and teammates
    const cindyData = resolvePresetDataUri("preset:cindy");
    expect(cindyData).toMatch(/^data:image\/(webp|jpeg|png);base64,/);

    const teammateData = resolvePresetDataUri("preset:teammate-1");
    expect(teammateData).toMatch(/^data:image\/(webp|jpeg|png);base64,/);
  });

  it("returns null for unknown presets", () => {
    expect(resolvePresetDataUri("preset:unknown_preset_12345")).toBeNull();
  });

  it("correctly identifies and parses preset sentinels", () => {
    expect(isPresetAvatarUrl("preset:x")).toBe(true);
    expect(isPresetAvatarUrl("preset://avatar/x")).toBe(true);
    expect(isPresetAvatarUrl("cindy://avatar/preset/cindy")).toBe(true);
    expect(isPresetAvatarUrl("file:///local/path.png")).toBe(false);

    expect(parsePresetId("preset:x")).toBe("x");
    expect(parsePresetId("preset:xiaohongshu")).toBe("xiaohongshu");
    expect(parsePresetId("preset:platform-github")).toBe("github");
  });

  it("resolveAvatarUri handles preset, file://, http://, and empty inputs", () => {
    // Preset should resolve to base64 data URL
    expect(resolveAvatarUri("preset:x")).toMatch(/^data:image\//);
    expect(resolveAvatarUri("preset:xiaohongshu")).toMatch(/^data:image\//);

    // file:// URIs should pass through untouched for native React Native rendering
    expect(resolveAvatarUri("file:///mock/avatar.png")).toBe("file:///mock/avatar.png");

    // http(s):// URIs should pass through untouched
    expect(resolveAvatarUri("https://example.com/bot.png")).toBe("https://example.com/bot.png");

    // null / undefined
    expect(resolveAvatarUri(null)).toBeNull();
    expect(resolveAvatarUri(undefined)).toBeNull();
  });
});
