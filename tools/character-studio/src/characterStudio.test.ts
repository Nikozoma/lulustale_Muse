import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validateCharacterProject } from "./schema";
import type { CharacterIndexV1, CharacterManifestV2, CharacterProjectV1 } from "./types";
import { createCharacterStudioServer } from "../server";

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf8")) as T;
}

function opaqueComponentCount(cell: Buffer): number {
  const visited = new Uint8Array(96 * 96);
  let components = 0;
  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || cell[start * 4 + 3] === 0) continue;
    components += 1;
    const queue = [start];
    visited[start] = 1;
    while (queue.length > 0) {
      const current = queue.pop()!;
      const x = current % 96;
      const y = Math.floor(current / 96);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextY < 0 || nextX >= 96 || nextY >= 96) continue;
          const next = nextY * 96 + nextX;
          if (visited[next] || cell[next * 4 + 3] === 0) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
  }
  return components;
}

function brightExteriorCount(cell: Buffer): number {
  let count = 0;
  for (let y = 0; y < 96; y += 1) {
    for (let x = 0; x < 96; x += 1) {
      const offset = (y * 96 + x) * 4;
      if (cell[offset + 3] === 0) continue;
      let nearTransparent = false;
      for (let dy = -2; dy <= 2 && !nearTransparent; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nextX = x + dx;
          const nextY = y + dy;
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= 96 ||
            nextY >= 96 ||
            cell[(nextY * 96 + nextX) * 4 + 3] === 0
          ) {
            nearTransparent = true;
            break;
          }
        }
      }
      if (!nearTransparent) continue;
      const red = cell[offset];
      const green = cell[offset + 1];
      const blue = cell[offset + 2];
      const average = (red + green + blue) / 3;
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (average >= 100 && chroma <= 38) count += 1;
    }
  }
  return count;
}

function alphaMaskHash(cell: Buffer): string {
  const alpha = Buffer.alloc(96 * 96);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    alpha[pixel] = cell[pixel * 4 + 3];
  }
  return createHash("sha256").update(alpha).digest("hex");
}

function extractCell(data: Buffer, sheetWidth: number, row: number, column: number): Buffer {
  const cell = Buffer.alloc(96 * 96 * 4);
  for (let y = 0; y < 96; y += 1) {
    const sourceStart = (((row * 96 + y) * sheetWidth) + column * 96) * 4;
    data.copy(cell, y * 96 * 4, sourceStart, sourceStart + 96 * 4);
  }
  return cell;
}

