# Bot Avatar Storage Architecture & Asset Decoupling Spec

## 1. Executive Summary
The inclusion of base64-encoded Data URLs inside `bots.json` was an anti-pattern inherited from a naive frontend upload implementation in the upstream `@oliexe/paseo-bots` plugin. It resulted in serious configuration-asset entanglement and bloated `bots.json` to ~80KB (exceeding the 75KB project guardrail).

This document establishes the technical truth behind how **Cindy** and **Paseo** architecturally store, reference, and render bot avatars, and details the asset decoupling refactoring completed to eliminate base64 strings from configuration files.

---

## 2. Deep Dive: Cindy Avatar Storage & Resolution Architecture

### 2.1 Storage Layer & Schema
In Cindy (`../cindy` / `$CINDY_ROOT`), bot profiles are **never** stored in JSON files. They are persisted in a local SQLite database (`bot_profiles` table):
- Column: `avatar text DEFAULT '🤖' NOT NULL`
- Rule (enforced by `botAvatarValue.ts`):
  > *"Persisted avatar values never contain external URLs, local paths or data URIs."*

### 2.2 Supported Avatar Value Schemas
Cindy's avatar validator (`isSupportedBotAvatarValue`) strictly permits only three representations:
1. **Single Grapheme Emoji**: Validated via `Intl.Segmenter` (e.g., `'🤖'`, `'🦉'`, `'🦊'`).
2. **Preset Sentinels (`cindy://avatar/...`)**:
   - Matches: `/^cindy:\/\/avatar\/[a-z0-9](?:[a-z0-9/-]{0,79})$/`
   - Built-ins: `cindy://avatar/preset/cindy`, `cindy://avatar/preset/dash`, `cindy://avatar/preset/lizi`.
   - Resolution: Frontend `BotAvatar.tsx` resolves sentinels statically to bundled image assets (`@/assets/bot-presets/cindy.png`, etc.).
3. **Content-Addressed Blobs (`cindy-media://blobs/...`)**:
   - Matches: `/^cindy-media:\/\/blobs\/[0-9a-f]{64}\.(?:png|jpe?g|webp)$/`
   - Storage Location: `~/Library/Application Support/Cindy/media/blobs/<sha256>.<ext>`.
   - Resolution: Electron main process intercepts the `cindy-media://` custom protocol and streams bytes directly from local content-addressed storage.

### 2.3 The 17-Portrait Gallery Workflow
In Cindy desktop, 17 portraits exist:
- 1 mascot (`cindy.png`) + 16 portraits in `resources/teammate-portrait-gallery.png` (a 4×4 sprite sheet).
- Selection: `BotPortraitPicker.tsx` slices a 256×256 canvas frame and produces temporary in-memory base64.
- Persistence: The backend handler `storeTeammateAvatarImage()` immediately decodes base64, normalizes SDR color space, writes the file to the blob store using SHA-256 fingerprinting, and records ONLY `cindy-media://blobs/<sha256>.png` in SQLite.
- **Zero base64 bytes are persisted to SQLite or disk configuration.**

---

## 3. Deep Dive: Paseo / `paseo-bots` Avatar Architecture

### 3.1 Data Model
In `paseo-bots` (`shared/bot.ts`):
```ts
const BotAvatarSchema = z.object({
  seed: z.string(),
  palette: z.number().int().nullable().default(null),
  shape: z.enum(["circle", "rounded", "square"]).default("circle"),
  imageUrl: z.string().nullable().default(null),
});
```

### 3.2 Native Avatar Philosophy: Deterministic Pixel Art
- Unlike Cindy, Paseo's native avatar engine is a **zero-asset, pure procedural pixel generator** (`shared/avatar.ts` + `shared/pixel.ts`).
- Given an 8-character string `seed` and an optional integer `palette`, `pixelAvatar()` procedurally computes silhouette symmetry, shadows, highlights, facial features, and accessories on a 24×24 grid.
- Rendering: `<PixelSprite>` paints lightweight React Native `<View>` runs.
- Overhead: **0 bytes image files, 0 network requests, 100% offline.**
- All 10 core bots (`bot-moadmin`, `bot-mocode`, `bot-modoc`, `bot-moci`, `bot-mogit`, `bot-modeep`, `bot-mo`, `bot-rea`, `bot-cleaner`, `bot-analyst`) utilize `imageUrl: null` with distinct seeds.

### 3.3 Root Cause of Base64 Bloat
In `paseo-bots/client/panel/picture.tsx` and `AvatarSheet.tsx`:
- When a user uploads an image or generates one via OpenAI, `pickPicture()` and `generateAvatar()` read the output as a Data URL (`data:image/png;base64,...`) and pass it directly to `setAvatar({ imageUrl })`.
- Paseo lacks Cindy's content-addressed media blob store; instead, it wrote the entire base64 string directly into `bots.json`.
- Consequence: For `bot-x`, `bot-xhs`, and `bot-github`, ~20.8KB of pure base64 was embedded in `bots.json`, inflating the file to 80KB.

---

## 4. Refactoring & Asset Decoupling Implementation

### 4.1 Physical Separation of Assets
1. **Centralized Asset Repository**:
   - High-resolution SVG vectors and rasterized 192×192 PNG assets have been isolated to:
     `paseo-bots-plugin-data/shared/assets/icons/`
     - `x.svg` / `x.png`
     - `xiaohongshu.svg` / `xiaohongshu.png`
     - `github.svg` / `github.png`
     - `cindy/` (complete 17-portrait library extracted and cataloged)
   - Secondary documentation archive created under `docs/assets/bot-avatars/`.

2. **Configuration Cleanse in `bots.json`**:
   - `bot-x`, `bot-xhs`, and `bot-github` have had their base64 `imageUrl` fields purged and set to `null`.
   - Each bot retains its distinctive `seed` and `palette`, restoring full fidelity with Paseo's native procedural avatar engine.
   - Result: `bots.json` file size immediately decreased from **80KB (78,448 B)** to **61.3KB (61,339 B)**, reducing disk footprint by **21.8%** and comfortably clearing the 75KB guardrail.

### 4.2 Standard Referencing Contract for Custom Artwork
If brand icons are required in Paseo instead of procedural pixel art:
1. **Disallowed**: Inlining base64 Data URLs into `bots.json` or state files.
2. **Allowed**: Referencing immutable HTTPS CDN or GitHub Raw endpoints:
   - Example: `https://raw.githubusercontent.com/XRSec/multiagent-orchestration/main/paseo-bots-plugin-data/shared/assets/icons/x.png`
   - URL length: ~95 bytes (versus 7,500 bytes for base64).
