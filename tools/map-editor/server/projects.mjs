import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import {
  ACTIVE_MAP_IDS,
  BACKUP_ROOT,
  COLLISION_CELL_SIZE_PX,
  GAME_TILE_SIZE_PX,
  MAP_REGISTRY_PATH,
  OVERWORLD_AUTHORITY,
  PROJECT_ROOT,
  PROJECTS_ROOT,
  RUNTIME_ASSET_ROOT,
  RUNTIME_AUTHORITY_PATH,
  RUNTIME_MAP_ROOT,
  STAGING_ROOT,
  TRANSITION_GRAPH_PATH
} from "./config.mjs";
import {
  collisionEquivalentAtTileResolution,
  collisionEquivalentAtCellResolution,
  compileCollisionV2,
  decodeCollisionSource,
  normalizeSemanticGeometry,
  pixelRectToTileRect,
  validateSemanticDimensions
} from "./collision.mjs";
import {
  assertProjectRelative,
  copyFileEnsured,
  exists,
  hashFile,
  hashPngAlpha,
  nowStamp,
  projectPath,
  readJson,
  readPngDimensions,
  rollbackFiles,
  sha256,
  writeBufferAtomic,
  writeJsonAtomic
} from "./fs-utils.mjs";
import {
  assertCollisionSchema,
  assertProjectSchema,
  assertSemanticSchema,
  assertVisualSchema
} from "./schema-validator.mjs";

const PROJECT_FILE = "map-project.json";
const DRAFT_SEMANTIC_FILE = "semantic.authoring.json";
const DRAFT_DAY_VISUAL_FILE = "visual_day.authoring.json";
const DRAFT_NIGHT_VISUAL_FILE = "visual_night.authoring.json";
const DEFAULT_AUDIT_INDEX = "map-projects/audits/index.json";

