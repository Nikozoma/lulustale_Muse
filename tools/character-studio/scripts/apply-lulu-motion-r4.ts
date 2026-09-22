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
const PROJECT_PATH = path.join(
  PROJECT_ROOT,
  "character-production",
  "projects",
  "lulu",
  "project.json"
);
const REVISION_ROOT = path.join(
  PROJECT_ROOT,
  "character-production",
  "projects",
  "lulu",
  "derived",
  "canonical-anime-r4-motion-repair"
);
const REPORT_PATH = path.join(REVISION_ROOT, "motion-repair-report.json");
const CANDIDATE_PATH = path.join(REVISION_ROOT, "project-r4.candidate.json");
const DERIVED_PREFIX =
  "character-production/projects/lulu/derived/canonical-anime-r4-motion-repair";

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

const ACTION_SETTINGS = {
  idle: {
    displayName: "Idle",
    category: "idle",
    frames: 4,
    durations: [900, 700, 120, 900],
    cycleDistancePx: undefined
  },
  walk: {
    displayName: "Walk",
    category: "locomotion",
    frames: 8,
    durations: [125, 125, 125, 125, 125, 125, 125, 125],
    cycleDistancePx: 96
  },
  run: {
    displayName: "Run",
    category: "locomotion",
    frames: 8,
    durations: [85, 85, 85, 85, 85, 85, 85, 85],
    cycleDistancePx: 160
  }
} as const;

type MotionRepairReport = {
  actions: Array<{
    action: "idle" | "walk" | "run";
    input: string;
    inputSha256: string;
    output: string;
    outputSha256: string;
    cycleDistancePx?: number;
    frames: Array<{
      direction: DirectionName;
      index: number;
      packedBounds: { x: number; y: number; width: number; height: number };
      packedUpperBodyCenterX: number;
      groundY: number;
    }>;
  }>;
};

async function main(): Promise<void> {
  const project = JSON.parse(
    await readFile(PROJECT_PATH, "utf8")
  ) as CharacterProjectV1;
  const report = JSON.parse(
    await readFile(REPORT_PATH, "utf8")
  ) as MotionRepairReport;
  if (project.production.revision !== 3 && project.production.revision !== 4) {
    throw new Error(
      `Lulu motion repair requires revision 3 or 4 as its baseline; found revision ${project.production.revision}.`
    );
  }

  project.sources = [
    ...project.sources.filter((source) => !source.id.startsWith("lulu_r4_")),
    ...(await buildRevisionSources(report))
  ];
  project.identity = {
    ...project.identity,
    notes: [
      "Revision 4 repairs the active revision-3 idle, walk, and run motion while preserving its approved inspiration direction.",
      "Locked identity invariants: short asymmetrical dark bob, violet eyes, black lace choker with silver pendant, black rose-accent outfit, opaque black leggings, and dark boots.",
      "Canonical sprite approval remains pending user gameplay and target-phone motion review; no approved portrait set exists."
    ],
    paletteReferences: [
      "character-production/projects/lulu/imports/canonical-anime-r3/approved-visual-reference.png",
      `${DERIVED_PREFIX}/sheets/Lulu_idle.png`
    ]
  };
  project.production = {
    ...project.production,
    status: "runtime_ready",
    revision: 4,
    warnings: [
      "Revision 4 repairs only the live idle, walk, and run motion baseline.",
      "Jump, dash, sit, pet, reaction, battle, and companion-interaction actions still use revision 2 visuals and will visibly change design when invoked.",
      "Canonical aesthetic and target-phone motion approval remain outstanding.",
      "No approved runtime portrait set is available."
    ]
  };

  for (const actionId of ["idle", "walk", "run"] as const) {
    const actionReport = report.actions.find(
      (candidate) => candidate.action === actionId
    );
    if (!actionReport) {
      throw new Error(`Motion repair report is missing ${actionId}.`);
    }
    if (actionReport.cycleDistancePx !== ACTION_SETTINGS[actionId].cycleDistancePx) {
      throw new Error(`${actionId} report and authored cadence disagree.`);
    }
    project.actions[actionId] = buildAction(actionId, actionReport);
  }

  project.updatedAt = new Date().toISOString();
  await writeFile(
    CANDIDATE_PATH,
    `${JSON.stringify(project, null, 2)}\n`,
    "utf8"
  );
  console.log(path.relative(PROJECT_ROOT, CANDIDATE_PATH));
}

async function buildRevisionSources(
  report: MotionRepairReport
): Promise<SourceAsset[]> {
  const sources: SourceAsset[] = [];
  for (const action of report.actions) {
    sources.push({
      id: `lulu_r4_${action.action}_repair_source`,
      role: "sheet",
      path: action.input,
      sha256: action.inputSha256,
      immutable: true,
      approval: "unreviewed",
      notes:
        "Identity-preserving built-in image edit selected as the immutable motion-repair source; not a runtime file."
    });
    sources.push({
      id: `lulu_r4_${action.action}_derived_sheet`,
      role: "sheet",
      path: action.output,
      sha256: action.outputSha256,
      immutable: true,
      approval: "approved",
      notes:
        "Deterministically extracted, registered, cleaned, binary-alpha motion repair selected for active runtime staging."
    });
  }
  const reportPath = `${DERIVED_PREFIX}/motion-repair-report.json`;
  sources.push({
    id: "lulu_r4_motion_repair_report",
    role: "metadata",
    path: reportPath,
    sha256: hash(await readFile(path.join(PROJECT_ROOT, reportPath))),
    immutable: true,
    approval: "approved",
    notes:
      "Source/output hashes, fixed-scale registration, background cleanup, bounds, grounding, and cadence for the focused motion repair."
  });
  return sources;
}

function buildAction(
  actionId: keyof typeof ACTION_SETTINGS,
  report: MotionRepairReport["actions"][number]
): CharacterAction {
  const settings = ACTION_SETTINGS[actionId];
  const sheetPath = `${DERIVED_PREFIX}/sheets/Lulu_${actionId}.png`;
  const tracks: CharacterAction["tracks"] = {};

  for (const [row, direction] of DIRECTIONS.entries()) {
    const frames: FrameReference[] = [];
    for (let index = 0; index < settings.frames; index += 1) {
      const frameReport = report.frames.find(
        (candidate) =>
          candidate.direction === direction && candidate.index === index
      );
      if (!frameReport) {
        throw new Error(
          `${actionId}/${direction}/${index} is missing from the motion repair report.`
        );
      }
      const contact =
        actionId === "idle"
          ? "both"
          : index === 0
            ? "left"
            : index === 4
              ? "right"
              : "none";
      const grounded =
        actionId !== "run" || (index !== 3 && index !== 7);
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
        events:
          contact === "left" || contact === "right"
            ? [
                {
                  id: `${contact}_foot_contact`,
                  type: "contact",
                  payload: contact
                }
              ]
            : [],
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
    ...(settings.cycleDistancePx
      ? { cycleDistancePx: settings.cycleDistancePx }
      : {}),
    tracks
  };
}

function hash(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

await main();
