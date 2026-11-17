# Paseo Bots Icon & Avatar Asset Library

## 1. Overview
This directory serves as the centralized icon and avatar asset repository for Paseo Bots, storing vector sources, rasterized square PNGs (192x192), and ported portrait galleries.

## 2. Directory Structure
```
shared/assets/icons/
├── x.svg / x.png                   # X (Twitter) official brand icon
├── github.svg / github.png         # GitHub official Invertocat icon
├── xiaohongshu.svg / xiaohongshu.png # Xiaohongshu (RED) official brand icon
├── catalog.json                    # Master manifest of platforms & presets
├── cindy/                          # Ported Cindy 17-portrait avatar gallery
│   ├── cindy.jpg                   # Preset 0: Cindy mascot
│   ├── teammate_1.jpg .. 16.jpg    # Preset 1-16: Cindy teammate gallery
│   └── catalog.json                # Cindy preset catalog
```

## 3. Platform Icon Standards
- **Dimension**: 192x192 square canvas (`PICTURE_SIZE` standard in Paseo).
- **Format**: High-contrast PNG encoded as base64 Data URL (`data:image/png;base64,...`), matching React Native `<Image source={{ uri }} />` across all desktop and mobile platforms.
- **Brand Colors**:
  - `bot-x`: `#000000` background, `#FFFFFF` X mark.
  - `bot-github`: `#181717` background, `#FFFFFF` Octocat mark.
  - `bot-xhs`: `#FF2442` background, `#FFFFFF` Xiaohongshu calligraphy mark.

## 4. Cindy Porting & Built-in Avatar Gallery
Cindy's built-in avatar library (`apps/desktop/resources/teammate-portrait-gallery.png` and `apps/mobile/assets/bot-presets/portrait-gallery.json`) contains 17 high-quality illustrated portraits (1 mascot + 16 teammates).
These have been extracted into `cindy/` as individual JPEG assets and mapped into `catalog.json` for plug-and-play preset avatar selection.