describe("Character Studio real-asset migration", () => {
  it("indexes every migrated current character project", () => {
    const index = readJson<CharacterIndexV1>("public/assets/characters/INDEX.json");
    expect(index.characters).toHaveLength(17);
    expect(index.characters.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["lulu", "brutus", "homeless_man_day", "primary_fries_thief"])
    );
  });

  it("validates all 17 migrated projects against the production schema", () => {
    const index = readJson<CharacterIndexV1>("public/assets/characters/INDEX.json");
    for (const entry of index.characters) {
      const project = readJson<CharacterProjectV1>(`character-production/projects/${entry.id}/project.json`);
      expect(validateCharacterProject(project).errors, entry.id).toEqual([]);
    }
  });

  it.each(["lulu", "brutus", "homeless_man_day", "primary_fries_thief"])(
    "validates the migrated %s project and generated runtime manifest",
    (characterId) => {
      const project = readJson<CharacterProjectV1>(`character-production/projects/${characterId}/project.json`);
      const manifest = readJson<CharacterManifestV2>(`public/assets/characters/v2/${characterId}/MANIFEST.json`);
      expect(validateCharacterProject(project).errors).toEqual([]);
      expect(manifest.id).toBe(project.id);
      expect(Object.keys(manifest.actions)).toEqual(Object.keys(project.actions));
    }
  );

  it("publishes the revision 8 six-direction calibration without faking canonical approval", () => {
    const lulu = readJson<CharacterProjectV1>("character-production/projects/lulu/project.json");
    const manifest = readJson<CharacterManifestV2>("public/assets/characters/v2/lulu/MANIFEST.json");
    const runSource = lulu.sources.find((source) => source.id === "lulu_r8_run_six_direction_sheet");
    expect(lulu.production.revision).toBe(8);
    expect(lulu.identity).toMatchObject({ canonicalApproval: "unapproved", locked: true });
    expect(runSource).toMatchObject(
      {
        approval: "approved",
        path: "character-production/projects/lulu/derived/canonical-anime-r8-six-direction-down-run-repair/sheets/Lulu_run.png"
      }
    );
    expect(runSource?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(lulu.actions.walk.cycleDistancePx).toBe(96);
    expect(lulu.actions.run.cycleDistancePx).toBe(192);
    expect(lulu.actions.run.tracks.Left).toBeUndefined();
    expect(lulu.actions.run.tracks.Right).toBeUndefined();
    expect(lulu.actions.idle.runtimeHref).toBeUndefined();
    expect(manifest.sourceProject.revision).toBe(8);
    expect(manifest.actions.idle.sheet).toBe("/assets/characters/generated/lulu/sheets/idle.png");
    expect(manifest.actions.walk.sheet).toBe("/assets/characters/generated/lulu/sheets/walk.png");
    expect(manifest.actions.run.sheet).toBe("/assets/characters/generated/lulu/sheets/run.png");
  });

  it("packs six clean visual rows and reconstructs only the malformed Down-run lower body", async () => {
    const lulu = readJson<CharacterProjectV1>("character-production/projects/lulu/project.json");
    const manifest = readJson<CharacterManifestV2>("public/assets/characters/v2/lulu/MANIFEST.json");
    const repairReport = readJson<{
      scope: {
        visualDirections: string[];
        calibrationTracks: string[];
        movementGeometryChanged: boolean;
        movementSpeedChanged: boolean;
        cycleDistanceChanged: boolean;
      };
      downRunReconstruction: {
        displayedFrame: number;
        donorDisplayedFrame: number;
        seamY: number;
        approval: string;
      };
      outputs: Array<{
        id: string;
        outputPath: string;
        outputSha256: string;
        changedPixels: number;
      }>;
    }>(
      "character-production/projects/lulu/derived/canonical-anime-r8-six-direction-down-run-repair/targeted-repair-report.json"
    );
    const directions = [
      "Down",
      "Down-Left",
      "Up-Left",
      "Up",
      "Up-Right",
      "Down-Right"
    ];
    const expected = {
      idle: { frames: 4, width: 384, cycleDistancePx: undefined },
      walk: { frames: 8, width: 768, cycleDistancePx: 96 },
      run: { frames: 8, width: 768, cycleDistancePx: 192 }
    } as const;

    for (const [actionId, contract] of Object.entries(expected)) {
      const action = lulu.actions[actionId];
      const runtimeAction = manifest.actions[actionId];
      expect(action.directionMode).toBe("explicit");
      expect(action.directions).toEqual(directions);
      expect(runtimeAction.directions).toEqual(directions);
      expect(runtimeAction.framesPerDirection).toBe(contract.frames);
      expect(runtimeAction.cycleDistancePx).toBe(contract.cycleDistancePx);
      const runtimePath = resolve(
        process.cwd(),
        "public",
        runtimeAction.sheet.replace(/^\/assets\//, "assets/")
      );
      const { data, info } = await sharp(runtimePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([contract.width, 576, 4]);
      let partialAlphaPixels = 0;
      let hiddenRgbPixels = 0;
      let greenContaminationPixels = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        const alpha = data[offset + 3];
        if (alpha > 0 && alpha < 255) partialAlphaPixels += 1;
        if (alpha === 0 && (data[offset] !== 0 || data[offset + 1] !== 0 || data[offset + 2] !== 0)) {
          hiddenRgbPixels += 1;
        }
        if (
          alpha > 0 &&
          data[offset + 1] >= 40 &&
          data[offset + 1] - data[offset] > 8 &&
          data[offset + 1] - data[offset + 2] > 8
        ) {
          greenContaminationPixels += 1;
        }
      }
      expect(partialAlphaPixels, `${actionId} partial alpha`).toBe(0);
      expect(hiddenRgbPixels, `${actionId} hidden RGB`).toBe(0);
      expect(greenContaminationPixels, `${actionId} green contamination`).toBe(0);

      for (const [row, direction] of action.directions.entries()) {
        const frames = action.tracks[direction]?.frames ?? [];
        expect(frames).toHaveLength(contract.frames);
        const hashes = new Set<string>();
        for (const [column, frame] of frames.entries()) {
          expect(frame.root).toEqual({ x: 48, y: 88 });
          expect(frame.bodyBounds).toBeDefined();
          expect(frame.bodyBounds!.x).toBeGreaterThanOrEqual(0);
          expect(frame.bodyBounds!.y).toBeGreaterThanOrEqual(0);
          expect(frame.bodyBounds!.x + frame.bodyBounds!.width).toBeLessThanOrEqual(96);
          expect(frame.bodyBounds!.y + frame.bodyBounds!.height).toBeLessThanOrEqual(96);
          const cell = extractCell(data, info.width, row, column);
          expect(opaqueComponentCount(cell), `${actionId}/${direction}/${column} debris`).toBe(1);
          hashes.add(createHash("sha256").update(cell).digest("hex"));
        }
        expect(hashes.size, `${actionId}/${direction}`).toBe(contract.frames);
      }

      const reportOutput = repairReport.outputs.find((output) => output.id === actionId);
      expect(reportOutput?.outputSha256).toBe(
        createHash("sha256").update(readFileSync(runtimePath)).digest("hex")
      );
    }

    expect(repairReport.scope).toMatchObject({
      visualDirections: directions,
      calibrationTracks: ["walk/Down", "walk/Down-Left", "run/Down", "run/Down-Left"],
      movementGeometryChanged: false,
      movementSpeedChanged: false,
      cycleDistanceChanged: false
    });
    expect(repairReport.downRunReconstruction).toMatchObject({
      displayedFrame: 4,
      donorDisplayedFrame: 8,
      seamY: 59,
      approval: "unreviewed_pending_in_game_visual_test"
    });
    expect(repairReport.outputs.find((output) => output.id === "run")?.changedPixels).toBeGreaterThan(0);

    const activeRun = await sharp("public/assets/characters/generated/lulu/sheets/run.png")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const baselineRun = await sharp(
      "character-production/projects/lulu/history/revision-5-locomotion-baseline/run.png"
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let y = 0; y < 96; y += 1) {
      for (let x = 0; x < 96; x += 1) {
        const target = (y * activeRun.info.width + 3 * 96 + x) * 4;
        if (y < repairReport.downRunReconstruction.seamY) {
          const baseline = (y * baselineRun.info.width + 3 * 96 + x) * 4;
          expect(
            activeRun.data.subarray(target, target + 4),
            `Down run displayed frame 4 upper body ${x},${y}`
          ).toEqual(baselineRun.data.subarray(baseline, baseline + 4));
        } else {
          const donor = (y * activeRun.info.width + 7 * 96 + (95 - x)) * 4;
          expect(
            activeRun.data.subarray(target, target + 4),
            `Down run displayed frame 4 reconstructed leg ${x},${y}`
          ).toEqual(activeRun.data.subarray(donor, donor + 4));
        }
      }
    }

    const expectedContacts = ["left", "left", "none", "right", "right", "right", "none", "left"];
    for (const direction of lulu.actions.walk.directions) {
      const frames = lulu.actions.walk.tracks[direction]?.frames ?? [];
      expect(frames.map((frame) => frame.contact), `walk/${direction} phases`).toEqual(expectedContacts);
      expect(frames.every((frame) => frame.grounded), `walk/${direction} grounding`).toBe(true);
    }
    for (const direction of lulu.actions.run.directions) {
      const frames = lulu.actions.run.tracks[direction]?.frames ?? [];
      expect(frames.map((frame) => frame.grounded), `run/${direction} grounding`).toEqual([
        true,
        true,
        false,
        false,
        true,
        true,
        false,
        false
      ]);
    }
  });

  it("keeps the historical Brutus filename defect flagged as rejected reference evidence", () => {
    const brutus = readJson<CharacterProjectV1>("character-production/projects/brutus/project.json");
    expect(brutus.sources.find((source) => source.id === "historical_brutus_walk_mislabeled")).toMatchObject({
      approval: "rejected",
      path: "public/assets/character-assets/animals/brutus/walk_8dir.png"
    });
    expect(brutus.sources.find((source) => source.id === "historical_brutus_sit_mislabeled")).toMatchObject({
      approval: "rejected",
      path: "public/assets/character-assets/animals/brutus/sit_8dir.png"
    });
  });

  it("keeps interaction anchors in cell coordinates and authors the real carry mouth attachment", () => {
    for (const characterId of ["lulu", "brutus"]) {
      const project = readJson<CharacterProjectV1>(`character-production/projects/${characterId}/project.json`);
      for (const action of Object.values(project.actions)) {
        for (const direction of action.directions) {
          for (const frame of action.tracks[direction]?.frames ?? []) {
            for (const anchor of frame.anchors) {
              expect(anchor.point.x, `${characterId}/${action.id}/${direction}/${anchor.id}`).toBeGreaterThanOrEqual(0);
              expect(anchor.point.y, `${characterId}/${action.id}/${direction}/${anchor.id}`).toBeGreaterThanOrEqual(0);
              expect(anchor.point.x, `${characterId}/${action.id}/${direction}/${anchor.id}`).toBeLessThanOrEqual(action.cell.width);
              expect(anchor.point.y, `${characterId}/${action.id}/${direction}/${anchor.id}`).toBeLessThanOrEqual(action.cell.height);
            }
          }
        }
      }
    }
    const brutus = readJson<CharacterProjectV1>("character-production/projects/brutus/project.json");
    for (const direction of brutus.actions.carry_pose.directions) {
      expect(
        brutus.actions.carry_pose.tracks[direction]?.frames.every((frame) =>
          frame.anchors.some((anchor) => anchor.id === "brutus_mouth_anchor_local")
        )
      ).toBe(true);
    }
  });

  it("exposes preview-only secondary action, direction, frame, scale, and runtime offset controls", () => {
    const source = readFileSync(resolve(process.cwd(), "tools/character-studio/src/main.ts"), "utf8");
    for (const control of [
      "interactionAction",
      "interactionDirection",
      "interactionFrame",
      "interactionScale",
      "interactionOffsetX",
      "interactionOffsetY"
    ]) {
      expect(source).toContain(`id="${control}"`);
    }
  });

  it("keeps the real combined worker board out of runtime actions despite its regular outer grid", async () => {
    const worker = await sharp(
      resolve(
        process.cwd(),
        "public/assets/character-assets/references/not_runtime_ready/cjr_workers/01_worker_female_1_combined_idle_walk.png"
      )
    ).metadata();
    expect([worker.width, worker.height]).toEqual([888, 1776]);
    const employee = readJson<CharacterProjectV1>("character-production/projects/charles_jr_employee/project.json");
    expect(employee.sources.find((source) => source.id === "historical_worker_1")?.approval).toBe("rejected");
    expect(Object.values(employee.actions).some((action) =>
      Object.values(action.tracks).some((track) =>
        track?.frames.some((frame) => frame.imagePath.includes("references/not_runtime_ready/cjr_workers"))
      )
    )).toBe(false);
  });

  it("serves the confined API, validates every real project source, and stages current Lulu with parity", async () => {
    const service = await createCharacterStudioServer(0);
    let stageId = "";
    try {
      const bootstrap = await fetch(`${service.url}/api/bootstrap`).then((response) => response.json()) as {
        projects: CharacterProjectV1[];
        directions: string[];
      };
      expect(bootstrap.projects).toHaveLength(17);
      expect(bootstrap.directions).toHaveLength(8);
      const shell = await fetch(service.url).then((response) => response.text());
      expect(shell).toContain("Lulu's Tale Character Studio");
      const inspection = await fetch(`${service.url}/api/image/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "public/assets/characters/generated/lulu/sheets/idle.png" })
      }).then((response) => response.json()) as {
        inspection: { width: number; height: number; channels: number; alpha: string; hiddenRgbPixels: number };
      };
      expect(inspection.inspection).toMatchObject({
        width: 384,
        height: 576,
        channels: 4,
        alpha: "binary",
        hiddenRgbPixels: 0
      });
      const escaped = await fetch(`${service.url}/api/image?path=${encodeURIComponent("../package.json")}`);
      expect(escaped.status).toBe(400);
      for (const project of bootstrap.projects) {
        const checked = await fetch(`${service.url}/api/project/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id })
        }).then((response) => response.json()) as {
          validation: { ok: boolean; errors: string[] };
        };
        expect(checked.validation.errors, project.id).toEqual([]);
        expect(checked.validation.ok, project.id).toBe(true);
      }

      const staged = await fetch(`${service.url}/api/export/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "lulu" })
      }).then((response) => response.json()) as {
        ok: boolean;
        report: { stageId: string; files: Array<{ change: string }> };
        error?: string;
      };
      expect(staged.ok, staged.error).toBe(true);
      stageId = staged.report.stageId;
      expect(staged.report.files.every((file) => file.change === "unchanged")).toBe(true);
    } finally {
      await service.close();
      if (stageId) {
        await rm(resolve(process.cwd(), "character-production/staging", stageId), { recursive: true, force: true });
        await rm(resolve(process.cwd(), "character-production/reports", `${stageId}.json`), { force: true });
      }
    }
  }, 20_000);
});
