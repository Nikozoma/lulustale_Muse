import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
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
  "character-production/projects/lulu/derived/canonical-anime-r8-six-direction-down-run-repair";
const DERIVED_ROOT = path.join(PROJECT_ROOT, DERIVED_PREFIX);
const SHEET_ROOT = path.join(DERIVED_ROOT, "sheets");
const CANDIDATE_PATH = path.join(DERIVED_ROOT, "project-r8.candidate.json");
const REPORT_PATH = path.join(DERIVED_ROOT, "targeted-repair-report.json");
const CELL = 96;
const FRAME_COUNT = 8;
const TARGET_FRAME = 3;
const DONOR_FRAME = 7;
const LEG_SEAM_Y = 59;
const VISUAL_DIRECTIONS = [
  "Down",
  "Down-Left",
  "Up-Left",
  "Up",
  "Up-Right",
  "Down-Right"
] as const satisfies readonly DirectionName[];
const SOURCE_ROWS: Record<(typeof VISUAL_DIRECTIONS)[number], number> = {
  Down: 0,
  "Down-Left": 1,
  "Up-Left": 3,
  Up: 4,
  "Up-Right": 5,
  "Down-Right": 7
};
const RUNTIME_SHEETS = {
  idle:
    "character-production/projects/lulu/derived/canonical-anime-r6-locomotion-engineering-repair/sheets/Lulu_idle.png",
  walk:
    "character-production/projects/lulu/derived/canonical-anime-r6-locomotion-engineering-repair/sheets/Lulu_walk.png",
  run: "character-production/projects/lulu/history/revision-5-locomotion-baseline/run.png"
} as const;

type OutputId = keyof typeof RUNTIME_SHEETS;
type SheetResult = {
  id: OutputId;
  inputPath: string;
  inputSha256: string;
  outputPath: string;
  outputSha256: string;
  width: number;
  height: number;
  changedPixels: number;
};

async function main(): Promise<void> {
  const project = JSON.parse(
    await readFile(PROJECT_PATH, "utf8")
  ) as CharacterProjectV1;
  if (![7, 8].includes(project.production.revision)) {
    throw new Error(
      `The six-direction correction requires Lulu revision 7 or an idempotent revision 8; found revision ${project.production.revision}.`
    );
  }
  if (
    project.actions.walk.cycleDistancePx !== 96 ||
    project.actions.run.cycleDistancePx !== 192
  ) {
    throw new Error("The active Lulu locomotion distances are not the revision-7 baseline.");
  }

  await mkdir(SHEET_ROOT, { recursive: true });
  const outputs = await Promise.all(
    (Object.keys(RUNTIME_SHEETS) as OutputId[]).map((id) => buildSheet(id))
  );
  const report = {
    schema: "lulus-lulu-targeted-repair",
    version: 1,
    createdAt: new Date().toISOString(),
    scope: {
      visualDirections: VISUAL_DIRECTIONS,
      removedProductionDirections: ["Left", "Right"],
      calibrationTracks: ["walk/Down", "walk/Down-Left", "run/Down", "run/Down-Left"],
      remainingVisualDirectionsChanged: false,
      movementGeometryChanged: false,
      movementSpeedChanged: false,
      cycleDistanceChanged: false
    },
    downRunReconstruction: {
      displayedFrame: 4,
      sourceFrameIndex: TARGET_FRAME,
      donorDisplayedFrame: 8,
      donorFrameIndex: DONOR_FRAME,
      donorTransform: "horizontal reflection of the opposite flight phase",
      seamY: LEG_SEAM_Y,
      method:
        "Replace the malformed lower-body chain with the existing opposite half-cycle flight mechanics while preserving the target frame upper body, root, palette, and registration.",
      approval: "unreviewed_pending_in_game_visual_test"
    },
    outputs
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const id of Object.keys(RUNTIME_SHEETS) as OutputId[]) {
    const action = project.actions[id];
    action.directionMode = "explicit";
    action.directions = [...VISUAL_DIRECTIONS];
    delete action.tracks.Left;
    delete action.tracks.Right;
    const imagePath = `${DERIVED_PREFIX}/sheets/Lulu_${id}.png`;
    for (const [row, direction] of VISUAL_DIRECTIONS.entries()) {
      const track = action.tracks[direction];
      if (!track || track.frames.length !== (id === "idle" ? 4 : FRAME_COUNT)) {
        throw new Error(`${id}/${direction} is not a complete active track.`);
      }
      for (const [column, frame] of track.frames.entries()) {
        frame.imagePath = imagePath;
        frame.crop = {
          x: column * CELL,
          y: row * CELL,
          width: CELL,
          height: CELL
        };
      }
    }
  }

  project.sources = [
    ...project.sources.filter((source) => !source.id.startsWith("lulu_r8_")),
    ...(await buildSources(outputs))
  ];
  project.identity = {
    ...project.identity,
    notes: [
      "Revision 8 adopts six-direction Lulu presentation: Down, Down-Left, Up-Left, Up, Up-Right, and Down-Right. Pure profile rows are retained only in history and receive no further production work.",
      "The fourth displayed Down-run pose uses a mechanically reconstructed opposite-flight leg chain; canonical and in-game motion approval remain pending.",
      ...project.identity.notes.filter(
        (note) =>
          !note.startsWith("Revision 6") &&
          !note.startsWith("Revision 7")
      )
    ]
  };
  project.production = {
    ...project.production,
    revision: 8,
    status: "runtime_ready",
    warnings: [
      "Revision 8 is technically runtime-ready but visually unapproved pending the requested in-game calibration review.",
      "Idle, walk, and run now publish six explicit visual rows; pure Left/Right rows remain only in revision history.",
      "Only displayed frame 4 of the Down run row changes pose pixels. Walk Down, Walk Down-Left, Run Down-Left, and the four remaining visual directions retain revision-7 pixels.",
      "Non-locomotion action sheets retain their legacy source rows, but normal Lulu facing selection no longer produces pure Left or Right presentation.",
      "Canonical aesthetic and target-phone motion approval remain outstanding."
    ]
  };
  project.updatedAt = new Date().toISOString();

  await writeFile(
    CANDIDATE_PATH,
    `${JSON.stringify(project, null, 2)}\n`,
    "utf8"
  );
  console.log(path.relative(PROJECT_ROOT, CANDIDATE_PATH));
}

