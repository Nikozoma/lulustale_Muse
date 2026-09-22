import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CharacterProjectV1,
  DirectionName,
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
const DERIVED_PREFIX =
  "character-production/projects/lulu/derived/canonical-anime-r6-locomotion-engineering-repair";
const IMPORT_PREFIX =
  "character-production/projects/lulu/imports/canonical-anime-r6-locomotion-engineering-repair";
const REPORT_PATH = path.join(
  PROJECT_ROOT,
  DERIVED_PREFIX,
  "targeted-repair-report.json"
);
const CANDIDATE_PATH = path.join(
  PROJECT_ROOT,
  DERIVED_PREFIX,
  "project-r6.candidate.json"
);
const PROFILE_DIRECTIONS: DirectionName[] = ["Left", "Right"];

type TargetedRepairReport = {
  contract: {
    walkCycleDistancePx: number;
    runCycleDistancePx: number;
    worldMovementSpeedChanged: boolean;
  };
  profiles: Array<{
    direction: "Left" | "Right";
    frames: Array<{
      index: number;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
  }>;
  outputs: {
    idle: { path: string; sha256: string };
    walk: { path: string; sha256: string };
    run: { path: string; sha256: string; changed: false };
  };
};

async function main(): Promise<void> {
  const project = JSON.parse(
    await readFile(PROJECT_PATH, "utf8")
  ) as CharacterProjectV1;
  const report = JSON.parse(
    await readFile(REPORT_PATH, "utf8")
  ) as TargetedRepairReport;
  if (![5, 6].includes(project.production.revision)) {
    throw new Error(
      `Targeted locomotion engineering repair requires revision 5 or an idempotent revision 6; found revision ${project.production.revision}.`
    );
  }
  if (
    report.contract.walkCycleDistancePx !== 96 ||
    report.contract.runCycleDistancePx !== 192 ||
    report.contract.worldMovementSpeedChanged
  ) {
    throw new Error("The targeted repair does not match the approved playback adjustment.");
  }
  const expectedRunBaseline =
    project.production.revision === 5 ? 160 : report.contract.runCycleDistancePx;
  if (
    project.actions.walk.cycleDistancePx !== 96 ||
    project.actions.run.cycleDistancePx !== expectedRunBaseline
  ) {
    throw new Error("The active locomotion cadence is not an expected revision-5/6 baseline.");
  }

  project.sources = [
    ...project.sources.filter((source) => !source.id.startsWith("lulu_r6_")),
    ...(await buildSources(report))
  ];
  project.identity = {
    ...project.identity,
    notes: [
      "Revision 6 is a focused locomotion-engineering repair: stronger exterior-fringe cleanup, coherent independently authored Left/Right gait rows, and corrected run cadence.",
      "Locked identity invariants remain short asymmetrical dark bob, violet eyes, black lace choker with silver pendant, black rose-accent outfit, opaque black leggings, and dark boots.",
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
    revision: 6,
    warnings: [
      "Revision 6 changes active idle and walk pixels; run pixels remain byte-identical while run cadence changes from 160px to 192px per cycle.",
      "Only Left and Right walk rows were re-authored; vertical and diagonal walk poses retain revision-5 silhouettes with stronger fringe cleanup only.",
      "Jump, dash, sit, pet, reaction, battle, and companion-interaction actions remain outside this repair.",
      "Canonical aesthetic and target-phone motion approval remain outstanding."
    ]
  };

  for (const actionId of ["idle", "walk"] as const) {
    const action = project.actions[actionId];
    const imagePath = `${DERIVED_PREFIX}/sheets/Lulu_${actionId}.png`;
    for (const direction of action.directions) {
      const frames = action.tracks[direction]?.frames ?? [];
      for (const frame of frames) frame.imagePath = imagePath;
    }
  }
  for (const direction of PROFILE_DIRECTIONS) {
    const profile = report.profiles.find(
      (candidate) => candidate.direction === direction
    );
    if (!profile) throw new Error(`Repair report is missing ${direction}.`);
    const frames = project.actions.walk.tracks[direction]?.frames ?? [];
    for (const frame of frames) {
      const repaired = profile.frames.find(
        (candidate) => candidate.index === frame.sourceFrame?.index
      );
      if (!repaired) {
        throw new Error(`Repair report is missing ${direction}/${frame.id}.`);
      }
      frame.bodyBounds = repaired.bounds;
    }
  }
  project.actions.run.cycleDistancePx = report.contract.runCycleDistancePx;
  authorLocomotionPhases(project, "walk", [
    { grounded: true, contact: "left" },
    { grounded: true, contact: "left" },
    { grounded: true, contact: "none" },
    { grounded: true, contact: "right" },
    { grounded: true, contact: "right" },
    { grounded: true, contact: "right" },
    { grounded: true, contact: "none" },
    { grounded: true, contact: "left" }
  ]);
  authorLocomotionPhases(project, "run", [
    { grounded: true, contact: "left" },
    { grounded: true, contact: "left" },
    { grounded: false, contact: "none" },
    { grounded: false, contact: "none" },
    { grounded: true, contact: "right" },
    { grounded: true, contact: "right" },
    { grounded: false, contact: "none" },
    { grounded: false, contact: "none" }
  ]);

  project.updatedAt = new Date().toISOString();
  await writeFile(
    CANDIDATE_PATH,
    `${JSON.stringify(project, null, 2)}\n`,
    "utf8"
  );
  console.log(path.relative(PROJECT_ROOT, CANDIDATE_PATH));
}

function authorLocomotionPhases(
  project: CharacterProjectV1,
  actionId: "walk" | "run",
  phases: Array<{
    grounded: boolean;
    contact: "left" | "right" | "both" | "none";
  }>
): void {
  const action = project.actions[actionId];
  for (const direction of action.directions) {
    const frames = action.tracks[direction]?.frames ?? [];
    if (frames.length !== phases.length) {
      throw new Error(
        `${actionId}/${direction} has ${frames.length} frames; expected ${phases.length}.`
      );
    }
    for (const [index, frame] of frames.entries()) {
      frame.grounded = phases[index].grounded;
      frame.contact = phases[index].contact;
    }
  }
}

async function buildSources(
  report: TargetedRepairReport
): Promise<SourceAsset[]> {
  const sources: SourceAsset[] = [];
  for (const direction of ["left", "right"] as const) {
    sources.push(
      await source(
        `lulu_r6_${direction}_walk_r5_reference`,
        "sheet",
        `${IMPORT_PREFIX}/${direction}-walk-r5-reference.png`,
        "approved",
        `Immutable revision-5 ${direction} profile row used as the targeted repair reference.`
      )
    );
    sources.push(
      await source(
        `lulu_r6_${direction}_walk_repair_source`,
        "sheet",
        `${IMPORT_PREFIX}/${direction}-walk-r6-authored-source.png`,
        "unreviewed",
        `Independently authored ${direction} profile contact/recoil/passing/high source; not a runtime file.`
      )
    );
  }
  sources.push({
    id: "lulu_r6_idle_derived_sheet",
    role: "sheet",
    path: report.outputs.idle.path,
    sha256: report.outputs.idle.sha256,
    immutable: true,
    approval: "approved",
    notes: "Revision-5 idle poses with stronger deterministic exterior-fringe cleanup."
  });
  sources.push({
    id: "lulu_r6_walk_derived_sheet",
    role: "sheet",
    path: report.outputs.walk.path,
    sha256: report.outputs.walk.sha256,
    immutable: true,
    approval: "approved",
    notes:
      "Revision-5 walk with stronger deterministic fringe cleanup and independently authored coherent Left/Right gait rows."
  });
  sources.push(
    await source(
      "lulu_r6_targeted_repair_report",
      "metadata",
      `${DERIVED_PREFIX}/targeted-repair-report.json`,
      "approved",
      "Diagnosis, hashes, cleanup counts, gait-phase bounds, preserved direction evidence, and run cadence synchronization."
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

function hash(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

await main();
