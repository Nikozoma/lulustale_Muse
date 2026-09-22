import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const BASELINE_ROOT = path.join(
  PROJECT_ROOT,
  "character-production",
  "projects",
  "lulu",
  "history",
  "revision-4-targeted-repair-baseline"
);
const IMPORT_ROOT = path.join(
  PROJECT_ROOT,
  "character-production",
  "projects",
  "lulu",
  "imports",
  "canonical-anime-r5-fringe-sidewalk-repair"
);
const DERIVED_ROOT = path.join(
  PROJECT_ROOT,
  "character-production",
  "projects",
  "lulu",
  "derived",
  "canonical-anime-r5-fringe-sidewalk-repair"
);
const SHEET_ROOT = path.join(DERIVED_ROOT, "sheets");

const CELL = 96;
const ROOT_X = 48;
const ROOT_Y = 88;
const SIDE_TARGET_HEIGHT = 68;
const SIDE_MAX_WIDTH = 86;
const DIRECTIONS = [
  "Down",
  "Down-Left",
  "Left",
  "Up-Left",
  "Up",
  "Up-Right",
  "Right",
  "Down-Right"
] as const;
const PROFILE_ROWS = [
  { direction: "Left" as const, row: 2, input: "left-walk-repaired-source.png" },
  { direction: "Right" as const, row: 6, input: "right-walk-repaired-source.png" }
];

type Bounds = { x: number; y: number; width: number; height: number };
type Component = {
  pixels: number[];
  bounds: Bounds;
  centerX: number;
  centerY: number;
};
type PackedFrame = {
  direction: "Left" | "Right";
  index: number;
  pixels: Buffer;
  bounds: Bounds;
  upperBodyCenterX: number;
  groundY: number;
};

