import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  type CharacterAction,
  type CharacterIndexV1,
  type CharacterManifestV2,
  type CharacterProjectV1,
  type DirectionName,
  type FrameAnchor,
  type FrameEvent,
  type RuntimeActionV2,
  type RuntimeFrameV2,
  type SourceAsset
} from "../src/types";
import { validateCharacterProject } from "../src/schema";

const TOOL_ROOT = resolve(import.meta.dirname, "..");
const PROJECT_ROOT = resolve(TOOL_ROOT, "..", "..");
const PROJECTS_ROOT = join(PROJECT_ROOT, "character-production", "projects");
const V2_ROOT = join(PROJECT_ROOT, "public", "assets", "characters", "v2");
const INDEX_PATH = join(PROJECT_ROOT, "public", "assets", "characters", "INDEX.json");

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

type LegacyLuluManifest = {
  package: string;
  frame_cell: [number, number];
  row_order: DirectionName[];
  foot_anchor: [number, number];
  animations: Record<
    string,
    {
      sheet: string;
      frames_per_direction: number;
      grounded_frames_zero_based: number[];
      intended_use: string;
    }
  >;
};

type LegacyBrutusAnimation = {
  filename: string;
  frame_cell: [number, number];
  frames_per_direction: number;
  direction_order: DirectionName[];
  ground_root_anchor: [number, number];
  action_purpose: string;
  root_mode: string;
};

type LegacyBrutusManifest = {
  package: string;
  brutus_design_authority: string;
  brutus_animations: Record<string, LegacyBrutusAnimation>;
  lulu_interaction_animations: Record<string, LegacyBrutusAnimation>;
};

type LegacyNpcSheet = {
  filename: string;
  character_name: string;
  character_key: string;
  variant_name: string | null;
  action: string;
  action_purpose: string;
  frame_cell_size: [number, number];
  frames_per_direction: number;
  direction_order: DirectionName[];
  ground_root_anchor: [number, number];
  frame_occupied_bounds?: Array<Array<[number, number, number, number]>>;
};

type LegacyNpcManifest = {
  package: string;
  sheets: LegacyNpcSheet[];
};

type LegacyBirdSheet = {
  filename: string;
  bird_id: string;
  bird_name: string;
  species: string;
  story_role: string;
  action: string;
  action_purpose: string;
  pose_type: "grounded" | "mixed" | "airborne" | "transition";
  frame_cell_size: [number, number];
  frames_per_direction: number;
  direction_order: DirectionName[];
  root_anchor: [number, number];
  frame_visual_offsets_y: number[];
  frame_occupied_bounds?: Array<Array<[number, number, number, number]>>;
};

type LegacyBirdManifest = {
  package: string;
  species: Record<string, { preview: string }>;
  sheets: LegacyBirdSheet[];
};

type LegacyInteractions = {
  interactions: Record<
    string,
    {
      lulu_animation: string;
      brutus_animation: string;
      synchronization: Record<string, unknown>;
      per_direction: Record<DirectionName, Record<string, unknown>>;
    }
  >;
};

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(join(PROJECT_ROOT, path), "utf8")) as T;
}

function rel(path: string): string {
  return relative(PROJECT_ROOT, path).replace(/\\/g, "/");
}

async function hash(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(join(PROJECT_ROOT, path))).digest("hex");
}

async function source(
  id: string,
  role: SourceAsset["role"],
  path: string,
  approval: SourceAsset["approval"],
  notes?: string,
  knownSha256?: string
): Promise<SourceAsset> {
  const exists = existsSync(join(PROJECT_ROOT, path));
  return {
    id,
    role,
    path,
    sha256: exists ? await hash(path) : knownSha256 ?? null,
    immutable: true,
    approval,
    notes,
    missing: exists ? undefined : true
  };
}