export async function listProjects() {
  await mkdir(PROJECTS_ROOT, { recursive: true });
  const projects = [];
  for (const entry of await readdir(PROJECTS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(PROJECTS_ROOT, entry.name, PROJECT_FILE);
    if (!await exists(manifestPath)) continue;
    try {
      const manifest = await readJson(manifestPath);
      validateProjectManifest(manifest);
      const drift = await sourceDrift(manifest);
      projects.push({
        mapId: manifest.mapId,
        displayName: manifest.displayName,
        dimensions: manifest.dimensions,
        repairCount: manifest.repairAnnotations.length,
        calibrationAreaApproved: Boolean(manifest.approval?.calibrationAreaApproved),
        sourceDrift: drift
      });
    } catch (error) {
      projects.push({ mapId: entry.name, error: error.message });
    }
  }
  return projects.sort((a, b) => ACTIVE_MAP_IDS.indexOf(a.mapId) - ACTIVE_MAP_IDS.indexOf(b.mapId) || a.mapId.localeCompare(b.mapId));
}

export async function loadProject(mapId) {
  const { folder, manifestPath } = resolveProject(mapId);
  const manifest = await readJson(manifestPath);
  validateProjectManifest(manifest);
  const semanticPath = await preferredDraft(folder, DRAFT_SEMANTIC_FILE, manifest.runtime.semantic);
  const dayVisualPath = await preferredDraft(folder, DRAFT_DAY_VISUAL_FILE, manifest.runtime.dayVisual);
  const nightVisualPath = await preferredDraft(folder, DRAFT_NIGHT_VISUAL_FILE, manifest.runtime.nightVisual);
  const collisionPath = projectPath(manifest.runtime.collision);
  const [semantic, dayVisual, nightVisual, collision, drift] = await Promise.all([
    readJson(semanticPath),
    readJson(dayVisualPath),
    readJson(nightVisualPath),
    readJson(collisionPath),
    sourceDrift(manifest)
  ]);
  const audits = [];
  for (const path of manifest.auditSources || []) {
    audits.push(await readJson(projectPath(assertProjectRelative(path))));
  }
  validateSemanticDimensions(semantic);
  validatePhasePair(semantic, dayVisual, nightVisual);
  assertSemanticSchema(semantic);
  assertVisualSchema(dayVisual);
  assertVisualSchema(nightVisual);
  assertCollisionSchema(collision);
  return {
    manifest,
    semantic,
    visuals: { day: dayVisual, night: nightVisual },
    collision,
    audits,
    drift,
    draft: {
      semantic: semanticPath.startsWith(folder),
      dayVisual: dayVisualPath.startsWith(folder),
      nightVisual: nightVisualPath.startsWith(folder)
    }
  };
}

export async function importActiveProject(mapId) {
  assertMapId(mapId);
  const registry = await readJson(MAP_REGISTRY_PATH);
  const entry = registry.maps?.[mapId];
  if (!entry) throw new Error(`Runtime registry does not contain ${mapId}.`);
  const runtime = runtimePathsForEntry(mapId, entry);
  const [semantic, dayVisual, nightVisual] = await Promise.all([
    readJson(projectPath(runtime.semantic)),
    readJson(projectPath(runtime.dayVisual)),
    readJson(projectPath(runtime.nightVisual))
  ]);
  validateSemanticDimensions(semantic);
  validatePhasePair(semantic, dayVisual, nightVisual);
  assertSemanticSchema(semantic);
  assertVisualSchema(dayVisual);
  assertVisualSchema(nightVisual);
  const art = buildArtModel(dayVisual, nightVisual);
  const sourcePaths = [
    runtime.semantic,
    runtime.collision,
    runtime.dayVisual,
    runtime.nightVisual,
    ...art.day.layers.map((layer) => layer.path),
    ...art.night.layers.map((layer) => layer.path)
  ];
  const sourceHashes = {};
  for (const path of new Set(sourcePaths)) sourceHashes[path] = await hashFile(projectPath(path));
  const manifest = {
    $schema: "../tools/map-editor/schema/map-project.schema.json",
    format: "lulus_map_project_v1",
    version: "1.0.0",
    mapId,
    displayName: displayNameForMap(mapId),
    dimensions: {
      widthTiles: semantic.map_dimensions.tiles.width,
      heightTiles: semantic.map_dimensions.tiles.height,
      widthPx: semantic.map_dimensions.pixels.width,
      heightPx: semantic.map_dimensions.pixels.height,
      tileSizePx: semantic.map_dimensions.tile_size_px,
      collisionCellSizePx: COLLISION_CELL_SIZE_PX
    },
    runtime,
    art,
    sourceHashes,
    lastExportHashes: {},
    repairAnnotations: [],
    auditSources: [DEFAULT_AUDIT_INDEX],
    approval: {
      calibrationAreaApproved: mapId !== "overworld",
      approvedAt: null
    }
  };
  validateProjectManifest(manifest);
  assertProjectSchema(manifest);
  const { folder, manifestPath } = resolveProject(mapId, { requireExisting: false });
  await mkdir(folder, { recursive: true });
  await writeJsonAtomic(manifestPath, manifest);
  return manifest;
}

export async function createProject(payload) {
  const mapId = String(payload.mapId || "");
  assertMapId(mapId);
  if (ACTIVE_MAP_IDS.includes(mapId)) throw new Error(`Use import for existing active map ${mapId}.`);
  const dayAsset = assertProjectRelative(payload.dayAsset);
  const nightAsset = assertProjectRelative(payload.nightAsset);
  const [dayDimensions, nightDimensions] = await Promise.all([
    readPngDimensions(projectPath(dayAsset)),
    readPngDimensions(projectPath(nightAsset))
  ]);
  if (dayDimensions.width !== nightDimensions.width || dayDimensions.height !== nightDimensions.height) {
    throw new Error("Real Day and Night artwork must have identical dimensions.");
  }
  if (dayDimensions.width % GAME_TILE_SIZE_PX !== 0 || dayDimensions.height % GAME_TILE_SIZE_PX !== 0) {
    throw new Error("Map artwork dimensions must be divisible by 32px.");
  }
  const semantic = payload.semantic || (
    payload.semanticPath
      ? await readJson(projectPath(assertProjectRelative(payload.semanticPath)))
      : null
  );
  if (!semantic || semantic.map_id !== mapId) {
    throw new Error("A real semantic map with the same map_id is required; no sample data will be generated.");
  }
  validateSemanticDimensions(semantic);
  assertSemanticSchema(semantic);
  if (
    semantic.map_dimensions.pixels.width !== dayDimensions.width ||
    semantic.map_dimensions.pixels.height !== dayDimensions.height
  ) {
    throw new Error("Semantic and artwork dimensions differ.");
  }
  const runtimeFolder = `public/data/maps/${mapId}`;
  const runtime = {
    semantic: `${runtimeFolder}/semantic.json`,
    collision: `${runtimeFolder}/collision_grid.json`,
    dayVisual: `${runtimeFolder}/visual_day.json`,
    nightVisual: `${runtimeFolder}/visual_night.json`,
    assetRoot: `public/assets/maps/native/${mapId}`
  };
  const baseAssetName = basename(dayAsset);
  const nightAssetName = basename(nightAsset);
  const project = {
    $schema: "../tools/map-editor/schema/map-project.schema.json",
    format: "lulus_map_project_v1",
    version: "1.0.0",
    mapId,
    displayName: String(payload.displayName || mapId),
    dimensions: {
      widthTiles: dayDimensions.width / GAME_TILE_SIZE_PX,
      heightTiles: dayDimensions.height / GAME_TILE_SIZE_PX,
      widthPx: dayDimensions.width,
      heightPx: dayDimensions.height,
      tileSizePx: GAME_TILE_SIZE_PX,
      collisionCellSizePx: COLLISION_CELL_SIZE_PX
    },
    runtime,
    art: {
      day: {
        layers: [{
          id: "base",
          kind: "base",
          path: `${runtime.assetRoot}/${baseAssetName}`,
          sourcePath: dayAsset,
          runtimeAsset: `production/${mapId}/${baseAssetName}`,
          locked: false,
          visible: true,
          zIndex: 0
        }]
      },
      night: {
        layers: [{
          id: "base",
          kind: "base",
          path: `${runtime.assetRoot}/${nightAssetName}`,
          sourcePath: nightAsset,
          runtimeAsset: `production/${mapId}/${nightAssetName}`,
          locked: false,
          visible: true,
          zIndex: 0
        }]
      }
    },
    sourceHashes: {},
    lastExportHashes: {},
    repairAnnotations: [],
    auditSources: [DEFAULT_AUDIT_INDEX],
    approval: { calibrationAreaApproved: true, approvedAt: null }
  };
  validateProjectManifest(project);
  assertProjectSchema(project);
  const { folder, manifestPath } = resolveProject(mapId, { requireExisting: false });
  if (await exists(manifestPath)) throw new Error(`Map project ${mapId} already exists.`);
  await mkdir(folder, { recursive: true });
  await Promise.all([
    writeJsonAtomic(manifestPath, project),
    writeJsonAtomic(join(folder, DRAFT_SEMANTIC_FILE), normalizeSemanticGeometry(semantic)),
    writeJsonAtomic(join(folder, DRAFT_DAY_VISUAL_FILE), makeVisualDescriptor(project, "day")),
    writeJsonAtomic(join(folder, DRAFT_NIGHT_VISUAL_FILE), makeVisualDescriptor(project, "night"))
  ]);
  return project;
}

export async function saveProject(mapId, payload) {
  const { folder, manifestPath } = resolveProject(mapId);
  const current = await readJson(manifestPath);
  validateProjectManifest(current);
  const semantic = normalizeSemanticGeometry(payload.semantic);
  if (semantic.map_id !== mapId) throw new Error("Semantic map_id cannot change.");
  const visuals = synchronizeForegrounds(
    semantic,
    structuredClone(payload.visuals?.day),
    structuredClone(payload.visuals?.night)
  );
  validatePhasePair(semantic, visuals.day, visuals.night);
  assertSemanticSchema(semantic);
  assertVisualSchema(visuals.day);
  assertVisualSchema(visuals.night);
  const manifest = {
    ...current,
    art: mergeEditableArtState(current.art, payload.art),
    repairAnnotations: Array.isArray(payload.repairAnnotations)
      ? payload.repairAnnotations.map(normalizeAnnotation)
      : current.repairAnnotations,
    approval: {
      ...current.approval,
      ...(payload.approval || {})
    },
    savedAt: new Date().toISOString()
  };
  validateProjectManifest(manifest);
  assertProjectSchema(manifest);
  await Promise.all([
    writeJsonAtomic(join(folder, DRAFT_SEMANTIC_FILE), semantic),
    writeJsonAtomic(join(folder, DRAFT_DAY_VISUAL_FILE), visuals.day),
    writeJsonAtomic(join(folder, DRAFT_NIGHT_VISUAL_FILE), visuals.night),
    writeJsonAtomic(manifestPath, manifest)
  ]);
  return { ok: true, savedAt: manifest.savedAt };
}

function mergeEditableArtState(currentArt, submittedArt) {
  if (!submittedArt) return currentArt;
  const merged = structuredClone(currentArt);
  for (const phase of ["day", "night"]) {
    const submittedById = new Map((submittedArt[phase]?.layers || []).map((layer) => [layer.id, layer]));
    for (const layer of merged[phase].layers) {
      const submitted = submittedById.get(layer.id);
      if (!submitted) continue;
      layer.visible = submitted.visible !== false;
      layer.locked = Boolean(submitted.locked);
      if (Number.isFinite(Number(submitted.zIndex))) layer.zIndex = Number(submitted.zIndex);
    }
  }
  return merged;
}

export async function saveProjectImage(mapId, phase, layerId, bytes) {
  if (phase !== "day" && phase !== "night") throw new Error("Phase must be day or night.");
  const { folder, manifestPath } = resolveProject(mapId);
  const manifest = await readJson(manifestPath);
  validateProjectManifest(manifest);
  const layer = manifest.art[phase].layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`Unknown ${phase} art layer ${layerId}.`);
  if (layer.locked) throw new Error(`${layerId} is locked. Unlock it explicitly before editing.`);
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes.toString("ascii", 1, 4) !== "PNG" ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("Raster edits must be saved as a real PNG.");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== manifest.dimensions.widthPx || height !== manifest.dimensions.heightPx) {
    throw new Error(`${layerId} PNG is ${width}x${height}; expected full map size ${manifest.dimensions.widthPx}x${manifest.dimensions.heightPx}.`);
  }
  const relativeSource = `map-projects/${mapId}/art/${phase}/${safeFileName(layerId)}.png`;
  await writeBufferAtomic(projectPath(relativeSource), bytes);
  layer.sourcePath = relativeSource;
  layer.editedSha256 = sha256(bytes);
  manifest.savedAt = new Date().toISOString();
  await writeJsonAtomic(manifestPath, manifest);
  return { ok: true, sourcePath: relativeSource, sha256: layer.editedSha256 };
}