async function main(): Promise<void> {
  await mkdir(SHEET_ROOT, { recursive: true });
  const idleBaselinePath = path.join(BASELINE_ROOT, "idle.png");
  const walkBaselinePath = path.join(BASELINE_ROOT, "walk.png");
  const runBaselinePath = path.join(BASELINE_ROOT, "run.png");
  const idleBaseline = await readFile(idleBaselinePath);
  const walkBaseline = await readFile(walkBaselinePath);
  const runBaseline = await readFile(runBaselinePath);

  const idleRaw = await rgba(idleBaseline);
  const walkRaw = await rgba(walkBaseline);
  const idleCleanup = cleanBrightExterior(
    idleRaw.data,
    idleRaw.info.width,
    4,
    8
  );
  const walkCleanup = cleanBrightExterior(
    walkRaw.data,
    walkRaw.info.width,
    8,
    8
  );

  const profileReports = [];
  for (const profile of PROFILE_ROWS) {
    const sourcePath = path.join(IMPORT_ROOT, profile.input);
    const sourceBytes = await readFile(sourcePath);
    const frames = await packProfileFrames(sourceBytes, profile.direction);
    for (const frame of frames) {
      writeCell(
        walkCleanup.data,
        walkRaw.info.width,
        profile.row,
        frame.index,
        frame.pixels
      );
    }
    profileReports.push({
      direction: profile.direction,
      input: projectPath(sourcePath),
      inputSha256: sha256(sourceBytes),
      frames: frames.map((frame) => ({
        index: frame.index,
        bounds: frame.bounds,
        upperBodyCenterX: frame.upperBodyCenterX,
        groundY: frame.groundY
      }))
    });
  }

  const finalWalkCleanup = cleanBrightExterior(
    walkCleanup.data,
    walkRaw.info.width,
    8,
    8
  );
  const idleOutput = await encode(
    idleCleanup.data,
    idleRaw.info.width,
    idleRaw.info.height
  );
  const walkOutput = await encode(
    finalWalkCleanup.data,
    walkRaw.info.width,
    walkRaw.info.height
  );
  const idleOutputPath = path.join(SHEET_ROOT, "Lulu_idle.png");
  const walkOutputPath = path.join(SHEET_ROOT, "Lulu_walk.png");
  await writeFile(idleOutputPath, idleOutput);
  await writeFile(walkOutputPath, walkOutput);

  const report = {
    schema: "lulus-character-targeted-motion-repair-report",
    version: 1,
    characterId: "lulu",
    revision: 5,
    generatedAt: new Date().toISOString(),
    scope: {
      changedActions: ["idle", "walk"],
      profileRowsReauthored: ["Left", "Right"],
      diagonalRowsPreserved: ["Down-Left", "Up-Left", "Up-Right", "Down-Right"],
      runPreserved: true
    },
    contract: {
      cell: [CELL, CELL],
      root: [ROOT_X, ROOT_Y],
      directionOrder: DIRECTIONS,
      walkCycleDistancePx: 96,
      runCycleDistancePx: 160,
      worldMovementSpeedChanged: false
    },
    baseline: {
      idle: {
        path: projectPath(idleBaselinePath),
        sha256: sha256(idleBaseline)
      },
      walk: {
        path: projectPath(walkBaselinePath),
        sha256: sha256(walkBaseline)
      },
      run: {
        path: projectPath(runBaselinePath),
        sha256: sha256(runBaseline)
      }
    },
    cleanup: {
      idleBrightExteriorPixelsRecolored: idleCleanup.recolored,
      walkBaselineBrightExteriorPixelsRecolored: walkCleanup.recolored,
      walkFinalBrightExteriorPixelsRecolored: finalWalkCleanup.recolored
    },
    profiles: profileReports,
    outputs: {
      idle: {
        path: projectPath(idleOutputPath),
        sha256: sha256(idleOutput),
        dimensions: [idleRaw.info.width, idleRaw.info.height]
      },
      walk: {
        path: projectPath(walkOutputPath),
        sha256: sha256(walkOutput),
        dimensions: [walkRaw.info.width, walkRaw.info.height]
      },
      run: {
        path: projectPath(runBaselinePath),
        sha256: sha256(runBaseline),
        changed: false
      }
    }
  };
  await writeFile(
    path.join(DERIVED_ROOT, "targeted-repair-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  console.log(`idle: ${report.outputs.idle.sha256}`);
  console.log(`walk: ${report.outputs.walk.sha256}`);
  console.log(`run-preserved: ${report.outputs.run.sha256}`);
}

async function packProfileFrames(
  sourceBytes: Buffer,
  direction: "Left" | "Right"
): Promise<PackedFrame[]> {
  const source = await rgba(sourceBytes);
  const keyed = removeGreen(source.data, source.info.width, source.info.height);
  const components = findComponents(keyed, source.info.width, source.info.height)
    .filter((component) => component.pixels.length >= 100)
    .sort((left, right) => left.centerY - right.centerY);
  if (components.length !== 8) {
    throw new Error(`${direction} gait source requires 8 character components; found ${components.length}.`);
  }
  const ordered = [
    ...components.slice(0, 4).sort((left, right) => left.centerX - right.centerX),
    ...components.slice(4, 8).sort((left, right) => left.centerX - right.centerX)
  ];
  const referenceHeight = median(ordered.map((component) => component.bounds.height));
  const maximumHeight = Math.max(...ordered.map((component) => component.bounds.height));
  const maximumWidth = Math.max(...ordered.map((component) => component.bounds.width));
  const scale = Math.min(
    SIDE_TARGET_HEIGHT / referenceHeight,
    (ROOT_Y - 2) / maximumHeight,
    SIDE_MAX_WIDTH / maximumWidth
  );
  const groundOffsets = [0, 0, 0, -1, 0, 0, 0, -1];
  const packed: PackedFrame[] = [];

  for (const [index, component] of ordered.entries()) {
    const raw = componentRaw(keyed, source.info.width, component);
    const width = Math.max(1, Math.round(component.bounds.width * scale));
    const height = Math.max(1, Math.round(component.bounds.height * scale));
    const resized = await sharp(raw, {
      raw: {
        width: component.bounds.width,
        height: component.bounds.height,
        channels: 4
      }
    })
      .resize(width, height, { fit: "fill", kernel: sharp.kernel.nearest })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const binary = forceBinaryAlpha(resized);
    const sourceUpperX = upperBodyCenterX(
      raw,
      component.bounds.width,
      component.bounds.height
    );
    const scaledUpperX = sourceUpperX * scale;
    const x = Math.max(0, Math.min(CELL - width, Math.round(ROOT_X - scaledUpperX)));
    const groundY = ROOT_Y + groundOffsets[index];
    const y = groundY - height;
    if (y < 0 || x + width > CELL || y + height > CELL) {
      throw new Error(`${direction}/${index} does not fit the runtime cell.`);
    }
    const cell = Buffer.alloc(CELL * CELL * 4);
    blit(binary, width, height, cell, CELL, x, y);
    const cleaned = cleanBrightExterior(cell, CELL, 1, 1);
    packed.push({
      direction,
      index,
      pixels: cleaned.data,
      bounds: { x, y, width, height },
      upperBodyCenterX: round(x + scaledUpperX),
      groundY
    });
  }
  return packed;
}

function cleanBrightExterior(
  input: Buffer,
  width: number,
  columns: number,
  rows: number
): { data: Buffer; recolored: number } {
  const output = Buffer.from(input);
  let recolored = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = readCell(input, width, row, column);
      const result = cleanBrightCell(cell);
      recolored += result.recolored;
      writeCell(output, width, row, column, result.data);
    }
  }
  return { data: output, recolored };
}