async function buildSheet(id: OutputId): Promise<SheetResult> {
  const inputPath = RUNTIME_SHEETS[id];
  const input = await readFile(path.join(PROJECT_ROOT, inputPath));
  const decoded = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    decoded.info.width !== CELL * (id === "idle" ? 4 : FRAME_COUNT) ||
    decoded.info.height !== CELL * 8 ||
    decoded.info.channels !== 4
  ) {
    throw new Error(`${id} is not the expected active 96px eight-row sheet.`);
  }

  const source = Buffer.from(decoded.data);
  let changedPixels = 0;
  if (id === "run") {
    changedPixels = reconstructDownRunFrame(source, decoded.info.width);
  }
  const output = packSixRows(source, decoded.info.width);
  const width = decoded.info.width;
  const height = CELL * VISUAL_DIRECTIONS.length;
  const encoded = await sharp(output, {
    raw: { width, height, channels: 4 }
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const outputPath = `${DERIVED_PREFIX}/sheets/Lulu_${id}.png`;
  await writeFile(path.join(PROJECT_ROOT, outputPath), encoded);
  return {
    id,
    inputPath,
    inputSha256: sha256(input),
    outputPath,
    outputSha256: sha256(encoded),
    width,
    height,
    changedPixels
  };
}

function reconstructDownRunFrame(sheet: Buffer, sheetWidth: number): number {
  let changedPixels = 0;
  for (let y = LEG_SEAM_Y; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const targetX = TARGET_FRAME * CELL + x;
      const donorX = DONOR_FRAME * CELL + (CELL - 1 - x);
      const targetOffset = (y * sheetWidth + targetX) * 4;
      const donorOffset = (y * sheetWidth + donorX) * 4;
      if (
        sheet[targetOffset] !== sheet[donorOffset] ||
        sheet[targetOffset + 1] !== sheet[donorOffset + 1] ||
        sheet[targetOffset + 2] !== sheet[donorOffset + 2] ||
        sheet[targetOffset + 3] !== sheet[donorOffset + 3]
      ) {
        changedPixels += 1;
      }
      sheet[targetOffset] = sheet[donorOffset];
      sheet[targetOffset + 1] = sheet[donorOffset + 1];
      sheet[targetOffset + 2] = sheet[donorOffset + 2];
      sheet[targetOffset + 3] = sheet[donorOffset + 3];
    }
  }
  if (changedPixels === 0) {
    throw new Error("The Down-run mechanical reconstruction did not change any pixels.");
  }
  return changedPixels;
}

function packSixRows(source: Buffer, sourceWidth: number): Buffer {
  const output = Buffer.alloc(
    sourceWidth * CELL * VISUAL_DIRECTIONS.length * 4
  );
  for (const [targetRow, direction] of VISUAL_DIRECTIONS.entries()) {
    const sourceRow = SOURCE_ROWS[direction];
    for (let y = 0; y < CELL; y += 1) {
      const sourceStart = ((sourceRow * CELL + y) * sourceWidth) * 4;
      const targetStart = ((targetRow * CELL + y) * sourceWidth) * 4;
      source.copy(
        output,
        targetStart,
        sourceStart,
        sourceStart + sourceWidth * 4
      );
    }
  }
  return output;
}

async function buildSources(outputs: SheetResult[]): Promise<SourceAsset[]> {
  const sources: SourceAsset[] = [];
  for (const output of outputs) {
    sources.push({
      id: `lulu_r8_${output.id}_six_direction_sheet`,
      role: "sheet",
      path: output.outputPath,
      sha256: output.outputSha256,
      immutable: true,
      approval: "approved",
      notes:
        output.id === "run"
          ? "Approved for controlled calibration publishing: six-row runtime source with the fourth displayed Down-run leg chain mechanically reconstructed from the opposite flight phase. Canonical visual approval remains pending."
          : `Approved for controlled calibration publishing: six-row ${output.id} source repacked from unchanged active revision-7 visual rows. Canonical visual approval remains pending.`
    });
  }
  const report = await readFile(REPORT_PATH);
  sources.push({
    id: "lulu_r8_targeted_repair_report",
    role: "metadata",
    path: `${DERIVED_PREFIX}/targeted-repair-report.json`,
    sha256: sha256(report),
    immutable: true,
    approval: "approved",
    notes:
      "Six-direction mapping, calibration scope, source/output hashes, and Down-run reconstruction provenance."
  });
  return sources;
}

function sha256(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

await main();
