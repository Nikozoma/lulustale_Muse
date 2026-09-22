import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CharacterAction,
  CharacterProjectV1,
  DirectionName,
  FrameReference,
  SourceAsset
} from "../src/types";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const PROJECT_PATH = path.join(PROJECT_ROOT, "character-production", "projects", "lulu", "project.json");
const REVISION_ROOT = path.join(
  PROJECT_ROOT,
  "character-production",
  "projects",
  "lulu",
  "derived",
  "canonical-anime-r3"
);
const REPORT_PATH = path.join(REVISION_ROOT, "production-report.json");
const CANDIDATE_PATH = path.join(REVISION_ROOT, "project-r3.candidate.json");
const IMPORT_PREFIX = "character-production/projects/lulu/imports/canonical-anime-r3";
const DERIVED_PREFIX = "character-production/projects/lulu/derived/canonical-anime-r3";

const DIRECTIONS: DirectionName[] = [
  "Down",
  "Down-Left",
  "Left",
  "Up-Left",
  "Up",
  "Up-Right",
  "Right",
  "Down-Right"
];

type ProductionReport = {
  actions: Array<{
    action: "idle" | "walk" | "run";
    output: string;
    sha256: string;
    frames: Array<{
      direction: DirectionName;
      index: number;
      packedBounds: { x: number; y: number; width: number; height: number };
    }>;
  }>;
};

const ACTION_SETTINGS = {
  idle: {
    displayName: "Idle",
    category: "idle",
    frames: 4,
    durations: [900, 650, 100, 850],
    cycleDistancePx: undefined
  },
  walk: {
    displayName: "Walk",
    category: "locomotion",
    frames: 8,
    durations: [95, 95, 95, 95, 95, 95, 95, 95],
    cycleDistancePx: 72
  },
  run: {
    displayName: "Run",
    category: "locomotion",
    frames: 8,
    durations: [70, 70, 70, 70, 70, 70, 70, 70],
    cycleDistancePx: 96
  }
} as const;

