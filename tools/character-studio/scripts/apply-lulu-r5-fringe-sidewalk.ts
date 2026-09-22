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
  "character-production/projects/lulu/derived/canonical-anime-r5-fringe-sidewalk-repair";
const IMPORT_PREFIX =
  "character-production/projects/lulu/imports/canonical-anime-r5-fringe-sidewalk-repair";
const REPORT_PATH = path.join(
  PROJECT_ROOT,
  DERIVED_PREFIX,
  "targeted-repair-report.json"
);
const CANDIDATE_PATH = path.join(
  PROJECT_ROOT,
  DERIVED_PREFIX,
  "project-r5.candidate.json"
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
  if (project.production.revision !== 4) {
    throw new Error(
      `Targeted fringe/side-walk repair requires revision 4; found revision ${project.production.revision}.`
    );
  }
  if (
    report.contract.walkCycleDistancePx !== 96 ||
    report.contract.runCycleDistancePx !== 160 ||
    report.contract.worldMovementSpeedChanged
  ) {
    throw new Error("The targeted repair changed a locked playback contract.");
  }
  if (
    project.actions.walk.cycleDistancePx !== 96 ||
    project.actions.run.cycleDistancePx !== 160
  ) {
    throw new Error("The active revision-4 cadence is not the expected baseline.");
  }

  project.sources = [
    ...project.sources.filter((source) => !source.id.startsWith("lulu_r5_")),
    ...(await buildSources(report))
  ];
  project.identity = {
    ...project.identity,
    notes: [
      "Revision 5 is a narrow revision-4 repair: bright exterior fringe cleanup plus independently authored Left and Right walk gait rows.",
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
    revision: 5,
    warnings: [
      "Revision 5 changes only active idle and walk pixels; run pixels and cadence are preserved from revision 4.",
      "Only Left and Right walk rows were re-authored; all four diagonal rows retain revision-4 poses with fringe cleanup only.",
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

  project.updatedAt = new Date().toISOString();
  await writeFile(
    CANDIDATE_PATH,
    `${JSON.stringify(project, null, 2)}\n`,
    "utf8"
  );
  console.log(path.relative(PROJECT_ROOT, CANDIDATE_PATH));
}

async function buildSources(
  report: TargetedRepairReport
): Promise<SourceAsset[]> {
  const sources: SourceAsset[] = [];
  for (const direction of ["left", "right"] as const) {
    sources.push(
      await source(
        `lulu_r5_${direction}_walk_r4_reference`,
        "sheet",
        `${IMPORT_PREFIX}/${direction}-walk-r4-reference.png`,
        "approved",
        `Immutable revision-4 ${direction} profile row used as the targeted repair reference.`
      )
    );
    sources.push(
      await source(
        `lulu_r5_${direction}_walk_repair_source`,
        "sheet",
        `${IMPORT_PREFIX}/${direction}-walk-repaired-source.png`,
        "unreviewed",
        `Independently authored ${direction} profile contact/recoil/passing/reach source; not a runtime file.`
      )
    );
  }
  sources.push({
    id: "lulu_r5_idle_derived_sheet",
    role: "sheet",
    path: report.outputs.idle.path,
    sha256: report.outputs.idle.sha256,
    immutable: true,
    approval: "approved",
    notes: "Revision-4 idle poses with deterministic bright-exterior fringe cleanup."
  });
  sources.push({
    id: "lulu_r5_walk_derived_sheet",
    role: "sheet",
    path: report.outputs.walk.path,
    sha256: report.outputs.walk.sha256,
    immutable: true,
    approval: "approved",
    notes:
      "Revision-4 walk with deterministic fringe cleanup and independently authored Left/Right gait rows."
  });
  sources.push(
    await source(
      "lulu_r5_targeted_repair_report",
      "metadata",
      `${DERIVED_PREFIX}/targeted-repair-report.json`,
      "approved",
      "Hashes, cleanup counts, profile bounds, locked cadence, preserved diagonals, and preserved run evidence."
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