function cleanBrightCell(input: Buffer): { data: Buffer; recolored: number } {
  const output = Buffer.from(input);
  const candidates = new Uint8Array(CELL * CELL);
  const opaquePoints: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const offset = (y * CELL + x) * 4;
      if (input[offset + 3] === 0) continue;
      opaquePoints.push({ x, y });
      const red = input[offset];
      const green = input[offset + 1];
      const blue = input[offset + 2];
      const average = (red + green + blue) / 3;
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (average < 65 || chroma > 50) continue;
      if (hasTransparentWithin(input, x, y, 2)) candidates[y * CELL + x] = 1;
    }
  }
  if (opaquePoints.length === 0) return { data: output, recolored: 0 };
  const centerX =
    opaquePoints.reduce((sum, point) => sum + point.x, 0) / opaquePoints.length;
  const centerY =
    opaquePoints.reduce((sum, point) => sum + point.y, 0) / opaquePoints.length;
  let recolored = 0;

  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      if (!candidates[y * CELL + x]) continue;
      const replacement = findInteriorReplacement(
        input,
        candidates,
        x,
        y,
        centerX,
        centerY
      );
      const offset = (y * CELL + x) * 4;
      if (replacement) {
        output[offset] = replacement[0];
        output[offset + 1] = replacement[1];
        output[offset + 2] = replacement[2];
      } else {
        output[offset] = Math.min(output[offset], 72);
        output[offset + 1] = Math.min(output[offset + 1], 72);
        output[offset + 2] = Math.min(output[offset + 2], 80);
      }
      recolored += 1;
    }
  }
  return { data: output, recolored };
}

function findInteriorReplacement(
  input: Buffer,
  candidates: Uint8Array,
  x: number,
  y: number,
  centerX: number,
  centerY: number
): [number, number, number] | null {
  let best:
    | { score: number; color: [number, number, number] }
    | undefined;
  const inwardX = centerX - x;
  const inwardY = centerY - y;
  const inwardLength = Math.max(1, Math.hypot(inwardX, inwardY));
  for (let radius = 1; radius <= 5; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= CELL || nextY >= CELL) continue;
        const pixel = nextY * CELL + nextX;
        const offset = pixel * 4;
        if (input[offset + 3] === 0 || candidates[pixel]) continue;
        const distance = Math.hypot(dx, dy);
        const direction =
          (dx * inwardX + dy * inwardY) / (Math.max(1, distance) * inwardLength);
        const brightness =
          (input[offset] + input[offset + 1] + input[offset + 2]) / 3;
        const score = distance * 10 - direction * 7 + brightness * 0.02;
        if (!best || score < best.score) {
          best = {
            score,
            color: [input[offset], input[offset + 1], input[offset + 2]]
          };
        }
      }
    }
    if (best) return best.color;
  }
  return null;
}

function hasTransparentWithin(
  input: Buffer,
  x: number,
  y: number,
  radius: number
): boolean {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextY < 0 || nextX >= CELL || nextY >= CELL) return true;
      if (input[(nextY * CELL + nextX) * 4 + 3] === 0) return true;
    }
  }
  return false;
}

