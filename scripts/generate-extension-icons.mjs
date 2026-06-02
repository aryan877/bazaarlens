import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICON_DIR = resolve(REPO_ROOT, "apps/extension/public/icons");
const SIZES = [16, 32, 48, 128];

mkdirSync(ICON_DIR, { recursive: true });

for (const size of SIZES) {
  writeFileSync(join(ICON_DIR, `icon-${size}.png`), createIcon(size));
}

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const lensCenterX = size * 0.65;
  const lensCenterY = size * 0.65;
  const lensInnerRadius = size * 0.13;
  const lensOuterRadius = size * 0.2;
  const cornerRadius = size * 0.19;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const bg = roundedRectContains(x, y, size, cornerRadius) ? backgroundColor(x, y, size) : [0, 0, 0, 0];
      let [red, green, blue, alpha] = bg;
      const inInnerRect = roundedRectContainsInset(x, y, size, cornerRadius, Math.max(1, size * 0.045));
      if (alpha && !inInnerRect) {
        [red, green, blue, alpha] = [24, 48, 45, 255];
      }

      const inAwning =
        alpha &&
        y >= size * 0.31 &&
        y <= size * 0.44 &&
        x >= size * 0.16 &&
        x <= size * 0.78 &&
        y >= size * 0.31 + Math.abs(x - center) * 0.02;
      if (inAwning) {
        const stripe = Math.floor(((x - size * 0.16) / (size * 0.62)) * 5);
        [red, green, blue, alpha] = stripe % 2 === 0 ? [216, 91, 61, 255] : [231, 173, 56, 255];
      }

      const inAwningValance =
        alpha &&
        y > size * 0.43 &&
        y <= size * 0.53 &&
        x >= size * 0.17 &&
        x <= size * 0.77;
      if (inAwningValance) {
        [red, green, blue, alpha] = [255, 247, 230, 255];
      }

      const inShopBase =
        alpha &&
        y >= size * 0.58 &&
        y <= size * 0.78 &&
        x >= size * 0.3 &&
        x <= size * 0.58;
      if (inShopBase) {
        [red, green, blue, alpha] = [23, 71, 67, 255];
      }

      const lensDistance = distance(x, y, lensCenterX, lensCenterY);
      const handleDistance = distanceToLineSegment(
        x,
        y,
        lensCenterX + lensOuterRadius * 0.58,
        lensCenterY + lensOuterRadius * 0.58,
        lensCenterX + lensOuterRadius * 1.32,
        lensCenterY + lensOuterRadius * 1.32,
      );

      if (alpha && handleDistance < size * 0.055) {
        [red, green, blue, alpha] = [216, 91, 61, 255];
      }
      if (alpha && lensDistance < lensOuterRadius) {
        [red, green, blue, alpha] = [23, 71, 67, 255];
      }
      if (alpha && lensDistance < lensInnerRadius) {
        const shine = Math.max(0, 1 - distance(x, y, lensCenterX - size * 0.06, lensCenterY - size * 0.08) / lensInnerRadius);
        red = Math.round(255 - shine * 12);
        green = Math.round(250 - shine * 10);
        blue = Math.round(241 - shine * 10);
        alpha = 255;
      }

      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
      pixels[index + 3] = alpha;
    }
  }

  return encodePng(size, size, pixels);
}

function backgroundColor(x, y, size) {
  const t = (x + y) / Math.max(1, size * 2 - 2);
  const vignette = Math.max(0, 1 - distance(x, y, (size - 1) / 2, (size - 1) / 2) / (size * 0.78));
  return [
    Math.round(255 - t * 7 - vignette * 3),
    Math.round(247 - t * 6 + vignette * 3),
    Math.round(230 + t * 10 + vignette * 4),
    255,
  ];
}

function roundedRectContains(x, y, size, radius) {
  const left = radius;
  const right = size - 1 - radius;
  const top = radius;
  const bottom = size - 1 - radius;
  const nearestX = Math.max(left, Math.min(x, right));
  const nearestY = Math.max(top, Math.min(y, bottom));
  return distance(x, y, nearestX, nearestY) <= radius;
}

function roundedRectContainsInset(x, y, size, radius, inset) {
  const insetSize = size - inset * 2;
  if (insetSize <= 0) return false;
  return roundedRectContains(x - inset, y - inset, insetSize, Math.max(0, radius - inset));
}

function encodePng(width, height, rgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  const lineLengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (lineLengthSquared === 0) return distance(px, py, x1, y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lineLengthSquared));
  return distance(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
}