export async function linkExternalProjectImage(mapId, phase, layerId, sourcePath) {
  const safeSource = assertProjectRelative(sourcePath);
  const dimensions = await readPngDimensions(projectPath(safeSource));
  const { manifestPath } = resolveProject(mapId);
  const manifest = await readJson(manifestPath);
  validateProjectManifest(manifest);
  if (
    dimensions.width !== manifest.dimensions.widthPx ||
    dimensions.height !== manifest.dimensions.heightPx
  ) {
    throw new Error(`External PNG is ${dimensions.width}x${dimensions.height}; expected ${manifest.dimensions.widthPx}x${manifest.dimensions.heightPx}.`);
  }
  const layer = manifest.art[phase]?.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`Unknown ${phase} art layer ${layerId}.`);
  layer.sourcePath = safeSource;
  layer.editedSha256 = await hashFile(projectPath(safeSource));
  manifest.savedAt = new Date().toISOString();
  await writeJsonAtomic(manifestPath, manifest);
  return { ok: true, sourcePath: safeSource, sha256: layer.editedSha256 };
}

export async function addProjectArtLayer(mapId, payload) {
  const id = String(payload.id || "");
  const kind = String(payload.kind || "");
  if (!/^[a-z][a-z0-9_]*$/.test(id) || id === "base") {
    throw new Error("Art layer id must be a stable lowercase identifier and cannot be base.");
  }
  if (!["detail", "foreground", "reference"].includes(kind)) {
    throw new Error("Art layer kind must be detail, foreground, or reference.");
  }
  const daySource = assertProjectRelative(payload.daySource);
  if (kind !== "reference" && !payload.nightSource) {
    throw new Error("Runtime art layers require an explicit real Night PNG.");
  }
  const nightSource = assertProjectRelative(payload.nightSource || payload.daySource);
  const { manifestPath, folder } = resolveProject(mapId);
  const manifest = await readJson(manifestPath);
  validateProjectManifest(manifest);
  if (["day", "night"].some((phase) => manifest.art[phase].layers.some((layer) => layer.id === id))) {
    throw new Error(`Art layer ${id} already exists.`);
  }
  const [dayDimensions, nightDimensions] = await Promise.all([
    readPngDimensions(projectPath(daySource)),
    readPngDimensions(projectPath(nightSource))
  ]);
  for (const [phase, dimensions] of [["Day", dayDimensions], ["Night", nightDimensions]]) {
    if (
      dimensions.width !== manifest.dimensions.widthPx ||
      dimensions.height !== manifest.dimensions.heightPx
    ) {
      throw new Error(`${phase} layer is ${dimensions.width}x${dimensions.height}; expected full-map dimensions.`);
    }
  }
  if (kind === "foreground") {
    const [dayAlpha, nightAlpha] = await Promise.all([
      hashPngAlpha(projectPath(daySource)),
      hashPngAlpha(projectPath(nightSource))
    ]);
    if (dayAlpha !== nightAlpha) {
      throw new Error("Foreground creation requires matching real Day/Night alpha.");
    }
  }
  const zIndex = Number(payload.zIndex);
  if (!Number.isFinite(zIndex)) throw new Error("Art layer z-index must be explicitly authored.");
  const occlusionOpacity = Number(payload.occlusionOpacity);
  if (kind === "foreground" && (!Number.isFinite(occlusionOpacity) || occlusionOpacity < 0 || occlusionOpacity > 1)) {
    throw new Error("Foreground occlusion opacity must be explicitly authored from 0 to 1.");
  }
  for (const [phase, sourcePath] of [["day", daySource], ["night", nightSource]]) {
    const fileName = basename(sourcePath);
    manifest.art[phase].layers.push({
      id,
      kind,
      path: `${manifest.runtime.assetRoot}/${fileName}`,
      sourcePath,
      runtimeAsset: `production/${mapId}/${fileName}`,
      foregroundLayerId: kind === "foreground" ? id : undefined,
      locked: kind === "reference",
      visible: true,
      sharedAlpha: kind === "foreground",
      phase,
      zIndex,
      editedSha256: await hashFile(projectPath(sourcePath))
    });
  }
  const dayVisualPath = await preferredDraft(folder, DRAFT_DAY_VISUAL_FILE, manifest.runtime.dayVisual);
  const nightVisualPath = await preferredDraft(folder, DRAFT_NIGHT_VISUAL_FILE, manifest.runtime.nightVisual);
  const [dayVisual, nightVisual] = await Promise.all([readJson(dayVisualPath), readJson(nightVisualPath)]);
  if (kind === "detail") {
    for (const [visual, phase] of [[dayVisual, "day"], [nightVisual, "night"]]) {
      const layer = manifest.art[phase].layers.find((candidate) => candidate.id === id);
      visual.detail_layers ||= [];
      visual.detail_layers.push({
        id,
        asset: layer.runtimeAsset,
        sha256: layer.editedSha256,
        origin_px: { x: 0, y: 0 },
        z_index: zIndex
      });
    }
  } else if (kind === "foreground") {
    for (const [visual, phase] of [[dayVisual, "day"], [nightVisual, "night"]]) {
      const layer = manifest.art[phase].layers.find((candidate) => candidate.id === id);
      visual.foreground_layers.push({
        id,
        asset: layer.runtimeAsset,
        sha256: layer.editedSha256,
        origin_px: { x: 0, y: 0 },
        z_index: zIndex,
        occlusion_opacity: occlusionOpacity,
        alpha_components: []
      });
    }
  }
  validateProjectManifest(manifest);
  assertProjectSchema(manifest);
  await Promise.all([
    writeJsonAtomic(manifestPath, manifest),
    writeJsonAtomic(join(folder, DRAFT_DAY_VISUAL_FILE), dayVisual),
    writeJsonAtomic(join(folder, DRAFT_NIGHT_VISUAL_FILE), nightVisual)
  ]);
  return { ok: true, id, kind };
}