function displayAction(action: string): string {
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function actionCategory(action: string): CharacterAction["category"] {
  if (["walk", "run", "dash", "fly", "hop", "carry_fly"].includes(action)) return "locomotion";
  if (action.includes("_to_") || ["takeoff", "land"].includes(action)) return "transition";
  if (["hit", "knocked_down", "startled_failure"].includes(action)) return "reaction";
  if (
    [
      "pet_dog",
      "feed_dog",
      "being_petted",
      "eating",
      "sniff",
      "throw_toy",
      "companion_command",
      "theft_attempt",
      "serve_gesture",
      "simple_gesture",
      "magic_gesture",
      "command_reaction",
      "alert_call",
      "alert_interested"
    ].includes(action)
  ) {
    return "interaction";
  }
  return action.includes("idle") || ["sit", "lay_rest", "stand_pose", "play_ready", "carry_pose", "happy_excited"].includes(action)
    ? "idle"
    : "custom";
}

function playback(action: string, frameCount: number): CharacterAction["playback"] {
  if (action.includes("_to_") || ["takeoff", "land", "hit", "theft_attempt", "throw_toy", "feed_dog", "pet_dog"].includes(action)) {
    return "once";
  }
  if (frameCount <= 2 && ["sit", "lay_rest", "knocked_down", "stand_pose", "carry_pose"].includes(action)) return "hold";
  return "loop";
}

function frameDuration(characterId: string, action: string): number {
  if (action === "walk") return 125;
  if (action === "run") return 100;
  if (action.includes("idle") || ["sit", "lay_rest", "stand_pose"].includes(action)) return 250;
  if (characterId === "ambient_robin" && action === "idle") return 400;
  if (action === "feed_dog" || action === "eating") return 190;
  if (action === "companion_command") return 170;
  if (action === "throw_toy" || action === "play_ready") return 150;
  return 180;
}

function cycleDistance(characterId: string, action: string, frames: number): number | undefined {
  if (action === "walk") return characterId === "brutus" ? 112 * 0.125 * frames : 144 * 0.125 * frames;
  if (action === "run") return characterId === "brutus" ? 184 * 0.1 * frames : 240 * 0.1 * frames;
  if (action === "dash") return 240 * 0.1 * frames;
  if (action === "hop") return 32;
  if (action === "fly" || action === "carry_fly") return 64;
  return undefined;
}

function eventForFrame(action: string, index: number, sync?: Record<string, unknown>): FrameEvent[] {
  const events: FrameEvent[] = [];
  const contactFrames = sync?.contact_frames_zero_based;
  if (Array.isArray(contactFrames) && contactFrames.includes(index)) {
    events.push({ id: `${action}_contact_${index}`, type: "contact" });
  }
  const mappings: Array<[string, FrameEvent["type"]]> = [
    ["food_spawn_frame", "spawn"],
    ["command_cue_frame", "cue"],
    ["response_frame", "cue"],
    ["throw_release_frame", "release"],
    ["theft_contact_frame", "contact"],
    ["mouth_contact_frame", "contact"]
  ];
  for (const [field, type] of mappings) {
    if (Number(sync?.[field]) === index) events.push({ id: `${action}_${field}`, type });
  }
  return events;
}

function anchorsFromInteraction(
  alignment: Record<string, unknown> | undefined,
  owner: "lulu" | "brutus",
  root: [number, number]
): FrameAnchor[] {
  if (!alignment) return [];
  const mappings: Array<[string, FrameAnchor["role"]]> =
    owner === "lulu"
      ? [
          ["lulu_throw_origin_local", "effect_origin"]
        ]
      : [
          ["brutus_mouth_anchor_local", "mouth"],
          ["brutus_pet_contact_local", "interaction"]
        ];
  const anchors: FrameAnchor[] = [];
  for (const [field, role] of mappings) {
    const value = alignment[field];
    if (Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number")) {
      anchors.push({
        id: field,
        role,
        point: { x: root[0] + Number(value[0]), y: root[1] + Number(value[1]) },
        drawOrder: "front"
      });
    }
  }
  return anchors;
}

function makeAction(options: {
  projectId: string;
  actionId: string;
  sourcePath: string;
  runtimeHref: string;
  cell: [number, number];
  frameCount: number;
  directions: DirectionName[];
  root: [number, number];
  groundedFrames?: number[];
  bounds?: Array<Array<[number, number, number, number]>>;
  interaction?: LegacyInteractions["interactions"][string];
  interactionOwner?: "lulu" | "brutus";
}): CharacterAction {
  const tracks: CharacterAction["tracks"] = {};
  const category = actionCategory(options.actionId);
  options.directions.forEach((direction, row) => {
    const alignment = options.interaction?.per_direction[direction];
    tracks[direction] = {
      direction,
      frames: Array.from({ length: options.frameCount }, (_, index) => {
        const occupied = options.bounds?.[row]?.[index];
        return {
          id: `${direction.replace(/[^A-Za-z]+/g, "_").toLowerCase()}_${index}`,
          imagePath: options.sourcePath,
          crop: {
            x: index * options.cell[0],
            y: row * options.cell[1],
            width: options.cell[0],
            height: options.cell[1]
          },
          durationMs:
            typeof options.interaction?.synchronization.frame_ms === "number"
              ? options.interaction.synchronization.frame_ms
              : frameDuration(options.projectId, options.actionId),
          root: { x: options.root[0], y: options.root[1] },
          visualOffset: { x: 0, y: 0 },
          bodyBounds: occupied
            ? { x: occupied[0], y: occupied[1], width: occupied[2] - occupied[0] + 1, height: occupied[3] - occupied[1] + 1 }
            : undefined,
          grounded: options.groundedFrames ? options.groundedFrames.includes(index) : category !== "transition",
          contact: category === "locomotion" ? (index === 0 ? "left" : index === Math.floor(options.frameCount / 2) ? "right" : "none") : "none",
          anchors: anchorsFromInteraction(alignment, options.interactionOwner ?? "lulu", options.root),
          events: eventForFrame(options.actionId, index, options.interaction?.synchronization),
          sourceFrame: { direction, index }
        };
      })
    };
  });
  return {
    id: options.actionId,
    displayName: displayAction(options.actionId),
    category,
    playback: playback(options.actionId, options.frameCount),
    directionMode: options.directions.length === 8 ? "eight" : options.directions.length === 1 ? "single" : "explicit",
    directions: options.directions,
    cell: { width: options.cell[0], height: options.cell[1] },
    loop: { start: 0, end: options.frameCount - 1 },
    entryFrame: 0,
    stopPolicy: "idle_entry",
    cycleDistancePx: cycleDistance(options.projectId, options.actionId, options.frameCount),
    runtimeSheet: options.sourcePath,
    runtimeHref: options.runtimeHref,
    tracks
  };
}

function baseProject(options: {
  id: string;
  displayName: string;
  characterClass: CharacterProjectV1["characterClass"];
  species?: string;
  canonicalApproval: "unapproved" | "approved";
  identityNotes: string[];
  warnings: string[];
  collisionProfileId: string;
  legacyPackage: string;
  renderScales?: Record<string, number>;
}): CharacterProjectV1 {
  return {
    schema: "lulus-character-project",
    version: 1,
    id: options.id,
    displayName: options.displayName,
    characterClass: options.characterClass,
    species: options.species,
    identity: {
      canonicalApproval: options.canonicalApproval,
      locked: options.canonicalApproval === "approved",
      notes: options.identityNotes,
      paletteReferences: []
    },
    production: {
      status: "runtime_ready",
      revision: 1,
      warnings: options.warnings
    },
    presentation: {
      nativeCell: { width: 96, height: 96 },
      renderScales: options.renderScales ?? { overworld: 1, home: 1, charles_jr: 1, battle: 1 },
      resampling: "none"
    },
    collisionProfileId: options.collisionProfileId,
    sources: [],
    actions: {},
    portraits: [],
    runtime: {
      manifestPath: `public/assets/characters/v2/${options.id}/MANIFEST.json`,
      generatedAssetDirectory: `public/assets/characters/generated/${options.id}/sheets`,
      legacyPackage: options.legacyPackage
    },
    updatedAt: new Date().toISOString()
  };
}

async function migrateLulu(
  manifest: LegacyLuluManifest,
  brutus: LegacyBrutusManifest,
  interactions: LegacyInteractions
): Promise<CharacterProjectV1> {
  const project = baseProject({
    id: "lulu",
    displayName: "Lulu",
    characterClass: "humanoid",
    canonicalApproval: "unapproved",
    identityNotes: [
      "Current runtime Lulu is preserved as the playable demo baseline.",
      "This design is not the approved future Lucy-based canonical Lulu."
    ],
    warnings: [
      "Current four-frame locomotion is retained for parity and requires future canonical replacement.",
      "No approved runtime portrait set is available."
    ],
    collisionProfileId: "player",
    legacyPackage: manifest.package,
    renderScales: { overworld: 1, home: 1.5, charles_jr: 1.5, battle: 1.3 }
  });
  project.sources.push(
    await source("lulu_manifest_v1", "metadata", "public/assets/characters/lulu/MANIFEST.json", "approved"),
    await source(
      "lulu_original_package",
      "reference",
      "Lulu_Overworld_Full_v1.zip",
      "unreviewed",
      "Original package referenced by the active baseline checksums but unavailable in the project.",
      "ca8443cac64a803968f75b13e7bf0d89039e4f45c6a87852abf2d4c6813872c3"
    )
  );
  for (const [actionId, definition] of Object.entries(manifest.animations)) {
    const sourcePath = `public/assets/characters/lulu/${definition.sheet}`;
    project.sources.push(await source(`lulu_${actionId}`, "sheet", sourcePath, "approved", definition.intended_use));
    project.actions[actionId] = makeAction({
      projectId: "lulu",
      actionId,
      sourcePath,
      runtimeHref: `/assets/characters/lulu/${definition.sheet}`,
      cell: manifest.frame_cell,
      frameCount: definition.frames_per_direction,
      directions: manifest.row_order,
      root: manifest.foot_anchor,
      groundedFrames: definition.grounded_frames_zero_based
    });
  }
  for (const [actionId, definition] of Object.entries(brutus.lulu_interaction_animations)) {
    const sourcePath = `public/assets/characters/brutus/${definition.filename}`;
    const interaction = Object.values(interactions.interactions).find((candidate) => candidate.lulu_animation === actionId);
    project.sources.push(await source(`lulu_${actionId}`, "sheet", sourcePath, "approved", definition.action_purpose));
    project.actions[actionId] = makeAction({
      projectId: "lulu",
      actionId,
      sourcePath,
      runtimeHref: `/assets/characters/brutus/${definition.filename}`,
      cell: definition.frame_cell,
      frameCount: definition.frames_per_direction,
      directions: definition.direction_order,
      root: definition.ground_root_anchor,
      interaction,
      interactionOwner: "lulu"
    });
  }
  const historical = [
    "public/assets/character-assets/lulu/walk_8dir.png",
    "public/assets/character-assets/references/not_runtime_ready/lulu_pet_dog_missing_direction.png",
    "public/assets/character-assets/references/not_runtime_ready/lulu_knocked_down_missing_direction.png",
    "public/assets/character-assets/references/not_runtime_ready/lulu_shadows_labeled_reference.png"
  ];
  for (const [index, path] of historical.entries()) {
    project.sources.push(
      await source(
        `historical_lulu_${index + 1}`,
        "reference",
        path,
        "rejected",
        "Historical/reference-only input; never publish automatically."
      )
    );
  }
  return project;
}

async function migrateBrutus(
  manifest: LegacyBrutusManifest,
  interactions: LegacyInteractions
): Promise<CharacterProjectV1> {
  const project = baseProject({
    id: "brutus",
    displayName: "Brutus",
    characterClass: "canine",
    species: "Dog",
    canonicalApproval: "approved",
    identityNotes: [manifest.brutus_design_authority],
    warnings: [
      "Current 96x96 walk/sit mappings are preserved and visually correct.",
      "Legacy 222x222 walk/sit filenames are flagged as swapped and remain reference-only.",
      "Migrated roots preserve current runtime geometry but require explicit human re-authoring because the source manifest labels them bbox_center."
    ],
    collisionProfileId: "brutus",
    legacyPackage: manifest.package
  });
  project.sources.push(
    await source("brutus_manifest_v1", "metadata", "public/assets/characters/brutus/MANIFEST.json", "approved"),
    await source("brutus_interactions_v1", "metadata", "public/assets/characters/brutus/INTERACTIONS.json", "approved"),
    await source(
      "brutus_original_package",
      "reference",
      "Brutus_Companion_Assets_Full_v1.zip",
      "unreviewed",
      "Original package referenced by the active baseline checksums but unavailable in the project.",
      "a26e03b6b1d0a263f4a43ec8f19b743cc7ff1d9c9956727b674754b3f026d478"
    ),
    await source(
      "brutus_validator",
      "metadata",
      "public/assets/characters/brutus/validate_companion_assets.py",
      "unreviewed",
      "Validator referenced by the active manifest but unavailable in the project."
    ),
    await source(
      "brutus_qa_black",
      "reference",
      "public/assets/characters/brutus/qa/black",
      "unreviewed",
      "QA output directory referenced by the active manifest but unavailable in the project."
    ),
    await source(
      "brutus_qa_white",
      "reference",
      "public/assets/characters/brutus/qa/white",
      "unreviewed",
      "QA output directory referenced by the active manifest but unavailable in the project."
    ),
    await source(
      "brutus_qa_nearest",
      "reference",
      "public/assets/characters/brutus/qa/nearest_2x",
      "unreviewed",
      "QA output directory referenced by the active manifest but unavailable in the project."
    )
  );
  for (const [actionId, definition] of Object.entries(manifest.brutus_animations)) {
    const sourcePath = `public/assets/characters/brutus/${definition.filename}`;
    const interaction = Object.values(interactions.interactions).find((candidate) => candidate.brutus_animation === actionId);
    project.sources.push(await source(`brutus_${actionId}`, "sheet", sourcePath, "approved", definition.action_purpose));
    project.actions[actionId] = makeAction({
      projectId: "brutus",
      actionId,
      sourcePath,
      runtimeHref: `/assets/characters/brutus/${definition.filename}`,
      cell: definition.frame_cell,
      frameCount: definition.frames_per_direction,
      directions: definition.direction_order,
      root: definition.ground_root_anchor,
      interaction,
      interactionOwner: "brutus"
    });
  }
  project.sources.push(
    await source(
      "historical_brutus_walk_mislabeled",
      "reference",
      "public/assets/character-assets/animals/brutus/walk_8dir.png",
      "rejected",
      "Historical file visually contains seated poses despite its walk filename."
    ),
    await source(
      "historical_brutus_sit_mislabeled",
      "reference",
      "public/assets/character-assets/animals/brutus/sit_8dir.png",
      "rejected",
      "Historical file visually contains locomotion despite its sit filename."
    )
  );
  return project;
}

async function migrateNpcs(manifest: LegacyNpcManifest): Promise<CharacterProjectV1[]> {
  const groups = groupBy(manifest.sheets, (sheet) => sheet.character_key);
  const projects: CharacterProjectV1[] = [];
  for (const [characterId, sheets] of groups) {
    const first = sheets[0];
    const project = baseProject({
      id: characterId,
      displayName: first.character_name,
      characterClass: "humanoid",
      canonicalApproval: "approved",
      identityNotes: first.variant_name ? [first.variant_name] : [],
      warnings: [],
      collisionProfileId: "npc_standard",
      legacyPackage: manifest.package
    });
    project.sources.push(
      await source(`${characterId}_manifest_v1`, "metadata", "public/assets/characters/npcs/MANIFEST.json", "approved"),
      await source(
        `${characterId}_original_package`,
        "reference",
        "NPC_Overworld_Batch_v1.zip",
        "unreviewed",
        "Original package referenced by the active baseline checksums but unavailable in the project.",
        "79df1a96dc2f3130a30084aa692bc5edb2fac8c67d03941cfc52285164943ef4"
      )
    );
    for (const sheet of sheets) {
      const sourcePath = `public/assets/characters/npcs/${sheet.filename}`;
      project.sources.push(await source(`${characterId}_${sheet.action}`, "sheet", sourcePath, "approved", sheet.action_purpose));
      project.actions[sheet.action] = makeAction({
        projectId: characterId,
        actionId: sheet.action,
        sourcePath,
        runtimeHref: `/assets/characters/npcs/${sheet.filename}`,
        cell: sheet.frame_cell_size,
        frameCount: sheet.frames_per_direction,
        directions: sheet.direction_order,
        root: sheet.ground_root_anchor,
        bounds: sheet.frame_occupied_bounds
      });
    }
    if (characterId === "homeless_man_day") {
      project.sources.push(
        await source(
          "historical_homeless_walk",
          "reference",
          "public/assets/character-assets/npcs/homeless_man/daytime/walk_8dir.png",
          "rejected",
          "Historical repaired input; active 96x96 production sheet is authoritative."
        )
      );
    }
    if (characterId === "charles_jr_employee") {
      project.production.warnings.push(
        "Active employee sheets supersede the four malformed combined worker reference boards; those boards remain reference-only."
      );
      const workerPaths = [
        "01_worker_female_1_combined_idle_walk.png",
        "02_worker_male_1_combined_idle_walk.png",
        "03_worker_female_2_combined_idle_walk.png",
        "04_worker_male_2_combined_idle_walk.png"
      ];
      for (const [index, filename] of workerPaths.entries()) {
        project.sources.push(
          await source(
            `historical_worker_${index + 1}`,
            "reference",
            `public/assets/character-assets/references/not_runtime_ready/cjr_workers/${filename}`,
            "rejected",
            "Malformed combined idle/walk reference; never runtime-export automatically."
          )
        );
      }
    }
    projects.push(project);
  }
  return projects;
}

async function migrateBirds(manifest: LegacyBirdManifest): Promise<CharacterProjectV1[]> {
  const groups = groupBy(manifest.sheets, (sheet) => sheet.bird_id);
  const projects: CharacterProjectV1[] = [];
  for (const [characterId, sheets] of groups) {
    const first = sheets[0];
    const project = baseProject({
      id: characterId,
      displayName: first.bird_name,
      characterClass: "bird",
      species: first.species,
      canonicalApproval: "approved",
      identityNotes: [first.story_role],
      warnings: [
        "Legacy vertical pose offsets describe art already positioned inside the active sheet cells; migrated runtime visual offsets remain zero to preserve current presentation."
      ],
      collisionProfileId: "bird_visual",
      legacyPackage: manifest.package
    });
    project.sources.push(
      await source(`${characterId}_manifest_v1`, "metadata", "public/assets/characters/birds/MANIFEST.json", "approved"),
      await source(
        `${characterId}_attachment_metadata`,
        "metadata",
        "public/assets/characters/birds/INTERACTION_AND_ATTACHMENT_METADATA.json",
        "approved"
      ),
      await source(
        `${characterId}_preview`,
        "reference",
        `public/assets/characters/birds/${manifest.species[characterId].preview}`,
        "unreviewed",
        "Preview referenced by the active bird manifest but unavailable in the project."
      )
    );
    for (const sheet of sheets) {
      const sourcePath = `public/assets/characters/birds/${sheet.filename}`;
      project.sources.push(await source(`${characterId}_${sheet.action}`, "sheet", sourcePath, "approved", sheet.action_purpose));
      project.actions[sheet.action] = makeAction({
        projectId: characterId,
        actionId: sheet.action,
        sourcePath,
        runtimeHref: `/assets/characters/birds/${sheet.filename}`,
        cell: sheet.frame_cell_size,
        frameCount: sheet.frames_per_direction,
        directions: sheet.direction_order,
        root: sheet.root_anchor,
        bounds: sheet.frame_occupied_bounds,
        groundedFrames:
          sheet.pose_type === "airborne"
            ? []
            : sheet.pose_type === "transition"
              ? [sheet.action === "takeoff" ? 0 : sheet.frames_per_direction - 1]
              : undefined
      });
    }
    projects.push(project);
  }
  return projects;
}

function runtimeFrame(frame: NonNullable<CharacterAction["tracks"][DirectionName]>["frames"][number]): RuntimeFrameV2 {
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

function runtimeManifest(project: CharacterProjectV1): CharacterManifestV2 {
  const actions: Record<string, RuntimeActionV2> = {};
  for (const [actionId, action] of Object.entries(project.actions)) {
    const tracks: RuntimeActionV2["tracks"] = {};
    for (const direction of action.directions) {
      const track = action.tracks[direction];
      if (!track) throw new Error(`${project.id}/${actionId} missing ${direction}.`);
      tracks[direction] = track.frames.map(runtimeFrame);
    }
    actions[actionId] = {
      id: actionId,
      category: action.category,
      playback: action.playback,
      directionMode: action.directionMode,
      sheet: action.runtimeHref ?? `/${action.runtimeSheet?.replace(/^public\//, "")}`,
      cell: [action.cell.width, action.cell.height],
      directions: action.directions,
      framesPerDirection: action.tracks[action.directions[0]]?.frames.length ?? 0,
      loop: [action.loop.start, action.loop.end],
      entryFrame: action.entryFrame,
      stopPolicy: action.stopPolicy,
      transitionActionId: action.transitionActionId,
      cycleDistancePx: action.cycleDistancePx,
      tracks
    };
  }
  return {
    schema: "lulus-character-runtime",
    version: 2,
    id: project.id,
    displayName: project.displayName,
    characterClass: project.characterClass,
    species: project.species,
    status: project.production.status,
    collisionProfileId: project.collisionProfileId,
    renderScales: project.presentation.renderScales,
    actions,
    sourceProject: {
      path: `character-production/projects/${project.id}/project.json`,
      revision: project.production.revision
    }
  };
}

async function writeProject(project: CharacterProjectV1): Promise<void> {
  const validation = validateCharacterProject(project);
  if (!validation.ok) throw new Error(`${project.id}:\n${validation.errors.join("\n")}`);
  const projectPath = join(PROJECTS_ROOT, project.id, "project.json");
  await mkdir(dirname(projectPath), { recursive: true });
  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  const manifestPath = join(V2_ROOT, project.id, "MANIFEST.json");
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(runtimeManifest(project), null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const [lulu, brutus, npcs, birds, interactions] = await Promise.all([
    json<LegacyLuluManifest>("public/assets/characters/lulu/MANIFEST.json"),
    json<LegacyBrutusManifest>("public/assets/characters/brutus/MANIFEST.json"),
    json<LegacyNpcManifest>("public/assets/characters/npcs/MANIFEST.json"),
    json<LegacyBirdManifest>("public/assets/characters/birds/MANIFEST.json"),
    json<LegacyInteractions>("public/assets/characters/brutus/INTERACTIONS.json")
  ]);
  const projects = [
    await migrateLulu(lulu, brutus, interactions),
    await migrateBrutus(brutus, interactions),
    ...(await migrateNpcs(npcs)),
    ...(await migrateBirds(birds))
  ].sort((a, b) => a.id.localeCompare(b.id));
  await mkdir(PROJECTS_ROOT, { recursive: true });
  await mkdir(V2_ROOT, { recursive: true });
  for (const project of projects) await writeProject(project);
  const index: CharacterIndexV1 = {
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
  await writeFile(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  process.stdout.write(`Migrated ${projects.length} real character projects.\n`);
  process.stdout.write(`Index: ${rel(INDEX_PATH)}\n`);
}

void main();
