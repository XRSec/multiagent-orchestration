/**
 * Purpose: Content-Addressed Storage (CAS) for bot avatar media blobs based on SHA-256.
 * Context: Cindy-compatible local media blob store decoupling image bytes from bots.json.
 * Usage: import { storeAvatarBlob, readAvatarBlob, mediaBlobsDir } from "./media-storage";
 * Prerequisites: Node.js fs/promises and crypto.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { casMediaUrl, parseCasBlobRef } from "../shared/avatar-presets";
import { pluginDataPath } from "./bot-home";

export const MAX_AVATAR_BYTES = 10 * 1024 * 1024; // 10 MB

const MIME_TO_EXT: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

const EXT_TO_MIME: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/** Directory root holding content-addressed media blobs on this host. */
export function mediaBlobsDir(): string {
  return join(pluginDataPath(), "media", "blobs");
}

export interface StoreBlobInput {
  dataBase64: string;
  mimeType?: string;
  customBlobsDir?: string;
}

export interface StoredBlobResult {
  uri: string;
  hash: string;
  ext: string;
  mimeType: string;
  bytes: number;
}

/** Parses raw base64 or Data URL into buffer and detected MIME type. */
function decodeInputBase64(dataBase64: string, fallbackMime?: string): { buffer: Buffer; mimeType: string } {
  let cleanBase64 = dataBase64.trim();
  let mimeType = fallbackMime ?? "image/png";

  const dataUriMatch = cleanBase64.match(/^data:([^;,]+);base64,(.+)$/i);
  if (dataUriMatch && dataUriMatch[1] && dataUriMatch[2]) {
    mimeType = dataUriMatch[1].toLowerCase();
    cleanBase64 = dataUriMatch[2];
  }

  const buffer = Buffer.from(cleanBase64, "base64");
  if (buffer.byteLength === 0) throw new Error("Empty image data provided.");
  if (buffer.byteLength > MAX_AVATAR_BYTES) throw new Error(`Image size exceeds ${MAX_AVATAR_BYTES / (1024 * 1024)}MB limit.`);

  const normalizedMime = mimeType.toLowerCase();
  if (!MIME_TO_EXT[normalizedMime]) {
    throw new Error(`Unsupported image MIME type: ${normalizedMime}. Expected PNG, JPEG, WebP, GIF, or SVG.`);
  }

  return { buffer, mimeType: normalizedMime };
}

/**
 * Stores avatar image bytes into local Content-Addressed Storage (CAS).
 * Computes SHA-256 fingerprint, deduplicates identical payloads, and writes atomically.
 */
export async function storeAvatarBlob(input: StoreBlobInput): Promise<StoredBlobResult> {
  const { buffer, mimeType } = decodeInputBase64(input.dataBase64, input.mimeType);
  const hash = createHash("sha256").update(buffer).digest("hex");
  const ext = MIME_TO_EXT[mimeType] ?? ".png";
  const blobsDir = input.customBlobsDir ?? mediaBlobsDir();

  await mkdir(blobsDir, { recursive: true });

  const finalPath = join(blobsDir, `${hash}${ext}`);

  // Deduplication check: if file already exists with same size, avoid rewriting
  try {
    const existing = await stat(finalPath);
    if (existing.isFile() && existing.size === buffer.byteLength) {
      return {
        uri: casMediaUrl(hash, ext),
        hash,
        ext,
        mimeType,
        bytes: buffer.byteLength,
      };
    }
  } catch {
    // File does not exist, proceed to write
  }

  const tmpPath = join(blobsDir, `.tmp-${Date.now().toString(36)}-${randomUUID()}`);
  await writeFile(tmpPath, buffer);
  await rename(tmpPath, finalPath);

  return {
    uri: casMediaUrl(hash, ext),
    hash,
    ext,
    mimeType,
    bytes: buffer.byteLength,
  };
}

export interface ReadBlobOptions {
  customBlobsDir?: string;
}

/**
 * Reads a content-addressed media blob from disk and returns it as a Data URL.
 * Strictly verifies the hash and extension format to guarantee zero directory traversal.
 */
export async function readAvatarBlob(uri: string, options: ReadBlobOptions = {}): Promise<{ dataUri: string; mimeType: string; bytes: number }> {
  const ref = parseCasBlobRef(uri);
  if (!ref) throw new Error(`Invalid CAS media URI: "${uri}". Expected format: media://blobs/<sha256>.<ext>`);

  const { hash, ext } = ref;
  const mimeType = EXT_TO_MIME[ext];
  if (!mimeType) throw new Error(`Unrecognized media extension in URI: "${ext}"`);

  const primaryDir = options.customBlobsDir ?? mediaBlobsDir();
  const primaryPath = join(primaryDir, `${hash}${ext}`);

  let buffer: Buffer;
  try {
    buffer = await readFile(primaryPath);
  } catch {
    // Fallback: check shared media directory if primary is separate
    const sharedPath = join(pluginDataPath(), "shared", "media", "blobs", `${hash}${ext}`);
    try {
      buffer = await readFile(sharedPath);
    } catch {
      throw new Error(`Media blob not found for URI: ${uri}`);
    }
  }

  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
  return { dataUri, mimeType, bytes: buffer.byteLength };
}
