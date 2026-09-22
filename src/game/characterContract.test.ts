import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  attachmentTransform,
  directionForVectorWithHysteresis,
  frameIndexFromDistance,
  frameIndexFromElapsed,
  luluVisualDirectionForVectorWithHysteresis,
  spriteDrawBox,
  validateRuntimeCharacterManifest,
  type RuntimeCharacterManifestContract
} from "./characterContract";

function readLulu(): RuntimeCharacterManifestContract {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/assets/characters/v2/lulu/MANIFEST.json"), "utf8")
  ) as RuntimeCharacterManifestContract;
}

function readBrutus(): RuntimeCharacterManifestContract {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/assets/characters/v2/brutus/MANIFEST.json"), "utf8")
  ) as RuntimeCharacterManifestContract;
}

describe("CharacterManifestV2 playback contract", () => {
  it("validates the generated real Lulu runtime manifest", () => {
    const lulu = readLulu();
    expect(validateRuntimeCharacterManifest(lulu)).toEqual([]);
    expect(lulu.renderScales).toEqual({ overworld: 1, home: 1.5, charles_jr: 1.5, battle: 1.3 });
  });

  it("validates every generated runtime-ready registry entry", () => {
    const index = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/assets/characters/INDEX.json"), "utf8")
    ) as { characters: Array<{ id: string; manifest: string }> };
    for (const entry of index.characters) {
      const manifest = JSON.parse(
        readFileSync(resolve(process.cwd(), "public", entry.manifest.replace(/^\/assets\//, "assets/")), "utf8")
      ) as RuntimeCharacterManifestContract;
      expect(validateRuntimeCharacterManifest(manifest), entry.id).toEqual([]);
    }
  });

  it("advances real Lulu locomotion from traveled distance", () => {
    const walk = readLulu().actions.walk;
    const run = readLulu().actions.run;
    expect(walk.cycleDistancePx).toBe(96);
    expect(frameIndexFromDistance(0, walk.cycleDistancePx!, walk.framesPerDirection, walk.entryFrame)).toBe(0);
    expect(frameIndexFromDistance(12, walk.cycleDistancePx!, walk.framesPerDirection, walk.entryFrame)).toBe(1);
    expect(frameIndexFromDistance(24, walk.cycleDistancePx!, walk.framesPerDirection, walk.entryFrame)).toBe(2);
    expect(frameIndexFromDistance(96, walk.cycleDistancePx!, walk.framesPerDirection, walk.entryFrame)).toBe(0);
    expect(frameIndexFromDistance(0, walk.cycleDistancePx!, walk.framesPerDirection, 2)).toBe(2);
    expect(run.cycleDistancePx).toBe(192);
    expect(frameIndexFromDistance(24, run.cycleDistancePx!, run.framesPerDirection, run.entryFrame)).toBe(1);
    expect(frameIndexFromDistance(48, run.cycleDistancePx!, run.framesPerDirection, run.entryFrame)).toBe(2);
    expect(frameIndexFromDistance(192, run.cycleDistancePx!, run.framesPerDirection, run.entryFrame)).toBe(0);
  });

  it("uses authored frame durations for real Lulu idle playback", () => {
    const idle = readLulu().actions.idle;
    const frames = idle.tracks.Down!;
    expect(frameIndexFromElapsed(899, frames, idle.playback, idle.loop, idle.entryFrame).frameIndex).toBe(0);
    expect(frameIndexFromElapsed(900, frames, idle.playback, idle.loop, idle.entryFrame).frameIndex).toBe(1);
    expect(frameIndexFromElapsed(0, frames, idle.playback, idle.loop, 2).frameIndex).toBe(2);
    expect(frameIndexFromElapsed(1019, frames, idle.playback, idle.loop, 2).frameIndex).toBe(3);
    expect(frameIndexFromElapsed(1020, frames, idle.playback, idle.loop, 2).frameIndex).toBe(0);
  });

  it("holds direction inside the authored ten-degree hysteresis band", () => {
    const closeToBoundary = { x: Math.cos(Math.PI / 8 + 0.05), y: Math.sin(Math.PI / 8 + 0.05) };
    expect(directionForVectorWithHysteresis(closeToBoundary, "Right")).toBe("Right");
    const beyondBand = { x: Math.cos(Math.PI / 8 + 0.25), y: Math.sin(Math.PI / 8 + 0.25) };
    expect(directionForVectorWithHysteresis(beyondBand, "Right")).toBe("Down-Right");
  });

  it("uses six Lulu visual directions and resolves horizontal input from vertical context", () => {
    expect(luluVisualDirectionForVectorWithHysteresis({ x: -1, y: 0 }, "Up")).toBe("Up-Left");
    expect(luluVisualDirectionForVectorWithHysteresis({ x: -1, y: 0 }, "Down-Left")).toBe("Down-Left");
    expect(luluVisualDirectionForVectorWithHysteresis({ x: 1, y: 0 }, "Up-Left")).toBe("Up-Right");
    expect(luluVisualDirectionForVectorWithHysteresis({ x: 1, y: 0 }, "Down")).toBe("Down-Right");
  });

  it("does not flicker Lulu's horizontal visual row across small vertical noise", () => {
    const slightlyUp = {
      x: Math.cos((-2 * Math.PI) / 180),
      y: Math.sin((-2 * Math.PI) / 180)
    };
    const clearlyUp = {
      x: Math.cos((-12 * Math.PI) / 180),
      y: Math.sin((-12 * Math.PI) / 180)
    };
    expect(luluVisualDirectionForVectorWithHysteresis(slightlyUp, "Down-Right")).toBe("Down-Right");
    expect(luluVisualDirectionForVectorWithHysteresis(clearlyUp, "Down-Right")).toBe("Up-Right");
  });

  it("uses the real authored Lulu root for integer-snapped draw placement", () => {
    const idle = readLulu().actions.idle;
    const frame = idle.tracks.Down![0];
    expect(spriteDrawBox({ x: 400, y: 300 }, idle.cell, frame.root, frame.visualOffset, 1.5)).toEqual({
      x: 328,
      y: 168,
      width: 144,
      height: 144
    });
  });

  it("resolves real interaction anchors through the same world-root transform", () => {
    const lulu = readLulu();
    const throwFrame = lulu.actions.throw_toy.tracks.Down!.find((frame) => frame.anchors.length > 0)!;
    const anchor = throwFrame.anchors[0];
    expect(anchor.id).toBe("lulu_throw_origin_local");
    expect(attachmentTransform({ x: 400, y: 300 }, throwFrame, anchor, 1)).toMatchObject({
      x: 400,
      y: 259,
      rotationDeg: 0,
      scale: 1,
      drawOrder: "front"
    });
  });

  it("publishes a valid mouth anchor on every real Brutus carry frame", () => {
    const carry = readBrutus().actions.carry_pose;
    for (const direction of carry.directions) {
      for (const frame of carry.tracks[direction] ?? []) {
        const anchor = frame.anchors.find((candidate) => candidate.id === "brutus_mouth_anchor_local");
        expect(anchor, `${direction} carry mouth anchor`).toBeDefined();
        expect(anchor!.point[0]).toBeGreaterThanOrEqual(0);
        expect(anchor!.point[1]).toBeGreaterThanOrEqual(0);
      }
    }
    const rightFrame = carry.tracks.Right![0];
    const rightMouth = rightFrame.anchors.find((candidate) => candidate.id === "brutus_mouth_anchor_local")!;
    expect(attachmentTransform({ x: 400, y: 300 }, rightFrame, rightMouth, 1)).toMatchObject({
      x: 378,
      y: 275
    });
  });
});
