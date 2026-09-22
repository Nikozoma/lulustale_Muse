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
  "canonical-anime-r4-motion-repair"
);
const DERIVED_ROOT = path.join(
  PROJECT_ROOT,
  "character-production",
  "projects",
  "lulu",
  "derived",
  "canonical-anime-r4-motion-repair"
);
const SHEET_ROOT = path.join(DERIVED_ROOT, "sheets");

const CELL_WIDTH = 96;
const CELL_HEIGHT = 96;
const ROOT_X = 48;
const ROOT_Y = 88;
const TARGET_STANDING_HEIGHT = 68;
const MAX_SPRITE_WIDTH = 86;

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

const ACTIONS = [
  {
    id: "idle",
    input: "idle-repaired-source.png",
    output: "Lulu_idle.png",
    frames: 4,
    background: "light-neutral" as const,
    groundOffsets: [0, 0, 0, 0]
  },
  {
    id: "walk",
    input: "walk-repaired-source.png",
    output: "Lulu_walk.png",
    frames: 8,
    background: "light-neutral" as const,
    groundOffsets: [0, 0, 0, -1, 0, 0, 0, -1]
  },
  {
    id: "run",
    input: "run-repaired-source.png",
    output: "Lulu_run.png",
    frames: 8,
    background: "green" as const,
    groundOffsets: [0, 0, -1, -2, 0, 0, -1, -2]
  }
] as const;

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SourceFrame = {
  direction: (typeof DIRECTIONS)[number];
  index: number;
  raw: Buffer;
  width: number;
  height: number;
  bounds: Bounds;
  upperBodyCenterX: number;
};

type FrameReport = {
  direction: (typeof DIRECTIONS)[number];
  index: number;
  sourceBounds: Bounds;
  packedBounds: Bounds;
  sourceUpperBodyCenterX: number;
  packedUpperBodyCenterX: number;
  groundY: number;
  opaquePixels: number;
  semiTransparentPixels: number;
};

type Component = {
  pixels: number[];
  bounds: Bounds;
  centerX: number;
  centerY: number;
};

