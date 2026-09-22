import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { createServer as createViteServer } from "vite";
import { validateCharacterProject } from "./src/schema";
import {
  DIRECTION_ORDER,
  type CharacterIndexV1,
  type CharacterManifestV2,
  type CharacterProjectV1,
  type DirectionName,
  type ImageInspection,
  type RuntimeActionV2,
  type RuntimeFrameV2,
  type StageReport
} from "./src/types";

const TOOL_ROOT = resolve(import.meta.dirname);
const PROJECT_ROOT = resolve(TOOL_ROOT, "..", "..");
const PRODUCTION_ROOT = join(PROJECT_ROOT, "character-production");
const PROJECTS_ROOT = join(PRODUCTION_ROOT, "projects");
const STAGING_ROOT = join(PRODUCTION_ROOT, "staging");
const BACKUPS_ROOT = join(PRODUCTION_ROOT, "backups");
const REPORTS_ROOT = join(PRODUCTION_ROOT, "reports");
const DEFAULT_PORT = Number(process.env.LULUS_CHARACTER_STUDIO_PORT || 5191);
const MAX_BODY_BYTES = 100 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function projectRelative(fullPath: string): string {
  assertInsideProject(fullPath);
  return relative(PROJECT_ROOT, fullPath).replace(/\\/g, "/");
}

function assertInsideProject(fullPath: string): void {
  const rel = relative(PROJECT_ROOT, resolve(fullPath));
  if (rel === ".." || rel.startsWith(`..${sep}`) || rel.includes(`${sep}..${sep}`)) {
    throw new Error("Path is outside the Lulu's Tale project.");
  }
}

function safeProjectPath(input: unknown): string {
  const value = String(input ?? "").replace(/\\/g, "/");
  if (!value || value.startsWith("/") || value.includes("\0")) throw new Error("A project-relative path is required.");
  const fullPath = resolve(PROJECT_ROOT, value);
  assertInsideProject(fullPath);
  return fullPath;
}

function safeId(input: unknown): string {
  const value = String(input ?? "");
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(value)) throw new Error("Invalid character project id.");
  return value;
}