function removeGreen(input: Buffer, width: number, height: number): Buffer {
  const output = Buffer.from(input);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const red = output[offset];
    const green = output[offset + 1];
    const blue = output[offset + 2];
    const dominance = green - Math.max(red, blue);
    if (green >= 80 && dominance >= 30) {
      clearPixel(output, offset);
      continue;
    }
    if (dominance > 0) output[offset + 1] = Math.max(red, blue);
  }
  return output;
}

function findComponents(input: Buffer, width: number, height: number): Component[] {
  const visited = new Uint8Array(width * height);
  const components: Component[] = [];
  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || input[start * 4 + 3] === 0) continue;
    const queue = [start];
    const pixels: number[] = [];
    visited[start] = 1;
    while (queue.length > 0) {
      const current = queue.pop()!;
      pixels.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (visited[next] || input[next * 4 + 3] === 0) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let sumX = 0;
    let sumY = 0;
    for (const pixel of pixels) {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
    }
    components.push({
      pixels,
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      },
      centerX: sumX / pixels.length,
      centerY: sumY / pixels.length
    });
  }
  return components;
}

function componentRaw(
  source: Buffer,
  sourceWidth: number,
  component: Component
): Buffer {
  const output = Buffer.alloc(component.bounds.width * component.bounds.height * 4);
  for (const pixel of component.pixels) {
    const sourceX = pixel % sourceWidth;
    const sourceY = Math.floor(pixel / sourceWidth);
    const targetX = sourceX - component.bounds.x;
    const targetY = sourceY - component.bounds.y;
    const sourceOffset = pixel * 4;
    const targetOffset = (targetY * component.bounds.width + targetX) * 4;
    source.copy(output, targetOffset, sourceOffset, sourceOffset + 4);
  }
  return output;
}

function upperBodyCenterX(input: Buffer, width: number, height: number): number {
  const upperBottom = Math.ceil(height * 0.58);
  let count = 0;
  let sumX = 0;
  for (let y = 0; y < upperBottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (input[(y * width + x) * 4 + 3] === 0) continue;
      count += 1;
      sumX += x;
    }
  }
  return count > 0 ? sumX / count : width / 2;
}

function forceBinaryAlpha(input: Buffer): Buffer {
  const output = Buffer.from(input);
  for (let offset = 0; offset < output.length; offset += 4) {
    if (output[offset + 3] >= 128) {
      output[offset + 3] = 255;
      continue;
    }
    clearPixel(output, offset);
  }
  return output;
}

function readCell(source: Buffer, sheetWidth: number, row: number, column: number): Buffer {
  const output = Buffer.alloc(CELL * CELL * 4);
  for (let y = 0; y < CELL; y += 1) {
    const sourceStart = (((row * CELL + y) * sheetWidth) + column * CELL) * 4;
    source.copy(output, y * CELL * 4, sourceStart, sourceStart + CELL * 4);
  }
  return output;
}

function writeCell(
  target: Buffer,
  sheetWidth: number,
  row: number,
  column: number,
  cell: Buffer
): void {
  for (let y = 0; y < CELL; y += 1) {
    const targetStart = (((row * CELL + y) * sheetWidth) + column * CELL) * 4;
    cell.copy(target, targetStart, y * CELL * 4, (y + 1) * CELL * 4);
  }
}

function blit(
  source: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  target: Buffer,
  targetWidth: number,
  left: number,
  top: number
): void {
  for (let y = 0; y < sourceHeight; y += 1) {
    const sourceStart = y * sourceWidth * 4;
    const targetStart = ((top + y) * targetWidth + left) * 4;
    source.copy(target, targetStart, sourceStart, sourceStart + sourceWidth * 4);
  }
}

async function rgba(input: Buffer): Promise<{
  data: Buffer;
  info: { width: number; height: number; channels: number };
}> {
  return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function encode(input: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(input, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

function clearPixel(buffer: Buffer, offset: number): void {
  buffer[offset] = 0;
  buffer[offset + 1] = 0;
  buffer[offset + 2] = 0;
  buffer[offset + 3] = 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function projectPath(value: string): string {
  return path.relative(PROJECT_ROOT, value).replaceAll("\\", "/");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sha256(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

await main();