async function main(): Promise<void> {
  const project = JSON.parse(await readFile(PROJECT_PATH, "utf8")) as CharacterProjectV1;
  const report = JSON.parse(await readFile(REPORT_PATH, "utf8")) as ProductionReport;

  const revisionSources = await buildRevisionSources(report);
  project.sources = [
    ...project.sources.filter(
      (source) => !source.path.startsWith(IMPORT_PREFIX) && !source.path.startsWith(DERIVED_PREFIX)
    ),
    ...revisionSources
  ];
  project.identity = {
    canonicalApproval: "unapproved",
    locked: true,
    notes: [
      "Revision 3 playable sprite baseline is derived from the user-supplied anime reference approved as visual inspiration.",
      "Locked identity invariants: short asymmetrical dark bob, violet eyes, black lace choker with silver pendant, black rose-accent outfit, opaque black leggings, and dark boots.",
      "Canonical sprite approval remains pending user gameplay and target-phone motion review; no approved portrait set exists."
    ],
    paletteReferences: [
      `${IMPORT_PREFIX}/approved-visual-reference.png`,
      `${DERIVED_PREFIX}/sheets/Lulu_idle.png`
    ]
  };
  project.production = {
    ...project.production,
    status: "runtime_ready",
    revision: 3,
    warnings: [
      "Revision 3 replaces the live idle, walk, and run baseline only.",
      "Jump, dash, sit, pet, reaction, battle, and companion-interaction actions still use revision 2 visuals and will visibly change design when invoked.",
      "Canonical aesthetic and target-phone motion approval remain outstanding.",
      "No approved runtime portrait set is available."
    ]
  };
  project.presentation = {
    ...project.presentation,
    targetSilhouette: { width: 46, height: 68 },
    resampling: "nearest"
  };

  for (const actionId of ["idle", "walk", "run"] as const) {
    const actionReport = report.actions.find((candidate) => candidate.action === actionId);
    if (!actionReport) throw new Error(`Production report is missing ${actionId}.`);
    project.actions[actionId] = buildAction(actionId, actionReport);
  }

  project.updatedAt = new Date().toISOString();
  await writeFile(CANDIDATE_PATH, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  console.log(path.relative(PROJECT_ROOT, CANDIDATE_PATH));
}

async function buildRevisionSources(report: ProductionReport): Promise<SourceAsset[]> {
  const sources: SourceAsset[] = [
    await source(
      "lulu_r3_approved_reference",
      "reference",
      `${IMPORT_PREFIX}/approved-visual-reference.png`,
      "approved",
      "User-supplied anime image approved as visual inspiration; preserved unchanged as provenance."
    )
  ];
  for (const action of ["idle", "walk", "run"] as const) {
    for (const direction of DIRECTIONS) {
      const slug = direction.toLowerCase().replaceAll(" ", "-");
      sources.push(
        await source(
          `lulu_r3_${action}_${slug}_generation`,
          "frame",
          `${IMPORT_PREFIX}/${action}-${slug}.png`,
          "unreviewed",
          `Immutable built-in image-generation strip for authored ${action}/${direction}; not a runtime file.`
        )
      );
    }
  }
  for (const action of report.actions) {
    sources.push({
      id: `lulu_r3_${action.action}_derived_sheet`,
      role: "sheet",
      path: action.output,
      sha256: action.sha256,
      immutable: true,
      approval: "approved",
      notes: "Deterministically keyed, binary-alpha, nearest-neighbor production derivative selected for runtime staging."
    });
  }
  sources.push(
    await source(
      "lulu_r3_production_report",
      "metadata",
      `${DERIVED_PREFIX}/production-report.json`,
      "approved",
      "Deterministic source hashes, frame bounds, alpha counts, sheet dimensions, and output hashes."
    )
  );
  return sources;
}

async function source(
  id: string,
  role: SourceAsset["role"],
  relativePath: string,
  approval: SourceAsset["approval"],
  notes: string
): Promise<SourceAsset> {
  return {
    id,
    role,
    path: relativePath,
    sha256: hash(await readFile(path.join(PROJECT_ROOT, relativePath))),
    immutable: true,
    approval,
    notes
  };
}

function buildAction(
  actionId: keyof typeof ACTION_SETTINGS,
  report: ProductionReport["actions"][number]
): CharacterAction {
  const settings = ACTION_SETTINGS[actionId];
  const sheetPath = `${DERIVED_PREFIX}/sheets/Lulu_${actionId}.png`;
  const tracks: CharacterAction["tracks"] = {};

  for (const [row, direction] of DIRECTIONS.entries()) {
    const frames: FrameReference[] = [];
    for (let index = 0; index < settings.frames; index += 1) {
      const frameReport = report.frames.find(
        (candidate) => candidate.direction === direction && candidate.index === index
      );
      if (!frameReport) throw new Error(`${actionId}/${direction}/${index} is missing from production report.`);
      const contact =
        actionId === "idle" ? "both" : index === 0 ? "left" : index === 4 ? "right" : "none";
      const contactEvent =
        actionId === "idle" || contact === "none" || contact === "both"
          ? []
          : [{ id: `${contact}_foot_contact`, type: "contact" as const, payload: contact }];
      const grounded = actionId !== "run" || (index !== 3 && index !== 7);
      frames.push({
        id: `${direction.toLowerCase().replaceAll("-", "_")}_${index}`,
        imagePath: sheetPath,
        crop: { x: index * 96, y: row * 96, width: 96, height: 96 },
        durationMs: settings.durations[index],
        root: { x: 48, y: 88 },
        visualOffset: { x: 0, y: 0 },
        bodyBounds: frameReport.packedBounds,
        grounded,
        contact,
        anchors: [
          {
            id: "root",
            role: "root",
            point: { x: 48, y: 88 },
            drawOrder: "body"
          }
        ],
        events: contactEvent,
        sourceFrame: { direction, index }
      });
    }
    tracks[direction] = { direction, frames };
  }

  return {
    id: actionId,
    displayName: settings.displayName,
    category: settings.category,
    playback: "loop",
    directionMode: "eight",
    directions: DIRECTIONS,
    cell: { width: 96, height: 96 },
    loop: { start: 0, end: settings.frames - 1 },
    entryFrame: 0,
    stopPolicy: "idle_entry",
    ...(settings.cycleDistancePx ? { cycleDistancePx: settings.cycleDistancePx } : {}),
    tracks
  };
}

function hash(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

await main();