async function main(): Promise<void> {
  await mkdir(SHEET_ROOT, { recursive: true });
  const actionReports = [];

  for (const action of ACTIONS) {
    const sourcePath = path.join(IMPORT_ROOT, action.input);
    const sourceBytes = await readFile(sourcePath);
    const { data, info } = await sharp(sourceBytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const extracted = extractSourceFrames(
      data,
      info.width,
      info.height,
      action
    );
    const frames = extracted.frames;
    const referenceHeight = median(frames.map((frame) => frame.bounds.height));
    const maxSourceWidth = Math.max(...frames.map((frame) => frame.bounds.width));
    const maxSourceHeight = Math.max(...frames.map((frame) => frame.bounds.height));
    const scale = Math.min(
      TARGET_STANDING_HEIGHT / referenceHeight,
      MAX_SPRITE_WIDTH / maxSourceWidth,
      (ROOT_Y - 2) / maxSourceHeight
    );
    const composites: sharp.OverlayOptions[] = [];
    const frameReports: FrameReport[] = [];

    for (const frame of frames) {
      const trimmed = extractRaw(frame.raw, frame.width, frame.height, frame.bounds);
      const packedWidth = Math.max(1, Math.round(frame.bounds.width * scale));
      const packedHeight = Math.max(1, Math.round(frame.bounds.height * scale));
      const resized = await sharp(trimmed, {
        raw: {
          width: frame.bounds.width,
          height: frame.bounds.height,
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
      const binary = removeFinalDebris(
        forceBinaryAlpha(resized),
        packedWidth,
        packedHeight
      );
      const packedUpperBodyCenterX =
        (frame.upperBodyCenterX - frame.bounds.x) * scale;
      const requestedX = Math.round(ROOT_X - packedUpperBodyCenterX);
      const x = Math.max(0, Math.min(CELL_WIDTH - packedWidth, requestedX));
      const directionIndex = DIRECTIONS.indexOf(frame.direction);
      const groundY = ROOT_Y + action.groundOffsets[frame.index];
      const y = groundY - packedHeight;
      if (y < 0 || y + packedHeight > CELL_HEIGHT) {
        throw new Error(
          `${action.id}/${frame.direction}/${frame.index} does not fit the authored cell.`
        );
      }
      const png = await sharp(binary, {
        raw: { width: packedWidth, height: packedHeight, channels: 4 }
      })
        .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
        .toBuffer();
      composites.push({
        input: png,
        left: frame.index * CELL_WIDTH + x,
        top: directionIndex * CELL_HEIGHT + y
      });
      frameReports.push({
        direction: frame.direction,
        index: frame.index,
        sourceBounds: frame.bounds,
        packedBounds: { x, y, width: packedWidth, height: packedHeight },
        sourceUpperBodyCenterX: round(frame.upperBodyCenterX),
        packedUpperBodyCenterX: round(x + packedUpperBodyCenterX),
        groundY,
        ...countAlpha(binary)
      });
    }

    const width = action.frames * CELL_WIDTH;
    const height = DIRECTIONS.length * CELL_HEIGHT;
    const sheet = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite(composites)
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
      .toBuffer();
    const outputPath = path.join(SHEET_ROOT, action.output);
    await writeFile(outputPath, sheet);
    actionReports.push({
      action: action.id,
      input: projectPath(sourcePath),
      inputSha256: sha256(sourceBytes),
      output: projectPath(outputPath),
      outputSha256: sha256(sheet),
      dimensions: [width, height],
      referenceHeight,
      fixedScale: round(scale),
      removedBackgroundPixels: extracted.removedBackgroundPixels,
      removedGreenPixels: extracted.removedGreenPixels,
      cycleDistancePx:
        action.id === "walk" ? 96 : action.id === "run" ? 160 : undefined,
      frames: frameReports
    });
  }

  const report = {
    schema: "lulus-character-motion-repair-report",
    version: 1,
    characterId: "lulu",
    revision: 4,
    generatedAt: new Date().toISOString(),
    scope: ["idle", "walk", "run"],
    contract: {
      cell: [CELL_WIDTH, CELL_HEIGHT],
      root: [ROOT_X, ROOT_Y],
      directionOrder: DIRECTIONS,
      targetStandingHeight: TARGET_STANDING_HEIGHT,
      maxSpriteWidth: MAX_SPRITE_WIDTH,
      alpha: "binary",
      transparentRgbCleared: true,
      registration: "fixed action scale, fixed world root, upper-body horizontal center"
    },
    actions: actionReports
  };
  await writeFile(
    path.join(DERIVED_ROOT, "motion-repair-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );

  for (const action of actionReports) {
    console.log(
      `${action.action}: ${action.dimensions.join("x")} ${action.outputSha256}`
    );
  }
}

function extractSourceFrames(
  input: Buffer,
  width: number,
  height: number,
  action: (typeof ACTIONS)[number]
): {
  frames: SourceFrame[];
  removedBackgroundPixels: number;
  removedGreenPixels: number;
} {
  const cleaned = removeBackground(input, width, height, action.background);
  const expectedCount = DIRECTIONS.length * action.frames;
  const components = findComponents(cleaned.data, width, height)
    .filter((component) => component.pixels.length >= 50)
    .sort((left, right) => left.centerY - right.centerY);
  if (components.length !== expectedCount) {
    throw new Error(
      `${action.id} requires ${expectedCount} connected sprite components; found ${components.length}.`
    );
  }
  const frames: SourceFrame[] = [];
  for (let row = 0; row < DIRECTIONS.length; row += 1) {
    const rowComponents = components
      .slice(row * action.frames, (row + 1) * action.frames)
      .sort((left, right) => left.centerX - right.centerX);
    for (const [index, component] of rowComponents.entries()) {
      const sourceCell = componentRaw(cleaned.data, width, component);
      const bounds = {
        x: 0,
        y: 0,
        width: component.bounds.width,
        height: component.bounds.height
      };
      frames.push({
        direction: DIRECTIONS[row],
        index,
        raw: sourceCell,
        width: component.bounds.width,
        height: component.bounds.height,
        bounds,
        upperBodyCenterX: upperBodyCenterX(
          sourceCell,
          component.bounds.width,
          component.bounds.height,
          bounds
        )
      });
    }
  }
  return {
    frames,
    removedBackgroundPixels: cleaned.removedBackgroundPixels,
    removedGreenPixels: cleaned.removedGreenPixels
  };
}

function removeBackground(
  input: Buffer,
  width: number,
  height: number,
  background: "light-neutral" | "green"
): {
  data: Buffer;
  removedBackgroundPixels: number;
  removedGreenPixels: number;
} {
  const output = Buffer.from(input);
  let removedBackgroundPixels = 0;
  let removedGreenPixels = 0;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const red = output[offset];
    const green = output[offset + 1];
    const blue = output[offset + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const average = (red + green + blue) / 3;
    const greenDominance = green - Math.max(red, blue);
    const isBackground =
      background === "green"
        ? green >= 80 && greenDominance >= 30
        : average >= 215 && maximum - minimum <= 30;
    if (isBackground) {
      if (background === "green") removedGreenPixels += 1;
      else removedBackgroundPixels += 1;
      clearPixel(output, offset);
      continue;
    }
    if (greenDominance > 8 && green > 40) {
      output[offset + 1] = Math.max(red, blue);
      removedGreenPixels += 1;
    }
  }
  return {
    data: output,
    removedBackgroundPixels,
    removedGreenPixels
  };
}

function findComponents(
  input: Buffer,
  width: number,
  height: number
): Component[] {
  const visited = new Uint8Array(width * height);
  const components: Component[] = [];
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || input[start * 4 + 3] === 0) continue;
    const pixels: number[] = [];
    const queue = [start];
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
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            continue;
          }
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
  const output = Buffer.alloc(
    component.bounds.width * component.bounds.height * 4
  );
  for (const pixel of component.pixels) {
    const sourceX = pixel % sourceWidth;
    const sourceY = Math.floor(pixel / sourceWidth);
    const targetX = sourceX - component.bounds.x;
    const targetY = sourceY - component.bounds.y;
    const sourceOffset = pixel * 4;
    const targetOffset =
      (targetY * component.bounds.width + targetX) * 4;
    source.copy(output, targetOffset, sourceOffset, sourceOffset + 4);
  }
  return output;
}

function upperBodyCenterX(
  input: Buffer,
  width: number,
  height: number,
  bounds: Bounds
): number {
  const upperBodyBottom = bounds.y + Math.ceil(bounds.height * 0.58);
  let count = 0;
  let sumX = 0;
  for (let y = bounds.y; y < Math.min(height, upperBodyBottom); y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      if (input[(y * width + x) * 4 + 3] === 0) continue;
      count += 1;
      sumX += x;
    }
  }
  return count > 0 ? sumX / count : bounds.x + bounds.width / 2;
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
    throw new Error(
      `Invalid extraction ${JSON.stringify(bounds)} for ${inputWidth}x${inputHeight}.`
    );
  }
  const output = Buffer.alloc(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    const sourceStart = ((bounds.y + y) * inputWidth + bounds.x) * 4;
    const targetStart = y * bounds.width * 4;
    input.copy(output, targetStart, sourceStart, sourceStart + bounds.width * 4);
  }
  return output;
}

function forceBinaryAlpha(input: Buffer): Buffer {
  const output = Buffer.from(input);
  for (let offset = 0; offset < output.length; offset += 4) {
    if (output[offset + 3] >= 128) {
      output[offset + 3] = 255;
      if (
        output[offset + 1] > output[offset] &&
        output[offset + 1] > output[offset + 2]
      ) {
        output[offset + 1] = Math.max(output[offset], output[offset + 2]);
      }
      continue;
    }
    clearPixel(output, offset);
  }
  return output;
}

function removeFinalDebris(
  input: Buffer,
  width: number,
  height: number
): Buffer {
  const output = Buffer.from(input);
  for (const component of findComponents(output, width, height)) {
    if (component.pixels.length >= 3) continue;
    for (const pixel of component.pixels) {
      clearPixel(output, pixel * 4);
    }
  }
  return output;
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

function clearPixel(buffer: Buffer, offset: number): void {
  buffer[offset] = 0;
  buffer[offset + 1] = 0;
  buffer[offset + 2] = 0;
  buffer[offset + 3] = 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function projectPath(value: string): string {
  return path.relative(PROJECT_ROOT, value).replaceAll("\\", "/");
}

function sha256(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

await main();
