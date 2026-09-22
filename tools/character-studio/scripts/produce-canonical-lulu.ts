import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const IMPORT_ROOT = path.join(
  PROJECT_ROOT,
  "character-production",
  "projects",
  "lulu",
  "imports",
  "canonical-anime-r3"
);
const DERIVED_ROOT = path.join(
  PROJECT_ROOT,
  "character-production",
  "projects",
  "lulu",
  "derived",
  "canonical-anime-r3"
);
const SHEET_ROOT = path.join(DERIVED_ROOT, "sheets");

const CELL_WIDTH = 96;
const CELL_HEIGHT = 96;
const ROOT_X = 48;
const ROOT_Y = 88;
const TARGET_HEIGHT = 68;
const MAX_SPRITE_WIDTH = 86;
const ALPHA_THRESHOLD = 64;

const DIRECTIONS = [
  { id: "Down", slug: "down" },
  { id: "Down-Left", slug: "down-left" },
  { id: "Left", slug: "left" },
  { id: "Up-Left", slug: "up-left" },
  { id: "Up", slug: "up" },
  { id: "Up-Right", slug: "up-right" },
  { id: "Right", slug: "right" },
  { id: "Down-Right", slug: "down-right" }
] as const;

const ACTIONS = [
  {
    id: "idle",
    frames: 4,
    output: "Lulu_idle.png",
    groundOffsets: [0, 0, 0, 0]
  },
  {
    id: "walk",
    frames: 8,
    output: "Lulu_walk.png",
    groundOffsets: [0, 1, 0, -1, 0, 1, 0, -1]
  },
  {
    id: "run",
    frames: 8,
    output: "Lulu_run.png",
    groundOffsets: [0, 1, -1, -4, 0, 1, -1, -4]
  }
] as const;

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FrameReport = {
  direction: (typeof DIRECTIONS)[number]["id"];
  index: number;
  sourceBounds: Bounds;
  packedBounds: Bounds;
  sourceSha256: string;
  opaquePixels: number;
  semiTransparentPixels: number;
};

type ActionReport = {
  action: (typeof ACTIONS)[number]["id"];
  output: string;
  width: number;
  height: number;
  sha256: string;
  frames: FrameReport[];
};