export async function validateProject(mapId) {
  const loaded = await loadProject(mapId);
  const errors = [];
  const warnings = [];
  if (loaded.drift.length) errors.push(...loaded.drift.map((item) => `Runtime source changed: ${item.path}`));
  try {
    compileCollisionV2(loaded.semantic);
  } catch (error) {
    errors.push(error.message);
  }
  validateRelationships(loaded.semantic, errors);
  await validateCrossMapRelationships(mapId, loaded.semantic, errors);
  validateReachability(loaded.semantic, errors);
  validateForegroundPair(loaded.visuals.day, loaded.visuals.night, errors);
  for (const phase of ["day", "night"]) {
    for (const layer of loaded.manifest.art[phase].layers) {
      const source = layer.sourcePath || layer.path;
      if (!await exists(projectPath(source))) {
        errors.push(`Missing real ${phase} art layer: ${source}`);
        continue;
      }
      if (extname(source).toLowerCase() === ".png") {
        const dimensions = await readPngDimensions(projectPath(source));
        if (
          dimensions.width !== loaded.manifest.dimensions.widthPx ||
          dimensions.height !== loaded.manifest.dimensions.heightPx
        ) {
          errors.push(`${source} has ${dimensions.width}x${dimensions.height}; expected full-map dimensions.`);
        }
      }
    }
  }
  await validateSharedForegroundAlpha(loaded, errors);
  if (mapId === "overworld" && !loaded.manifest.approval?.calibrationAreaApproved) {
    warnings.push("The Charles Jr. calibration area is not yet user-approved; publishing remains disabled.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

export async function stageProject(mapId) {
  const loaded = await loadProject(mapId);
  const validation = await validateProject(mapId);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  const { folder } = resolveProject(mapId);
  const semantic = normalizeSemanticGeometry(loaded.semantic);
  const visuals = synchronizeForegrounds(semantic, loaded.visuals.day, loaded.visuals.night);
  const collision = compileCollisionV2(semantic);
  assertSemanticSchema(semantic);
  assertVisualSchema(visuals.day);
  assertVisualSchema(visuals.night);
  assertCollisionSchema(collision);
  const oldCollision = await readJson(projectPath(loaded.manifest.runtime.collision));
  const migrationEquivalent = String(oldCollision.schema_version).startsWith("1.")
    ? collisionEquivalentAtTileResolution(oldCollision, collision)
    : collisionEquivalentAtCellResolution(oldCollision, collision);
  if (String(oldCollision.schema_version).startsWith("1.") && !migrationEquivalent) {
    throw new Error("4px collision migration does not preserve the current 32px collision field.");
  }
  const stageRoot = join(STAGING_ROOT, mapId);
  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });

  const files = [];
  const authority = await readJson(RUNTIME_AUTHORITY_PATH);
  await applyArtHashesAndStage(loaded.manifest, visuals, authority, stageRoot, files);
  addJsonStage(files, loaded.manifest.runtime.semantic, semantic);
  addJsonStage(files, loaded.manifest.runtime.collision, collision);
  addJsonStage(files, loaded.manifest.runtime.dayVisual, visuals.day);
  addJsonStage(files, loaded.manifest.runtime.nightVisual, visuals.night);
  addJsonStage(files, "RUNTIME_AUTHORITY_MANIFEST.json", authority);

  const registry = await readJson(MAP_REGISTRY_PATH);
  const desiredEntry = {
    semantic: `./${mapId}/semantic.json`,
    collision: `./${mapId}/collision_grid.json`,
    day: `./${mapId}/visual_day.json`,
    night: `./${mapId}/visual_night.json`
  };
  if (JSON.stringify(registry.maps?.[mapId]) !== JSON.stringify(desiredEntry)) {
    registry.maps ||= {};
    registry.maps[mapId] = desiredEntry;
    addJsonStage(files, relative(PROJECT_ROOT, MAP_REGISTRY_PATH).replace(/\\/g, "/"), registry);
  }
  const currentGraph = await readJson(TRANSITION_GRAPH_PATH);
  const nextGraph = await buildTransitionGraph(registry, mapId, semantic, currentGraph);
  if (JSON.stringify(currentGraph) !== JSON.stringify(nextGraph)) {
    addJsonStage(
      files,
      relative(PROJECT_ROOT, TRANSITION_GRAPH_PATH).replace(/\\/g, "/"),
      nextGraph
    );
  }

  for (const file of files) {
    const destination = join(stageRoot, file.path);
    if (file.bytes) await writeBufferAtomic(destination, file.bytes);
    else await writeJsonAtomic(destination, file.json);
  }
  const report = {
    format: "lulus_map_stage_v1",
    stagedAt: new Date().toISOString(),
    mapId,
    sourceHashes: await currentHashes(loaded.manifest),
    files: files.map((file) => ({ path: file.path, sha256: file.bytes ? sha256(file.bytes) : sha256(Buffer.from(`${JSON.stringify(file.json, null, 2)}\n`)) })),
    collisionMigrationEquivalent: migrationEquivalent,
    validation
  };
  await writeJsonAtomic(join(stageRoot, "stage-report.json"), report);
  return report;
}

export async function publishProject(mapId, options = {}) {
  const { manifestPath } = resolveProject(mapId);
  const manifest = await readJson(manifestPath);
  validateProjectManifest(manifest);
  if (
    mapId === "overworld" &&
    !manifest.approval?.calibrationAreaApproved &&
    !options.baselineMigration
  ) {
    throw new Error("Publishing is blocked until the user approves the representative Charles Jr. calibration area.");
  }
  const report = await stageProject(mapId);
  if (options.baselineMigration) {
    const loaded = await loadProject(mapId);
    const hasDraftData = loaded.draft.semantic || loaded.draft.dayVisual || loaded.draft.nightVisual;
    const hasRasterChanges = report.files.some((file) => file.path.toLowerCase().endsWith(".png"));
    if (hasDraftData || hasRasterChanges || report.collisionMigrationEquivalent !== true) {
      throw new Error("Baseline migration is restricted to a no-draft, no-raster, lossless 32px-to-4px contract upgrade.");
    }
  }
  const drift = await sourceDrift(manifest);
  if (drift.length) throw new Error(`Runtime sources changed since import:\n${drift.map((item) => item.path).join("\n")}`);
  const stageRoot = join(STAGING_ROOT, mapId);
  const backupRoot = join(BACKUP_ROOT, `map-export-${nowStamp()}-${mapId}`);
  await mkdir(BACKUP_ROOT, { recursive: true });
  await mkdir(backupRoot, { recursive: false });
  const rollbackEntries = [];
  const prepared = [];
  try {
    for (const file of report.files) {
      const target = projectPath(file.path);
      const stageFile = join(stageRoot, file.path);
      const existed = await exists(target);
      const backup = existed ? join(backupRoot, file.path) : null;
      if (backup) await copyFileEnsured(target, backup);
      rollbackEntries.push({ target, backup, existed });
      const temporary = join(dirname(target), `.${basename(target)}.map-studio-${randomUUID()}`);
      await copyFileEnsured(stageFile, temporary);
      prepared.push({ temporary, target });
    }
    for (const item of prepared) await rename(item.temporary, item.target);
  } catch (error) {
    for (const item of prepared) await rm(item.temporary, { force: true });
    await rollbackFiles(rollbackEntries);
    throw new Error(`Atomic publish failed and was rolled back. ${error.message}`);
  }
  manifest.sourceHashes = await currentHashes(manifest);
  manifest.lastExportHashes = Object.fromEntries(report.files.map((file) => [file.path, file.sha256]));
  manifest.lastPublishedAt = new Date().toISOString();
  if (options.baselineMigration) manifest.baselineMigrationPublishedAt = manifest.lastPublishedAt;
  await writeJsonAtomic(manifestPath, manifest);
  return {
    ok: true,
    mapId,
    backupFolder: relative(PROJECT_ROOT, backupRoot).replace(/\\/g, "/"),
    files: report.files,
    collisionMigrationEquivalent: report.collisionMigrationEquivalent
  };
}

export async function readProjectAsset(relativePath) {
  const safe = assertProjectRelative(relativePath);
  const fullPath = projectPath(safe);
  const info = await stat(fullPath);
  if (!info.isFile()) throw new Error("Asset is not a file.");
  const extension = extname(fullPath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) throw new Error("Only real image assets may be served.");
  return { bytes: await readFile(fullPath), extension, path: safe };
}

function resolveProject(mapId, options = {}) {
  assertMapId(mapId);
  const folder = resolve(PROJECTS_ROOT, mapId);
  const manifestPath = join(folder, PROJECT_FILE);
  if (options.requireExisting !== false && !existsSyncLike(manifestPath)) {
    throw new Error(`Map project ${mapId} has not been imported.`);
  }
  return { folder, manifestPath };
}

function existsSyncLike(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function assertMapId(mapId) {
  if (!/^[a-z][a-z0-9_]*$/.test(mapId)) throw new Error("Invalid map id.");
}

async function preferredDraft(folder, draftName, runtimeRelativePath) {
  const draft = join(folder, draftName);
  return await exists(draft) ? draft : projectPath(runtimeRelativePath);
}

function validateProjectManifest(manifest) {
  if (
    manifest?.format !== "lulus_map_project_v1" ||
    manifest.version !== "1.0.0" ||
    !/^[a-z][a-z0-9_]*$/.test(manifest.mapId || "") ||
    manifest.dimensions?.tileSizePx !== GAME_TILE_SIZE_PX ||
    manifest.dimensions?.collisionCellSizePx !== COLLISION_CELL_SIZE_PX ||
    !manifest.runtime?.semantic ||
    !manifest.runtime?.collision ||
    !manifest.runtime?.dayVisual ||
    !manifest.runtime?.nightVisual ||
    !manifest.art?.day?.layers ||
    !manifest.art?.night?.layers ||
    !Array.isArray(manifest.repairAnnotations)
  ) {
    throw new Error("Invalid lulus_map_project_v1 manifest.");
  }
  if (manifest.mapId === "overworld") {
    const dimensions = manifest.dimensions;
    if (
      dimensions.widthTiles !== OVERWORLD_AUTHORITY.widthTiles ||
      dimensions.heightTiles !== OVERWORLD_AUTHORITY.heightTiles ||
      dimensions.widthPx !== OVERWORLD_AUTHORITY.widthPx ||
      dimensions.heightPx !== OVERWORLD_AUTHORITY.heightPx
    ) {
      throw new Error("Map project attempts to mix the active 96x68 Overworld with another variant.");
    }
  }
  for (const path of Object.values(manifest.runtime)) assertProjectRelative(path);
  for (const phase of ["day", "night"]) {
    for (const layer of manifest.art[phase].layers) {
      if (!layer.id || !layer.path || !layer.runtimeAsset) throw new Error(`${phase} art layer is incomplete.`);
      assertProjectRelative(layer.path);
      if (layer.sourcePath) assertProjectRelative(layer.sourcePath);
    }
  }
}

function runtimePathsForEntry(mapId, entry) {
  const normalizeRegistryPath = (value, fallback) => {
    const raw = String(value || fallback).replace(/\\/g, "/");
    const relativePath = raw.replace(/^(\.\.\/maps\/|\.\/)/, "");
    return `public/data/maps/${relativePath}`;
  };
  return {
    semantic: normalizeRegistryPath(entry.semantic, `${mapId}/semantic.json`),
    collision: normalizeRegistryPath(entry.collision, `${mapId}/collision_grid.json`),
    dayVisual: normalizeRegistryPath(entry.day, `${mapId}/visual_day.json`),
    nightVisual: normalizeRegistryPath(entry.night, `${mapId}/visual_night.json`),
    assetRoot: `public/assets/maps/native/${mapId}`
  };
}

function buildArtModel(dayVisual, nightVisual) {
  return {
    day: { layers: artLayersForVisual(dayVisual, "day") },
    night: { layers: artLayersForVisual(nightVisual, "night") }
  };
}

function artLayersForVisual(visual, phase) {
  const layers = [{
    id: "base",
    kind: "base",
    path: runtimeAssetPath(visual.base_layer.asset),
    runtimeAsset: visual.base_layer.asset,
    locked: false,
    visible: true,
    zIndex: visual.base_layer.z_index ?? 0
  }];
  for (const detail of visual.detail_layers || []) {
    layers.push({
      id: detail.id,
      kind: "detail",
      path: runtimeAssetPath(detail.asset),
      runtimeAsset: detail.asset,
      locked: false,
      visible: true,
      phase,
      zIndex: detail.z_index
    });
  }
  for (const foreground of visual.foreground_layers || []) {
    layers.push({
      id: foreground.id,
      kind: "foreground",
      path: runtimeAssetPath(foreground.asset),
      runtimeAsset: foreground.asset,
      foregroundLayerId: foreground.id,
      locked: false,
      visible: true,
      sharedAlpha: true,
      phase,
      zIndex: foreground.z_index
    });
  }
  return layers;
}

function runtimeAssetPath(asset) {
  const relativeAsset = String(asset).replace(/^production\//, "");
  return `public/assets/maps/native/${relativeAsset}`;
}

function displayNameForMap(mapId) {
  return mapId === "charles_jr" ? "Charles Jr." : mapId[0].toUpperCase() + mapId.slice(1);
}

function validatePhasePair(semantic, day, night) {
  for (const [phase, visual] of [["day", day], ["night", night]]) {
    if (!visual || visual.map_id !== semantic.map_id || visual.variant !== phase) {
      throw new Error(`${semantic.map_id} is missing its dedicated ${phase} visual descriptor.`);
    }
    const pixels = semantic.map_dimensions.pixels;
    if (
      visual.canvas?.width_px !== pixels.width ||
      visual.canvas?.height_px !== pixels.height ||
      visual.canvas?.tile_size_px !== GAME_TILE_SIZE_PX ||
      visual.canvas?.origin_px?.x !== 0 ||
      visual.canvas?.origin_px?.y !== 0
    ) {
      throw new Error(`${semantic.map_id} ${phase} visual does not share runtime geometry.`);
    }
  }
  const errors = [];
  validateForegroundPair(day, night, errors);
  if (errors.length) throw new Error(errors.join("\n"));
}

function validateForegroundPair(day, night, errors) {
  const dayLayers = new Map((day.foreground_layers || []).map((layer) => [layer.id, layer]));
  const nightLayers = new Map((night.foreground_layers || []).map((layer) => [layer.id, layer]));
  for (const [id, dayLayer] of dayLayers) {
    const nightLayer = nightLayers.get(id);
    if (!nightLayer) {
      errors.push(`Night is missing foreground layer ${id}.`);
      continue;
    }
    const geometry = (layer) => (layer.alpha_components || []).map((component) => ({
      id: component.id,
      pixel_bbox: component.pixel_bbox,
      trigger_pixel_rect: triggerPixelRect(component),
      trigger_pixel_polygon: component.trigger_pixel_polygon || null
    }));
    if (JSON.stringify(geometry(dayLayer)) !== JSON.stringify(geometry(nightLayer))) {
      errors.push(`Day/Night foreground geometry differs for ${id}.`);
    }
  }
  for (const id of nightLayers.keys()) if (!dayLayers.has(id)) errors.push(`Day is missing foreground layer ${id}.`);
}

function synchronizeForegrounds(semantic, day, night) {
  if (!day || !night) throw new Error("Both dedicated Day and Night visual descriptors are required.");
  for (const visual of [day, night]) {
    for (const layer of visual.foreground_layers || []) {
      for (const component of layer.alpha_components || []) {
        const rect = triggerPixelRect(component);
        if (!rect && !component.trigger_pixel_polygon) {
          throw new Error(`${visual.variant}:${layer.id}:${component.id} has no foreground trigger geometry.`);
        }
        if (rect) {
          component.trigger_pixel_rect = rect;
          const tileRect = pixelRectToTileRect(rect);
          if (tileRect) component.trigger_tile_rect = tileRect;
          else delete component.trigger_tile_rect;
        }
      }
    }
  }
  const errors = [];
  validateForegroundPair(day, night, errors);
  const existingOcclusion = new Map(
    (semantic.foreground_occlusion_regions || []).map((record) => [record.id, record])
  );
  semantic.foreground_occlusion_regions = [];
  for (const layer of day.foreground_layers || []) {
    for (const component of layer.alpha_components || []) {
      const id = `${layer.id}::${component.id}`;
      const record = {
        ...(existingOcclusion.get(id) || {}),
        id,
        foreground_layer_id: layer.id,
        pixel_bbox: structuredClone(component.pixel_bbox)
      };
      if (component.trigger_pixel_polygon) record.trigger_pixel_polygon = structuredClone(component.trigger_pixel_polygon);
      else {
        record.trigger_pixel_rect = structuredClone(component.trigger_pixel_rect);
        if (component.trigger_tile_rect) record.trigger_tile_rect = structuredClone(component.trigger_tile_rect);
      }
      semantic.foreground_occlusion_regions.push(record);
    }
  }
  return { day, night };
}

function triggerPixelRect(component) {
  if (component.trigger_pixel_rect) return structuredClone(component.trigger_pixel_rect);
  if (!component.trigger_tile_rect) return null;
  return {
    x: component.trigger_tile_rect.x * GAME_TILE_SIZE_PX,
    y: component.trigger_tile_rect.y * GAME_TILE_SIZE_PX,
    width: component.trigger_tile_rect.width * GAME_TILE_SIZE_PX,
    height: component.trigger_tile_rect.height * GAME_TILE_SIZE_PX
  };
}

function validateRelationships(semantic, errors) {
  const ids = new Set();
  for (const collection of [
    "walkable_regions", "blocked_regions", "passable_overrides", "structures", "objects", "doors",
    "transitions", "spawns", "npc_spawn_markers", "interactions", "event_regions"
  ]) {
    for (const record of semantic[collection] || []) {
      if (ids.has(record.id)) errors.push(`Duplicate semantic id: ${record.id}`);
      ids.add(record.id);
    }
  }
  const transitions = new Set((semantic.transitions || []).map((record) => record.id));
  const spawns = new Set((semantic.spawns || []).map((record) => record.id));
  for (const door of semantic.doors || []) {
    if (door.transition_id && !transitions.has(door.transition_id)) errors.push(`${door.id} references missing ${door.transition_id}.`);
  }
  for (const interaction of semantic.interactions || []) {
    if (interaction.target_object_id && !ids.has(interaction.target_object_id)) {
      errors.push(`${interaction.id} references missing ${interaction.target_object_id}.`);
    }
  }
  for (const transition of semantic.transitions || []) {
    if (!transition.target_map || !transition.target_spawn_id || !transition.target_transition_id) {
      errors.push(`${transition.id} has incomplete destination data.`);
    }
  }
  for (const spawn of semantic.spawns || []) {
    if (spawn.source_transition_id && !spawn.source_transition_id.startsWith("transition_")) {
      errors.push(`${spawn.id} has invalid source_transition_id.`);
    }
  }
  if (!spawns.size) errors.push("Map needs at least one real player spawn.");
}

async function validateCrossMapRelationships(mapId, semantic, errors) {
  const registry = await readJson(MAP_REGISTRY_PATH);
  const semanticCache = new Map([[mapId, semantic]]);
  for (const transition of semantic.transitions || []) {
    const targetMap = String(transition.target_map || "");
    const entry = registry.maps?.[targetMap];
    if (!entry) {
      errors.push(`${transition.id} targets unregistered map ${targetMap || "(missing)"}.`);
      continue;
    }
    let targetSemantic = semanticCache.get(targetMap);
    if (!targetSemantic) {
      const targetProject = resolveProject(targetMap, { requireExisting: false });
      const draftPath = join(targetProject.folder, DRAFT_SEMANTIC_FILE);
      targetSemantic = await readJson(
        await exists(draftPath) ? draftPath : projectPath(runtimePathsForEntry(targetMap, entry).semantic)
      );
      semanticCache.set(targetMap, targetSemantic);
    }
    const reciprocal = (targetSemantic.transitions || []).find(
      (candidate) => candidate.id === transition.target_transition_id
    );
    if (!reciprocal) {
      errors.push(`${transition.id} targets missing transition ${targetMap}:${transition.target_transition_id}.`);
    } else if (
      reciprocal.target_map !== mapId ||
      reciprocal.target_transition_id !== transition.id
    ) {
      errors.push(`${transition.id} and ${targetMap}:${reciprocal.id} are not reciprocal.`);
    }
    const spawn = (targetSemantic.spawns || []).find(
      (candidate) => candidate.id === transition.target_spawn_id
    );
    if (!spawn) {
      errors.push(`${transition.id} targets missing spawn ${targetMap}:${transition.target_spawn_id}.`);
    } else if (spawn.source_transition_id && spawn.source_transition_id !== transition.id) {
      errors.push(`${targetMap}:${spawn.id} is linked to ${spawn.source_transition_id}, not ${transition.id}.`);
    }
  }
}

function validateReachability(semantic, errors) {
  const collision = decodeCollisionSource(compileCollisionV2(semantic));
  const isWalkableAtPixel = (x, y) => {
    const cellX = Math.floor(x / collision.cellSize);
    const cellY = Math.floor(y / collision.cellSize);
    return (
      cellX >= 0 &&
      cellY >= 0 &&
      cellX < collision.width &&
      cellY < collision.height &&
      collision.cells[cellY * collision.width + cellX] === 1
    );
  };
  for (const spawn of semantic.spawns || []) {
    if (!isWalkableAtPixel(spawn.pixel_point.x, spawn.pixel_point.y - 6)) {
      errors.push(`${spawn.id} is not on precise walkable collision.`);
    }
  }
  for (const interaction of semantic.interactions || []) {
    const bounds = interaction.pixel_rect || boundsForPolygon(interaction.pixel_polygon?.points || []);
    const margin = 48;
    let reachable = false;
    for (
      let y = Math.max(2, bounds.y - margin);
      y <= Math.min(semantic.map_dimensions.pixels.height - 2, bounds.y + bounds.height + margin) && !reachable;
      y += collision.cellSize
    ) {
      for (
        let x = Math.max(2, bounds.x - margin);
        x <= Math.min(semantic.map_dimensions.pixels.width - 2, bounds.x + bounds.width + margin);
        x += collision.cellSize
      ) {
        if (isWalkableAtPixel(x, y)) {
          reachable = true;
          break;
        }
      }
    }
    if (!reachable) errors.push(`${interaction.id} has no precise walkable approach within 48px.`);
  }
}

async function validateSharedForegroundAlpha(loaded, errors) {
  const dayById = new Map(loaded.manifest.art.day.layers.map((layer) => [layer.id, layer]));
  const nightById = new Map(loaded.manifest.art.night.layers.map((layer) => [layer.id, layer]));
  for (const visualLayer of loaded.visuals.day.foreground_layers || []) {
    const day = dayById.get(visualLayer.id);
    const night = nightById.get(visualLayer.id);
    if (!day || !night) continue;
    const [dayHash, nightHash] = await Promise.all([
      hashPngAlpha(projectPath(day.sourcePath || day.path)),
      hashPngAlpha(projectPath(night.sourcePath || night.path))
    ]);
    if (dayHash !== nightHash) {
      errors.push(`Day/Night foreground alpha differs for ${visualLayer.id}.`);
    }
  }
}

function boundsForPolygon(points) {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

async function buildTransitionGraph(registry, activeMapId, activeSemantic, currentGraph) {
  const semantics = new Map();
  for (const [mapId, entry] of Object.entries(registry.maps || {})) {
    if (mapId === activeMapId) {
      semantics.set(mapId, activeSemantic);
      continue;
    }
    const targetProject = resolveProject(mapId, { requireExisting: false });
    const draftPath = join(targetProject.folder, DRAFT_SEMANTIC_FILE);
    semantics.set(
      mapId,
      await readJson(
        await exists(draftPath) ? draftPath : projectPath(runtimePathsForEntry(mapId, entry).semantic)
      )
    );
  }
  const existingPairs = new Map();
  for (const pair of currentGraph.pairs || []) {
    const key = [pair.a?.transition, pair.b?.transition].sort().join("::");
    existingPairs.set(key, pair);
  }
  const pairs = [];
  const seen = new Set();
  for (const [mapId, semantic] of semantics) {
    for (const transition of semantic.transitions || []) {
      const targetSemantic = semantics.get(transition.target_map);
      const reciprocal = (targetSemantic?.transitions || []).find(
        (candidate) =>
          candidate.id === transition.target_transition_id &&
          candidate.target_map === mapId &&
          candidate.target_transition_id === transition.id
      );
      if (!reciprocal) continue;
      const key = [transition.id, reciprocal.id].sort().join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = existingPairs.get(key);
      if (existing) {
        pairs.push(existing);
        continue;
      }
      const ends = [
        {
          map: mapId,
          transition: transition.id,
          arrival_spawn: transition.target_spawn_id
        },
        {
          map: transition.target_map,
          transition: reciprocal.id,
          arrival_spawn: reciprocal.target_spawn_id
        }
      ].sort((a, b) => a.map.localeCompare(b.map) || a.transition.localeCompare(b.transition));
      pairs.push({
        pair_id: `${ends[0].map}_${ends[1].map}`,
        a: ends[0],
        b: ends[1]
      });
    }
  }
  return {
    ...currentGraph,
    pairs
  };
}

async function sourceDrift(manifest) {
  const drift = [];
  for (const [path, expected] of Object.entries(manifest.sourceHashes || {})) {
    const fullPath = projectPath(path);
    if (!await exists(fullPath)) {
      drift.push({ path, expected, actual: null });
      continue;
    }
    const actual = await hashFile(fullPath);
    if (actual !== expected) drift.push({ path, expected, actual });
  }
  return drift;
}

async function currentHashes(manifest) {
  const hashes = {};
  for (const path of Object.keys(manifest.sourceHashes || {})) {
    if (await exists(projectPath(path))) hashes[path] = await hashFile(projectPath(path));
  }
  return hashes;
}

async function applyArtHashesAndStage(manifest, visuals, authority, stageRoot, files) {
  const byPhase = { day: visuals.day, night: visuals.night };
  for (const phase of ["day", "night"]) {
    const visual = byPhase[phase];
    const layersById = new Map(manifest.art[phase].layers.map((layer) => [layer.id, layer]));
    const base = layersById.get("base");
    if (!base) throw new Error(`${phase} is missing its base art layer.`);
    const baseBytes = await readFile(projectPath(base.sourcePath || base.path));
    const baseHash = sha256(baseBytes);
    visual.base_layer.asset = base.runtimeAsset;
    visual.base_layer.sha256 = baseHash;
    authority.map_assets_sha256[base.runtimeAsset.replace(/^production\//, "")] = baseHash;
    if (base.sourcePath) files.push({ path: base.path, bytes: baseBytes });
    for (const visualLayer of visual.detail_layers || []) {
      const layer = layersById.get(visualLayer.id);
      if (!layer) throw new Error(`${phase} detail ${visualLayer.id} has no real art layer.`);
      const bytes = await readFile(projectPath(layer.sourcePath || layer.path));
      const hash = sha256(bytes);
      visualLayer.asset = layer.runtimeAsset;
      visualLayer.sha256 = hash;
      authority.map_assets_sha256[layer.runtimeAsset.replace(/^production\//, "")] = hash;
      if (layer.sourcePath) files.push({ path: layer.path, bytes });
    }
    for (const visualLayer of visual.foreground_layers || []) {
      const layer = layersById.get(visualLayer.id);
      if (!layer) throw new Error(`${phase} foreground ${visualLayer.id} has no real art layer.`);
      const bytes = await readFile(projectPath(layer.sourcePath || layer.path));
      const hash = sha256(bytes);
      visualLayer.asset = layer.runtimeAsset;
      visualLayer.sha256 = hash;
      if (phase === "day") visualLayer.day_sha256 = hash;
      else visualLayer.night_sha256 = hash;
      authority.map_assets_sha256[layer.runtimeAsset.replace(/^production\//, "")] = hash;
      if (layer.sourcePath) files.push({ path: layer.path, bytes });
    }
  }
  const dayLayers = new Map((visuals.day.foreground_layers || []).map((layer) => [layer.id, layer]));
  for (const nightLayer of visuals.night.foreground_layers || []) {
    const dayLayer = dayLayers.get(nightLayer.id);
    if (!dayLayer) continue;
    dayLayer.night_sha256 = nightLayer.sha256;
    nightLayer.day_sha256 = dayLayer.sha256;
  }
}

function addJsonStage(files, path, json) {
  files.push({ path: assertProjectRelative(path), json });
}

function normalizeAnnotation(annotation, index) {
  if (!annotation || typeof annotation !== "object" || !annotation.geometry || !annotation.category) {
    throw new Error(`Repair annotation ${index} is incomplete.`);
  }
  return {
    ...annotation,
    id: String(annotation.id || `repair_${randomUUID().slice(0, 8)}`),
    status: ["open", "in_progress", "ready_for_review", "approved"].includes(annotation.status)
      ? annotation.status
      : "open",
    notes: String(annotation.notes || "")
  };
}

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "_");
}

function makeVisualDescriptor(project, phase) {
  const base = project.art[phase].layers.find((layer) => layer.kind === "base");
  const details = project.art[phase].layers.filter((layer) => layer.kind === "detail");
  return {
    $schema: "../../schema/visual-config.schema.json",
    schema_version: "1.0.0",
    map_id: project.mapId,
    semantic_geometry: "semantic.json",
    canvas: {
      width_px: project.dimensions.widthPx,
      height_px: project.dimensions.heightPx,
      tile_size_px: GAME_TILE_SIZE_PX,
      origin_px: { x: 0, y: 0 }
    },
    art_source: { package: "user-approved project artwork", authority: "RUNTIME_AUTHORITY_MANIFEST.json" },
    detail_layers: details.map((layer) => ({
      id: layer.id,
      asset: layer.runtimeAsset,
      ...(layer.editedSha256 ? { sha256: layer.editedSha256 } : {}),
      origin_px: { x: 0, y: 0 },
      z_index: layer.zIndex
    })),
    foreground_layers: [],
    alignment_contract: "Base and foreground layers use canvas origin (0,0); day/night share semantic.json exactly.",
    variant: phase,
    base_layer: {
      asset: base.runtimeAsset,
      ...(base.editedSha256 ? { sha256: base.editedSha256 } : {}),
      origin_px: { x: 0, y: 0 },
      z_index: 0
    }
  };
}