function safeProjectFile(projectId: string): string {
  return join(PROJECTS_ROOT, safeId(projectId), "project.json");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(pathOrBuffer: string | Buffer): Promise<string> {
  const data = typeof pathOrBuffer === "string" ? await readFile(pathOrBuffer) : pathOrBuffer;
  return createHash("sha256").update(data).digest("hex");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function atomicWrite(path: string, data: string | Buffer): Promise<void> {
  assertInsideProject(path);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, path);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body exceeds the 100 MB safety limit.");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendError(res: ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  sendJson(res, 400, { ok: false, error: message });
}

async function listProjects(): Promise<Array<Pick<CharacterProjectV1, "id" | "displayName" | "characterClass" | "production" | "updatedAt">>> {
  await mkdir(PROJECTS_ROOT, { recursive: true });
  const entries = await readdir(PROJECTS_ROOT, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectFile = join(PROJECTS_ROOT, entry.name, "project.json");
    if (!(await fileExists(projectFile))) continue;
    const project = await readJson<CharacterProjectV1>(projectFile);
    projects.push({
      id: project.id,
      displayName: project.displayName,
      characterClass: project.characterClass,
      production: project.production,
      updatedAt: project.updatedAt
    });
  }
  return projects.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function loadProject(projectId: string): Promise<CharacterProjectV1> {
  const project = await readJson<CharacterProjectV1>(safeProjectFile(projectId));
  if (project.id !== projectId) throw new Error(`Project folder ${projectId} contains project ${project.id}.`);
  return project;
}

async function nextBackupDirectory(): Promise<{ number: number; path: string }> {
  await mkdir(BACKUPS_ROOT, { recursive: true });
  const entries = await readdir(BACKUPS_ROOT, { withFileTypes: true });
  let max = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = /^backup(\d+)$/.exec(entry.name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  const number = max + 1;
  return { number, path: join(BACKUPS_ROOT, `backup${number}`) };
}

async function backupFiles(paths: string[]): Promise<{ number: number; directory: string; files: string[] } | null> {
  const existing = [];
  for (const path of [...new Set(paths)]) {
    assertInsideProject(path);
    if (await fileExists(path)) existing.push(path);
  }
  if (existing.length === 0) return null;
  const backup = await nextBackupDirectory();
  await mkdir(backup.path, { recursive: false });
  const files = [];
  for (const source of existing) {
    const destination = join(backup.path, projectRelative(source));
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    files.push(projectRelative(destination));
  }
  return { number: backup.number, directory: projectRelative(backup.path), files };
}

async function saveProject(project: CharacterProjectV1): Promise<{ project: CharacterProjectV1; backup: Awaited<ReturnType<typeof backupFiles>> }> {
  const validation = validateCharacterProject(project);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  const projectFile = safeProjectFile(project.id);
  const current = (await fileExists(projectFile)) ? await loadProject(project.id) : null;
  const nextProject: CharacterProjectV1 = {
    ...project,
    production: {
      ...project.production,
      revision: current ? Math.max(project.production.revision, current.production.revision + 1) : project.production.revision
    },
    updatedAt: new Date().toISOString()
  };
  const backup = await backupFiles([projectFile]);
  await atomicWrite(projectFile, `${JSON.stringify(nextProject, null, 2)}\n`);
  return { project: nextProject, backup };
}

async function inspectImage(relativePath: string): Promise<ImageInspection> {
  const fullPath = safeProjectPath(relativePath);
  if (!IMAGE_EXTENSIONS.has(extname(fullPath).toLowerCase())) throw new Error("Unsupported image type.");
  const metadata = await sharp(fullPath).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image dimensions are unavailable.");
  const { data, info } = await sharp(fullPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparentPixels = 0;
  let partialAlphaPixels = 0;
  let hiddenRgbPixels = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  const paletteCounts = new Map<string, number>();
  for (let index = 0; index < data.length; index += info.channels) {
    const alpha = data[index + info.channels - 1];
    const pixel = index / info.channels;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    if (alpha === 0) {
      transparentPixels += 1;
      if (data[index] !== 0 || data[index + 1] !== 0 || data[index + 2] !== 0) hiddenRgbPixels += 1;
    } else {
      if (alpha < 255) partialAlphaPixels += 1;
      const color = `#${data[index].toString(16).padStart(2, "0")}${data[index + 1].toString(16).padStart(2, "0")}${data[index + 2].toString(16).padStart(2, "0")}`;
      paletteCounts.set(color, (paletteCounts.get(color) ?? 0) + 1);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const opaqueBounds =
    maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  return {
    path: relativePath.replace(/\\/g, "/"),
    width: info.width,
    height: info.height,
    format: metadata.format ?? "unknown",
    channels: info.channels,
    alpha: partialAlphaPixels > 0 ? "partial" : transparentPixels > 0 ? "binary" : "none",
    transparentPixels,
    partialAlphaPixels,
    hiddenRgbPixels,
    opaqueBounds,
    palette: [...paletteCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([hex, count]) => ({ hex, count })),
    sha256: await sha256(fullPath)
  };
}

async function validateProjectFiles(project: CharacterProjectV1): Promise<ReturnType<typeof validateCharacterProject>> {
  const validation = validateCharacterProject(project);
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const sourceByPath = new Map(project.sources.map((source) => [source.path, source]));

  for (const source of project.sources) {
    const fullPath = safeProjectPath(source.path);
    const exists = await fileExists(fullPath);
    if (source.missing) {
      if (exists) warnings.push(`Source is marked unavailable but now exists: ${source.path}. Re-import it deliberately.`);
      continue;
    }
    if (!exists) {
      errors.push(`Required real source is missing: ${source.path}.`);
      continue;
    }
    const currentHash = await sha256(fullPath);
    if (source.sha256 !== currentHash) {
      errors.push(`Source checksum changed: ${source.path}. Expected ${source.sha256}, received ${currentHash}.`);
    }
  }

  const inspections = new Map<string, ImageInspection>();
  const rawImages = new Map<string, Awaited<ReturnType<typeof decodeRgba>>>();
  for (const [actionId, action] of Object.entries(project.actions)) {
    const expectedFrames = action.tracks[action.directions[0]]?.frames.length ?? 0;
    if (action.runtimeSheet) {
      const source = sourceByPath.get(action.runtimeSheet);
      if (source && !source.missing) {
        const inspection = await cachedInspection(action.runtimeSheet, inspections);
        const expectedWidth = action.cell.width * expectedFrames;
        const expectedHeight = action.cell.height * action.directions.length;
        if (inspection.width !== expectedWidth || inspection.height !== expectedHeight) {
          errors.push(
            `${actionId} runtime sheet is ${inspection.width}x${inspection.height}; expected ${expectedWidth}x${expectedHeight}.`
          );
        }
      }
    }
    for (const direction of action.directions) {
      const frames = action.tracks[direction]?.frames ?? [];
      const seenHashes = new Map<string, number>();
      for (const [frameIndex, frame] of frames.entries()) {
        const source = sourceByPath.get(frame.imagePath);
        if (!source) {
          errors.push(`${actionId}/${direction}/${frame.id} has no provenance source entry.`);
          continue;
        }
        if (source.missing) {
          errors.push(`${actionId}/${direction}/${frame.id} depends on unavailable source ${frame.imagePath}.`);
          continue;
        }
        if (project.production.status === "runtime_ready" && source.approval !== "approved") {
          errors.push(`${actionId}/${direction}/${frame.id} depends on non-approved source ${frame.imagePath}.`);
        }
        if (![frame.crop.x, frame.crop.y, frame.crop.width, frame.crop.height].every(Number.isInteger)) {
          errors.push(`${actionId}/${direction}/${frame.id} crop must use integer pixels.`);
          continue;
        }
        if (
          (frame.crop.width !== action.cell.width || frame.crop.height !== action.cell.height) &&
          project.presentation.resampling !== "nearest"
        ) {
          errors.push(
            `${actionId}/${direction}/${frame.id} crop scaling requires an explicit nearest-neighbor policy or an externally prepared cell-sized derivative.`
          );
        }
        const inspection = await cachedInspection(frame.imagePath, inspections);
        if (inspection.format !== "png" || inspection.channels !== 4) {
          errors.push(`${actionId}/${direction}/${frame.id} must use a four-channel RGBA PNG.`);
        }
        if (inspection.alpha !== "binary") {
          errors.push(`${actionId}/${direction}/${frame.id} requires binary alpha; found ${inspection.alpha}.`);
        }
        if (inspection.hiddenRgbPixels > 0) {
          errors.push(`${actionId}/${direction}/${frame.id} source contains ${inspection.hiddenRgbPixels} hidden RGB pixels.`);
        }
        if (
          frame.crop.x + frame.crop.width > inspection.width ||
          frame.crop.y + frame.crop.height > inspection.height
        ) {
          errors.push(`${actionId}/${direction}/${frame.id} crop exceeds ${frame.imagePath}.`);
          continue;
        }
        const decoded = await cachedRgba(frame.imagePath, rawImages);
        const frameHash = hashRgbaCrop(decoded, frame.crop);
        const duplicate = seenHashes.get(frameHash);
        if (duplicate !== undefined) {
          warnings.push(`${actionId}/${direction} frame ${frameIndex + 1} exactly duplicates frame ${duplicate + 1}.`);
        } else {
          seenHashes.set(frameHash, frameIndex);
        }
      }
    }
  }
  for (const portrait of project.portraits) {
    const source = sourceByPath.get(portrait.imagePath);
    if (!source || source.missing) {
      errors.push(`Portrait ${portrait.id} depends on an unavailable real source.`);
      continue;
    }
    if (portrait.status === "runtime_ready" && source.approval !== "approved") {
      errors.push(`Runtime-ready portrait ${portrait.id} does not have approved source provenance.`);
    }
    if (![portrait.crop.x, portrait.crop.y, portrait.crop.width, portrait.crop.height].every(Number.isInteger)) {
      errors.push(`Portrait ${portrait.id} crop must use integer pixels.`);
      continue;
    }
    const inspection = await cachedInspection(portrait.imagePath, inspections);
    if (
      portrait.crop.x + portrait.crop.width > inspection.width ||
      portrait.crop.y + portrait.crop.height > inspection.height
    ) {
      errors.push(`Portrait ${portrait.id} crop exceeds ${portrait.imagePath}.`);
    }
    if (portrait.alphaRequired && (inspection.channels !== 4 || inspection.alpha === "none")) {
      errors.push(`Portrait ${portrait.id} requires alpha.`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

async function cachedInspection(path: string, cache: Map<string, ImageInspection>): Promise<ImageInspection> {
  const existing = cache.get(path);
  if (existing) return existing;
  const inspection = await inspectImage(path);
  cache.set(path, inspection);
  return inspection;
}

async function decodeRgba(path: string): Promise<{ data: Buffer; width: number; height: number; channels: number }> {
  const result = await sharp(safeProjectPath(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: result.data, width: result.info.width, height: result.info.height, channels: result.info.channels };
}

async function cachedRgba(
  path: string,
  cache: Map<string, Awaited<ReturnType<typeof decodeRgba>>>
): Promise<Awaited<ReturnType<typeof decodeRgba>>> {
  const existing = cache.get(path);
  if (existing) return existing;
  const decoded = await decodeRgba(path);
  cache.set(path, decoded);
  return decoded;
}

function hashRgbaCrop(
  image: Awaited<ReturnType<typeof decodeRgba>>,
  crop: { x: number; y: number; width: number; height: number }
): string {
  const hasher = createHash("sha256");
  for (let y = crop.y; y < crop.y + crop.height; y += 1) {
    const start = (y * image.width + crop.x) * image.channels;
    hasher.update(image.data.subarray(start, start + crop.width * image.channels));
  }
  return hasher.digest("hex");
}

async function serveImage(res: ServerResponse, relativePath: string): Promise<void> {
  const fullPath = safeProjectPath(relativePath);
  if (!IMAGE_EXTENSIONS.has(extname(fullPath).toLowerCase())) throw new Error("Unsupported image type.");
  const content = await readFile(fullPath);
  const mime = extname(fullPath).toLowerCase() === ".png" ? "image/png" : extname(fullPath).toLowerCase() === ".webp" ? "image/webp" : "image/jpeg";
  res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
  res.end(content);
}

function decodePngDataUrl(value: unknown): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(value ?? ""));
  if (!match) throw new Error("A PNG data URL is required.");
  return Buffer.from(match[1], "base64");
}

async function saveDerivedFrame(body: Record<string, unknown>): Promise<Awaited<ReturnType<typeof saveProject>>> {
  const projectId = safeId(body.projectId);
  const actionId = String(body.actionId ?? "");
  const direction = String(body.direction ?? "") as DirectionName;
  const frameId = String(body.frameId ?? "");
  if (!DIRECTION_ORDER.includes(direction)) throw new Error("Invalid frame direction.");
  const project = await loadProject(projectId);
  const action = project.actions[actionId];
  const frame = action?.tracks[direction]?.frames.find((candidate) => candidate.id === frameId);
  if (!action || !frame) throw new Error("Selected project frame does not exist.");
  const png = decodePngDataUrl(body.png);
  const metadata = await sharp(png).metadata();
  if (metadata.format !== "png" || metadata.width !== action.cell.width || metadata.height !== action.cell.height) {
    throw new Error(`Derived frame must be a ${action.cell.width}×${action.cell.height} PNG.`);
  }
  const relativePath = `character-production/projects/${project.id}/derived/${action.id}/${direction.replace(/[^A-Za-z0-9]+/g, "_")}_${frame.id}.png`;
  const fullPath = safeProjectPath(relativePath);
  const backup = await backupFiles([fullPath]);
  await atomicWrite(fullPath, png);
  const hash = await sha256(png);
  const existingSource = project.sources.find((source) => source.path === relativePath);
  if (existingSource) {
    existingSource.sha256 = hash;
  } else {
    project.sources.push({
      id: `derived_${action.id}_${direction}_${frame.id}`.replace(/[^A-Za-z0-9_-]+/g, "_"),
      role: "frame",
      path: relativePath,
      sha256: hash,
      immutable: true,
      approval: "unreviewed",
      notes: `Non-destructive derivative of ${frame.imagePath}.`
    });
  }
  frame.imagePath = relativePath;
  frame.crop = { x: 0, y: 0, width: action.cell.width, height: action.cell.height };
  action.runtimeSheet = undefined;
  action.runtimeHref = undefined;
  const saved = await saveProject(project);
  return { ...saved, backup: backup ?? saved.backup };
}

async function createProjectFromSheet(body: Record<string, unknown>): Promise<CharacterProjectV1> {
  const id = safeId(body.id);
  const displayName = String(body.displayName ?? "").trim();
  const sourcePath = String(body.sourcePath ?? "").replace(/\\/g, "/");
  const actionId = safeId(body.actionId);
  const cellWidth = Number(body.cellWidth);
  const cellHeight = Number(body.cellHeight);
  const directionMode = String(body.directionMode ?? "eight") as "eight" | "single";
  if (!displayName) throw new Error("Display name is required.");
  if (!Number.isInteger(cellWidth) || cellWidth <= 0 || !Number.isInteger(cellHeight) || cellHeight <= 0) {
    throw new Error("Positive integer cell dimensions are required.");
  }
  const inspection = await inspectImage(sourcePath);
  const directions = directionMode === "single" ? (["Down"] as DirectionName[]) : [...DIRECTION_ORDER];
  if (inspection.height !== cellHeight * directions.length || inspection.width % cellWidth !== 0) {
    throw new Error("The confirmed grid does not divide the real image exactly.");
  }
  const frameCount = inspection.width / cellWidth;
  const sourceId = `sheet_${actionId}`;
  const root = { x: Math.floor(cellWidth / 2), y: cellHeight - 8 };
  const tracks: CharacterProjectV1["actions"][string]["tracks"] = {};
  directions.forEach((direction, row) => {
    tracks[direction] = {
      direction,
      frames: Array.from({ length: frameCount }, (_, index) => ({
        id: `${direction.replace(/[^A-Za-z]+/g, "_").toLowerCase()}_${index}`,
        imagePath: sourcePath,
        crop: { x: index * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight },
        durationMs: 180,
        root,
        visualOffset: { x: 0, y: 0 },
        grounded: true,
        contact: "none",
        anchors: [],
        events: [],
        sourceFrame: { direction, index }
      }))
    };
  });
  const project: CharacterProjectV1 = {
    schema: "lulus-character-project",
    version: 1,
    id,
    displayName,
    characterClass: String(body.characterClass ?? "custom") as CharacterProjectV1["characterClass"],
    identity: {
      canonicalApproval: "unapproved",
      locked: false,
      notes: ["Imported from a manually confirmed real project sheet; visual approval remains required."],
      paletteReferences: []
    },
    production: {
      status: "in_production",
      revision: 1,
      warnings: ["Root and action semantics were supplied at import and require human confirmation before runtime-ready status."]
    },
    presentation: {
      nativeCell: { width: cellWidth, height: cellHeight },
      renderScales: { overworld: 1 },
      resampling: "none"
    },
    collisionProfileId: String(body.collisionProfileId ?? "visual_only"),
    sources: [
      {
        id: sourceId,
        role: "sheet",
        path: sourcePath,
        sha256: inspection.sha256,
        immutable: true,
        approval: "unreviewed"
      }
    ],
    actions: {
      [actionId]: {
        id: actionId,
        displayName: actionId.replace(/_/g, " "),
        category: String(body.category ?? "custom") as CharacterProjectV1["actions"][string]["category"],
        playback: "loop",
        directionMode,
        directions,
        cell: { width: cellWidth, height: cellHeight },
        loop: { start: 0, end: frameCount - 1 },
        entryFrame: 0,
        stopPolicy: "idle_entry",
        cycleDistancePx: body.category === "locomotion" ? Number(body.cycleDistancePx) : undefined,
        runtimeSheet: sourcePath,
        runtimeHref: sourcePath.startsWith("public/") ? `/${sourcePath.slice("public/".length)}` : undefined,
        tracks
      }
    },
    portraits: [],
    runtime: {
      manifestPath: `public/assets/characters/v2/${id}/MANIFEST.json`,
      generatedAssetDirectory: `public/assets/characters/generated/${id}/sheets`
    },
    updatedAt: new Date().toISOString()
  };
  const validation = validateCharacterProject(project);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  if (await fileExists(safeProjectFile(id))) throw new Error(`Project ${id} already exists.`);
  await atomicWrite(safeProjectFile(id), `${JSON.stringify(project, null, 2)}\n`);
  return project;
}

async function importPortrait(body: Record<string, unknown>): Promise<Awaited<ReturnType<typeof saveProject>>> {
  const project = await loadProject(safeId(body.projectId));
  const portraitId = safeId(body.portraitId);
  const expression = String(body.expression ?? "").trim();
  const imagePath = projectRelative(safeProjectPath(String(body.imagePath ?? "")));
  if (!expression) throw new Error("Portrait expression is required.");
  if (project.portraits.some((portrait) => portrait.id === portraitId)) {
    throw new Error(`Portrait ${portraitId} already exists.`);
  }
  const inspection = await inspectImage(imagePath);
  if (inspection.format !== "png" || inspection.channels !== 4 || inspection.alpha === "none") {
    throw new Error("Portrait imports must be real four-channel PNGs with alpha.");
  }
  const sourceId = `portrait_${portraitId}`;
  if (project.sources.some((source) => source.id === sourceId)) throw new Error(`Source ${sourceId} already exists.`);
  project.sources.push({
    id: sourceId,
    role: "portrait",
    path: imagePath,
    sha256: inspection.sha256,
    immutable: true,
    approval: "unreviewed",
    notes: `Imported for portrait expression ${expression}.`
  });
  project.portraits.push({
    id: portraitId,
    expression,
    imagePath,
    crop: { x: 0, y: 0, width: inspection.width, height: inspection.height },
    alphaRequired: true,
    status: "in_production"
  });
  return saveProject(project);
}

function toRuntimeFrame(frame: NonNullable<CharacterProjectV1["actions"][string]["tracks"][DirectionName]>["frames"][number]): RuntimeFrameV2 {
  return {
    durationMs: frame.durationMs,
    root: [frame.root.x, frame.root.y],
    visualOffset: [frame.visualOffset.x, frame.visualOffset.y],
    grounded: frame.grounded,
    contact: frame.contact,
    anchors: frame.anchors.map((anchor) => ({
      id: anchor.id,
      role: anchor.role,
      point: [anchor.point.x, anchor.point.y],
      rotationDeg: anchor.rotationDeg,
      scale: anchor.scale,
      drawOrder: anchor.drawOrder
    })),
    events: frame.events
  };
}

function publicHref(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized.startsWith("public/")) throw new Error(`Runtime publish path must be under public/: ${path}`);
  return `/${normalized.slice("public/".length)}`;
}

function actionOutputPath(project: CharacterProjectV1, actionId: string): string {
  return `${project.runtime.generatedAssetDirectory.replace(/\/+$/, "")}/${actionId}.png`;
}

async function actionIsPristine(action: CharacterProjectV1["actions"][string]): Promise<boolean> {
  if (!action.runtimeSheet || !(await fileExists(safeProjectPath(action.runtimeSheet)))) return false;
  const sourcePaths = new Set<string>();
  for (const direction of action.directions) {
    const track = action.tracks[direction];
    if (!track) return false;
    for (const frame of track.frames) sourcePaths.add(frame.imagePath);
  }
  return sourcePaths.size === 1 && sourcePaths.has(action.runtimeSheet);
}

async function packAction(project: CharacterProjectV1, actionId: string, stageRoot: string): Promise<{ staged: string; publish: string; href: string }> {
  const action = project.actions[actionId];
  const pristine = await actionIsPristine(action);
  const publishRelative = pristine && action.runtimeSheet ? action.runtimeSheet : actionOutputPath(project, actionId);
  const stagedFull = join(stageRoot, publishRelative);
  await mkdir(dirname(stagedFull), { recursive: true });
  if (pristine && action.runtimeSheet) {
    await copyFile(safeProjectPath(action.runtimeSheet), stagedFull);
    return { staged: projectRelative(stagedFull), publish: publishRelative, href: action.runtimeHref ?? publicHref(publishRelative) };
  }

  const frameCount = action.tracks[action.directions[0]]?.frames.length ?? 0;
  const composites: sharp.OverlayOptions[] = [];
  for (const [row, direction] of action.directions.entries()) {
    const track = action.tracks[direction];
    if (!track) throw new Error(`${actionId} is missing ${direction}.`);
    for (const [column, frame] of track.frames.entries()) {
      const source = safeProjectPath(frame.imagePath);
      let pipeline = sharp(source).extract({
          left: Math.round(frame.crop.x),
          top: Math.round(frame.crop.y),
          width: Math.round(frame.crop.width),
          height: Math.round(frame.crop.height)
        });
      if (frame.crop.width !== action.cell.width || frame.crop.height !== action.cell.height) {
        if (project.presentation.resampling !== "nearest") {
          throw new Error(`${actionId}/${direction}/${frame.id} requires an approved deterministic resampling policy.`);
        }
        pipeline = pipeline.resize(action.cell.width, action.cell.height, {
          kernel: sharp.kernel.nearest,
          fit: "fill"
        });
      }
      const buffer = await pipeline.png().toBuffer();
      composites.push({ input: buffer, left: column * action.cell.width, top: row * action.cell.height });
    }
  }
  await sharp({
    create: {
      width: frameCount * action.cell.width,
      height: action.directions.length * action.cell.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png({ compressionLevel: 9, palette: false })
    .toFile(stagedFull);
  return { staged: projectRelative(stagedFull), publish: publishRelative, href: publicHref(publishRelative) };
}

async function packPortrait(
  project: CharacterProjectV1,
  portrait: CharacterProjectV1["portraits"][number],
  stageRoot: string
): Promise<{ staged: string; publish: string; href: string }> {
  const publish = `public/assets/characters/generated/${project.id}/portraits/${portrait.id}.png`;
  const staged = join(stageRoot, publish);
  await mkdir(dirname(staged), { recursive: true });
  await sharp(safeProjectPath(portrait.imagePath))
    .extract({
      left: portrait.crop.x,
      top: portrait.crop.y,
      width: portrait.crop.width,
      height: portrait.crop.height
    })
    .png({ compressionLevel: 9, palette: false })
    .toFile(staged);
  return { staged: projectRelative(staged), publish, href: publicHref(publish) };
}

async function buildRuntimeIndex(): Promise<CharacterIndexV1> {
  const projects = await listProjects();
  return {
    schema: "lulus-character-index",
    version: 1,
    characters: projects.map((project) => ({
      id: project.id,
      displayName: project.displayName,
      characterClass: project.characterClass,
      status: project.production.status,
      manifest: `/assets/characters/v2/${project.id}/MANIFEST.json`
    }))
  };
}

async function stageProject(projectId: string): Promise<StageReport> {
  const project = await loadProject(projectId);
  const validation = await validateProjectFiles(project);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  if (project.production.status !== "runtime_ready") throw new Error("Only runtime-ready projects can be staged for publishing.");

  const stageId = `${timestamp()}-${project.id}-r${project.production.revision}`;
  const stageRoot = join(STAGING_ROOT, stageId);
  await mkdir(stageRoot, { recursive: false });
  const runtimeActions: Record<string, RuntimeActionV2> = {};
  const runtimePortraits: NonNullable<CharacterManifestV2["portraits"]> = [];
  const files: StageReport["files"] = [];

  try {
    for (const actionId of Object.keys(project.actions)) {
      const action = project.actions[actionId];
      const packed = await packAction(project, actionId, stageRoot);
      const tracks: RuntimeActionV2["tracks"] = {};
      for (const direction of action.directions) {
        const track = action.tracks[direction];
        if (!track) throw new Error(`${actionId} is missing ${direction}.`);
        tracks[direction] = track.frames.map(toRuntimeFrame);
      }
      runtimeActions[actionId] = {
        id: actionId,
        category: action.category,
        playback: action.playback,
        directionMode: action.directionMode,
        sheet: packed.href,
        cell: [action.cell.width, action.cell.height],
        directions: action.directions,
        framesPerDirection: trackLength(action, action.directions[0]),
        loop: [action.loop.start, action.loop.end],
        entryFrame: action.entryFrame,
        stopPolicy: action.stopPolicy,
        transitionActionId: action.transitionActionId,
        cycleDistancePx: action.cycleDistancePx,
        tracks
      };
      files.push(await stageFileEntry(packed.staged, packed.publish));
    }
    for (const portrait of project.portraits.filter((candidate) => candidate.status === "runtime_ready")) {
      const packed = await packPortrait(project, portrait, stageRoot);
      runtimePortraits.push({
        id: portrait.id,
        expression: portrait.expression,
        image: packed.href,
        crop: [0, 0, portrait.crop.width, portrait.crop.height],
        alphaRequired: portrait.alphaRequired
      });
      files.push(await stageFileEntry(packed.staged, packed.publish));
    }

    const manifest: CharacterManifestV2 = {
      schema: "lulus-character-runtime",
      version: 2,
      id: project.id,
      displayName: project.displayName,
      characterClass: project.characterClass,
      species: project.species,
      status: project.production.status,
      collisionProfileId: project.collisionProfileId,
      renderScales: project.presentation.renderScales,
      actions: runtimeActions,
      ...(runtimePortraits.length > 0 ? { portraits: runtimePortraits } : {}),
      sourceProject: {
        path: projectRelative(safeProjectFile(project.id)),
        revision: project.production.revision
      }
    };
    const stagedManifest = join(stageRoot, project.runtime.manifestPath);
    await atomicWrite(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    files.push(await stageFileEntry(projectRelative(stagedManifest), project.runtime.manifestPath));

    const index = await buildRuntimeIndex();
    const stagedIndex = join(stageRoot, "public/assets/characters/INDEX.json");
    await atomicWrite(stagedIndex, `${JSON.stringify(index, null, 2)}\n`);
    files.push(await stageFileEntry(projectRelative(stagedIndex), "public/assets/characters/INDEX.json"));

    const report: StageReport = {
      stageId,
      projectId: project.id,
      revision: project.production.revision,
      createdAt: new Date().toISOString(),
      stageDirectory: projectRelative(stageRoot),
      manifestPath: project.runtime.manifestPath,
      files,
      validation
    };
    await atomicWrite(join(stageRoot, "stage-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    await mkdir(REPORTS_ROOT, { recursive: true });
    await atomicWrite(join(REPORTS_ROOT, `${stageId}.json`), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } catch (error) {
    await rm(stageRoot, { recursive: true, force: true });
    throw error;
  }
}

function trackLength(action: CharacterProjectV1["actions"][string], direction: DirectionName): number {
  const track = action.tracks[direction];
  if (!track) throw new Error(`${action.id} is missing ${direction}.`);
  return track.frames.length;
}

async function stageFileEntry(stagedRelative: string, publishRelative: string): Promise<StageReport["files"][number]> {
  const stagedFull = safeProjectPath(stagedRelative);
  const publishFull = safeProjectPath(publishRelative);
  const stagedHash = await sha256(stagedFull);
  const existingHash = (await fileExists(publishFull)) ? await sha256(publishFull) : undefined;
  return {
    stagedPath: stagedRelative,
    publishPath: publishRelative,
    sha256: stagedHash,
    existingSha256: existingHash,
    change: existingHash === undefined ? "new" : existingHash === stagedHash ? "unchanged" : "changed"
  };
}

async function publishStage(stageId: string): Promise<{
  published: string[];
  backup: Awaited<ReturnType<typeof backupFiles>>;
  report: StageReport;
}> {
  if (!/^[A-Za-z0-9_.:\-]+$/.test(stageId)) throw new Error("Invalid stage id.");
  const stageRoot = join(STAGING_ROOT, stageId);
  assertInsideProject(stageRoot);
  const report = await readJson<StageReport>(join(stageRoot, "stage-report.json"));
  const project = await loadProject(report.projectId);
  if (project.production.status !== "runtime_ready") throw new Error("The project is no longer runtime-ready.");
  if (project.production.revision !== report.revision) throw new Error("The project changed after staging. Create a new stage.");
  for (const file of report.files) {
    if ((await sha256(safeProjectPath(file.stagedPath))) !== file.sha256) throw new Error(`Staged file changed: ${file.stagedPath}.`);
  }
  const publishPaths = report.files.map((file) => safeProjectPath(file.publishPath));
  const backup = await backupFiles(publishPaths);
  const published: string[] = [];
  for (const file of report.files) {
    const source = safeProjectPath(file.stagedPath);
    const destination = safeProjectPath(file.publishPath);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await copyFile(source, temporary);
    await rename(temporary, destination);
    published.push(file.publishPath);
  }
  return { published, backup, report };
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith("/api/")) return false;
  try {
    if (req.method === "GET" && url.pathname === "/api/bootstrap") {
      sendJson(res, 200, {
        ok: true,
        projectRoot: PROJECT_ROOT,
        productionRoot: projectRelative(PRODUCTION_ROOT),
        directions: DIRECTION_ORDER,
        projects: await listProjects()
      });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/project") {
      sendJson(res, 200, { ok: true, project: await loadProject(safeId(url.searchParams.get("id"))) });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/image") {
      await serveImage(res, String(url.searchParams.get("path") ?? ""));
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/image/inspect") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, inspection: await inspectImage(String(body.path ?? "")) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/project/save") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await saveProject(body.project as CharacterProjectV1)) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/project/validate") {
      const body = await readBody(req);
      const project = await loadProject(safeId(body.projectId));
      sendJson(res, 200, { ok: true, validation: await validateProjectFiles(project) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/project/import-sheet") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, project: await createProjectFromSheet(body) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/project/import-portrait") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await importPortrait(body)) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/frame/save") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await saveDerivedFrame(body)) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/export/stage") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, report: await stageProject(safeId(body.projectId)) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/export/batch-stage") {
      const body = await readBody(req);
      const characterClass = String(body.characterClass ?? "");
      if (!["humanoid", "canine", "bird", "animal", "custom"].includes(characterClass)) {
        throw new Error("A valid character class is required for batch staging.");
      }
      const projects = (await listProjects()).filter(
        (project) => project.characterClass === characterClass && project.production.status === "runtime_ready"
      );
      const reports: StageReport[] = [];
      for (const project of projects) reports.push(await stageProject(project.id));
      sendJson(res, 200, { ok: true, reports });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/export/publish") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await publishStage(String(body.stageId ?? ""))) });
      return true;
    }
    sendJson(res, 404, { ok: false, error: "Unknown Character Studio API endpoint." });
    return true;
  } catch (error) {
    sendError(res, error);
    return true;
  }
}

async function ensureDirectories(): Promise<void> {
  await Promise.all(
    [PRODUCTION_ROOT, PROJECTS_ROOT, STAGING_ROOT, BACKUPS_ROOT, REPORTS_ROOT].map((path) => mkdir(path, { recursive: true }))
  );
}

async function openBrowser(url: string): Promise<void> {
  if (process.env.LULUS_CHARACTER_STUDIO_NO_OPEN === "1") return;
  const child = spawn("cmd", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

export async function createCharacterStudioServer(port = DEFAULT_PORT): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  await ensureDirectories();
  const vite = await createViteServer({
    configFile: join(TOOL_ROOT, "vite.config.ts"),
    root: TOOL_ROOT,
    server: { middlewareMode: true, hmr: false },
    appType: "spa"
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `127.0.0.1:${port}`}`);
    if (await handleApi(req, res, url)) return;
    vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end("Not found");
    });
  });
  await new Promise<void>((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Character Studio did not receive a local TCP port.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolveClosed, reject) => {
        server.close((error) => error ? reject(error) : resolveClosed());
      });
      await vite.close();
    }
  };
}

async function main(): Promise<void> {
  const service = await createCharacterStudioServer();
  process.stdout.write(`Lulu's Tale Character Studio: ${service.url}\n`);
  await openBrowser(service.url);
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entryPath === import.meta.url) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