async function main(): Promise<void> {
  await mkdir(SHEET_ROOT, { recursive: true });
  const actionReports: ActionReport[] = [];

  for (const action of ACTIONS) {
    const composites: sharp.OverlayOptions[] = [];
    const frameReports: FrameReport[] = [];

    for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
      const direction = DIRECTIONS[directionIndex];
      const sourcePath = path.join(IMPORT_ROOT, `${action.id}-${direction.slug}.png`);
      const sourceBytes = await readFile(sourcePath);
      const sourceSha256 = sha256(sourceBytes);
      const { data, info } = await sharp(sourceBytes)
        .removeAlpha()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const keyed = removeGreenScreen(data, info.width, info.height);

      for (let frameIndex = 0; frameIndex < action.frames; frameIndex += 1) {
        const left = Math.floor((frameIndex * info.width) / action.frames);
        const right = Math.floor(((frameIndex + 1) * info.width) / action.frames);
        const sourceCell = extractRaw(keyed, info.width, info.height, {
          x: left,
          y: 0,
          width: right - left,
          height: info.height
        });
        const sourceBounds = alphaBounds(sourceCell, right - left, info.height);
        if (!sourceBounds) {
          throw new Error(`${action.id}/${direction.id}/${frameIndex} has no keyed sprite pixels.`);
        }

        const trimmed = extractRaw(sourceCell, right - left, info.height, sourceBounds);
        const scale = Math.min(
          TARGET_HEIGHT / sourceBounds.height,
          MAX_SPRITE_WIDTH / sourceBounds.width
        );
        const packedWidth = Math.max(1, Math.round(sourceBounds.width * scale));
        const packedHeight = Math.max(1, Math.round(sourceBounds.height * scale));
        const resized = await sharp(trimmed, {
          raw: {
            width: sourceBounds.width,
            height: sourceBounds.height,
            channels: 4
          }
        })
          .resize(packedWidth, packedHeight, {
            fit: "fill",
            kernel: sharp.kernel.nearest
          })
          .ensureAlpha()
          .raw()
          .toBuffer();
        const binary = forceBinaryAlpha(resized);
        const packed = await sharp(binary, {
          raw: { width: packedWidth, height: packedHeight, channels: 4 }
        })
          .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
          .toBuffer();
        const x = Math.round((CELL_WIDTH - packedWidth) / 2);
        const groundY = ROOT_Y + action.groundOffsets[frameIndex];
        const y = groundY - packedHeight;

        if (x < 0 || y < 0 || x + packedWidth > CELL_WIDTH || y + packedHeight > CELL_HEIGHT) {
          throw new Error(`${action.id}/${direction.id}/${frameIndex} does not fit the 96x96 cell.`);
        }

        composites.push({
          input: packed,
          left: frameIndex * CELL_WIDTH + x,
          top: directionIndex * CELL_HEIGHT + y
        });
        const alphaStats = countAlpha(binary);
        frameReports.push({
          direction: direction.id,
          index: frameIndex,
          sourceBounds,
          packedBounds: { x, y, width: packedWidth, height: packedHeight },
          sourceSha256,
          ...alphaStats
        });
      }
    }

    const sheetBuffer = await sharp({
      create: {
        width: action.frames * CELL_WIDTH,
        height: DIRECTIONS.length * CELL_HEIGHT,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite(composites)
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
      .toBuffer();
    const outputPath = path.join(SHEET_ROOT, action.output);
    await writeFile(outputPath, sheetBuffer);
    actionReports.push({
      action: action.id,
      output: path.relative(PROJECT_ROOT, outputPath).replaceAll("\\", "/"),
      width: action.frames * CELL_WIDTH,
      height: DIRECTIONS.length * CELL_HEIGHT,
      sha256: sha256(sheetBuffer),
      frames: frameReports
    });
  }

  const report = {
    schema: "lulus-character-production-report",
    version: 1,
    characterId: "lulu",
    revision: 3,
    generatedAt: new Date().toISOString(),
    source: {
      approvedReference: "character-production/projects/lulu/imports/canonical-anime-r3/approved-visual-reference.png",
      method: "Built-in image generation with approved visual reference, then deterministic Sharp chroma removal, nearest-neighbor scaling, grounding, and packing.",
      chromaKey: "#00FF00",
      alphaPolicy: {
        transparentRgbCleared: true,
        nearKeySoftMatte: true,
        fringeDespill: true
      }
    },
    contract: {
      cell: [CELL_WIDTH, CELL_HEIGHT],
      root: [ROOT_X, ROOT_Y],
      directionOrder: DIRECTIONS.map((direction) => direction.id),
      targetHeight: TARGET_HEIGHT,
      maxSpriteWidth: MAX_SPRITE_WIDTH
    },
    actions: actionReports
  };
  await writeFile(
    path.join(DERIVED_ROOT, "production-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );

  for (const action of actionReports) {
    console.log(`${action.action}: ${action.width}x${action.height} ${action.sha256}`);
  }
}

function removeGreenScreen(
  input: Buffer,
  width: number,
  height: number
): Buffer {
  const output = Buffer.from(input);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const red = output[offset];
    const green = output[offset + 1];
    const blue = output[offset + 2];
    const greenDominance = green - Math.max(red, blue);
    const distance = Math.sqrt(red * red + (255 - green) * (255 - green) + blue * blue);
    let matte = 255;
    if (green >= 110 && greenDominance >= 45) matte = 0;
    else if (distance <= 24) matte = 0;
    else if (distance < 120) matte = Math.round(((distance - 24) / 96) * 255);
    if (matte === 0) {
      output[offset] = 0;
      output[offset + 1] = 0;
      output[offset + 2] = 0;
      output[offset + 3] = 0;
      continue;
    }
    if (distance < 140) {
      output[offset + 1] = Math.min(green, Math.max(red, blue));
    }
    output[offset + 3] = Math.round((output[offset + 3] * matte) / 255);
  }
  return output;
}

function extractRaw(
  input: Buffer,
  inputWidth: number,
  inputHeight: number,
  bounds: Bounds
): Buffer {
  if (
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.x + bounds.width > inputWidth ||
    bounds.y + bounds.height > inputHeight
  ) {
    throw new Error(`Invalid raw extraction ${JSON.stringify(bounds)} for ${inputWidth}x${inputHeight}.`);
  }
  const output = Buffer.alloc(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    const sourceStart = ((bounds.y + y) * inputWidth + bounds.x) * 4;
    const targetStart = y * bounds.width * 4;
    input.copy(output, targetStart, sourceStart, sourceStart + bounds.width * 4);
  }
  return output;
}

function alphaBounds(input: Buffer, width: number, height: number): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (input[(y * width + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function countAlpha(input: Buffer): {
  opaquePixels: number;
  semiTransparentPixels: number;
} {
  let opaquePixels = 0;
  let semiTransparentPixels = 0;
  for (let offset = 3; offset < input.length; offset += 4) {
    if (input[offset] === 255) opaquePixels += 1;
    else if (input[offset] > 0) semiTransparentPixels += 1;
  }
  return { opaquePixels, semiTransparentPixels };
}

function forceBinaryAlpha(input: Buffer): Buffer {
  const output = Buffer.from(input);
  for (let offset = 0; offset < output.length; offset += 4) {
    if (output[offset + 3] >= 128) {
      output[offset + 3] = 255;
      continue;
    }
    output[offset] = 0;
    output[offset + 1] = 0;
    output[offset + 2] = 0;
    output[offset + 3] = 0;
  }
  return output;
}

function sha256(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

await main();
