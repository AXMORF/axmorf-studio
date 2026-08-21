import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { AXMORF_MARK_PATHS } from "../../src/remotion/runtime/axmorf-brand/AxmorfMark";

const OUTPUT_SIZES = [16, 32, 64, 128, 256, 512, 1024] as const;
const MASTER_SIZE = 2048;
const SVG_SIZE = 640;
const BACKGROUND = [255, 253, 249, 255] as const;
const MARK = [36, 36, 36, 255] as const;
const ACCENT = [163, 125, 92, 255] as const;

type Point = readonly [number, number];

const parsePolygon = (path: string): readonly Point[] => {
  const tokens = path.match(/[MLHVZ]|-?\d+(?:\.\d+)?/gu);
  if (tokens === null) throw new Error(`Unsupported AXMORF path: ${path}`);
  const points: Point[] = [];
  let index = 0;
  let x = 0;
  let y = 0;
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === "Z") break;
    if (command === "M" || command === "L") {
      x = Number(tokens[index++]);
      y = Number(tokens[index++]);
    } else if (command === "H") {
      x = Number(tokens[index++]);
    } else if (command === "V") {
      y = Number(tokens[index++]);
    } else {
      throw new Error(`Unsupported AXMORF path command: ${command}`);
    }
    points.push([x, y]);
  }
  if (points.length < 3) throw new Error(`AXMORF path is not a polygon: ${path}`);
  return points;
};

const pointInPolygon = (x: number, y: number, polygon: readonly Point[]) => {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [currentX, currentY] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    if (
      currentY > y !== previousY > y &&
      x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const insideRoundedSquare = (x: number, y: number) => {
  const inset = MASTER_SIZE * 0.035;
  const radius = MASTER_SIZE * 0.19;
  const left = inset;
  const right = MASTER_SIZE - inset;
  const top = inset;
  const bottom = MASTER_SIZE - inset;
  const nearestX = Math.max(left + radius, Math.min(x, right - radius));
  const nearestY = Math.max(top + radius, Math.min(y, bottom - radius));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return x >= left && x <= right && y >= top && y <= bottom && dx * dx + dy * dy <= radius * radius;
};

const renderMaster = () => {
  const polygons = AXMORF_MARK_PATHS.map(parsePolygon);
  const pixels = Buffer.alloc(MASTER_SIZE * MASTER_SIZE * 4);
  const scale = MASTER_SIZE / SVG_SIZE;
  for (let y = 0; y < MASTER_SIZE; y += 1) {
    for (let x = 0; x < MASTER_SIZE; x += 1) {
      const offset = (y * MASTER_SIZE + x) * 4;
      let color: readonly number[] = [0, 0, 0, 0];
      if (insideRoundedSquare(x + 0.5, y + 0.5)) color = BACKGROUND;
      const sourceX = (x + 0.5) / scale;
      const sourceY = (y + 0.5) / scale;
      const polygonIndex = polygons.findIndex((polygon) => pointInPolygon(sourceX, sourceY, polygon));
      if (polygonIndex !== -1) color = polygonIndex === 2 ? ACCENT : MARK;
      pixels.set(color, offset);
    }
  }
  return pixels;
};

const downsample = (source: Buffer, size: number) => {
  const factor = MASTER_SIZE / size;
  if (!Number.isInteger(factor)) throw new Error(`Unsupported icon size: ${size}`);
  const target = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sourceY = y * factor; sourceY < (y + 1) * factor; sourceY += 1) {
        for (let sourceX = x * factor; sourceX < (x + 1) * factor; sourceX += 1) {
          const sourceOffset = (sourceY * MASTER_SIZE + sourceX) * 4;
          for (let channel = 0; channel < 4; channel += 1) totals[channel] += source[sourceOffset + channel];
        }
      }
      const samples = factor * factor;
      const targetOffset = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        target[targetOffset + channel] = Math.round(totals[channel] / samples);
      }
    }
  }
  return target;
};

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (name: string, data: Buffer) => {
  const type = Buffer.from(name, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
};

const encodePng = (size: number, pixels: Buffer) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const targetOffset = y * (size * 4 + 1);
    scanlines[targetOffset] = 0;
    pixels.copy(scanlines, targetOffset + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const encodeIcns = (pngs: ReadonlyMap<number, Buffer>) => {
  const iconTypes = new Map([
    [128, "ic07"],
    [256, "ic08"],
    [512, "ic09"],
    [1024, "ic10"],
  ]);
  const chunks = [...iconTypes].map(([size, type]) => {
    const data = pngs.get(size);
    if (data === undefined) throw new Error(`Missing ${size}px PNG for ICNS.`);
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32BE(data.length + header.length, 4);
    return Buffer.concat([header, data]);
  });
  const size = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(size, 4);
  return Buffer.concat([header, ...chunks]);
};

export const generateDesktopBrandAssets = async (outputDir: string) => {
  await mkdir(outputDir, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><rect x="12" y="12" width="616" height="616" rx="116" fill="#fffdf9"/>${AXMORF_MARK_PATHS.map((path, index) => `<path d="${path}" fill="${index === 2 ? "#a37d5c" : "#242424"}"/>`).join("")}</svg>\n`;
  const master = renderMaster();
  const pngs = new Map<number, Buffer>();
  for (const size of OUTPUT_SIZES) pngs.set(size, encodePng(size, downsample(master, size)));
  await Promise.all([
    writeFile(join(outputDir, "axmorf-studio-icon.svg"), svg),
    writeFile(join(outputDir, "axmorf-studio-icon.png"), pngs.get(1024)!),
    writeFile(join(outputDir, "axmorf-studio-icon.icns"), encodeIcns(pngs)),
  ]);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateDesktopBrandAssets(join(process.cwd(), "desktop/resources/brand")).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Desktop icon generation failed."}\n`);
    process.exitCode = 1;
  });
}
