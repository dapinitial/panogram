#!/usr/bin/env node
/**
 * Regenerate the raster favicon set from the vector source.
 *
 *   node scripts/generate-favicons.mjs
 *
 * Reads  src/app/icon.svg            (the hand-authored brand favicon)
 * Writes src/app/favicon.ico         (16 + 32 + 48 px, PNG-compressed ICO)
 *        src/app/apple-icon.png      (180 px, flattened on the void color —
 *                                     iOS composites black behind transparency)
 *
 * Uses the `sharp` already in dependencies; no extra installs. Run after any
 * edit to icon.svg so all three assets stay in sync.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "app");
const svg = await readFile(path.join(appDir, "icon.svg"));

// The SVG declares width/height 64 — density scales librsvg's rasterization so
// each target size is rendered at native resolution, not upscaled.
const renderPng = (size) =>
  sharp(svg, { density: (72 * size) / 64 }).resize(size, size).png().toBuffer();

const [png16, png32, png48] = await Promise.all([16, 32, 48].map(renderPng));
const apple = await sharp(svg, { density: (72 * 180) / 64 })
  .resize(180, 180)
  .flatten({ background: "#06060c" })
  .png()
  .toBuffer();

// ICO container with PNG-compressed entries (supported by every current browser).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, buf } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size % 256, 0); // width  (0 means 256)
    e.writeUInt8(size % 256, 1); // height
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.buf)]);
}

await writeFile(
  path.join(appDir, "favicon.ico"),
  ico([
    { size: 16, buf: png16 },
    { size: 32, buf: png32 },
    { size: 48, buf: png48 },
  ])
);
await writeFile(path.join(appDir, "apple-icon.png"), apple);
console.log("wrote src/app/favicon.ico (16/32/48) and src/app/apple-icon.png (180)");
