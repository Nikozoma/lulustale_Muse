import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BRUTUS, PLAYER } from "./constants";
import { createDay1ResetSnapshot } from "./debugReset";
import {
  canOccupy,
  decodeCollisionGrid,
  type CollisionSource,
  type FoundationSemantic,
  type FoundationVisual,
  type RuntimeMap
} from "./foundation";
import { parseBackupSave, serializeBackupSave } from "./saveSystem";

describe("Day 1 debug reset", () => {
  it("builds a fresh authoritative Home state and survives immediate persistence", () => {
    const home = runtimeHome();
    const reset = createDay1ResetSnapshot(home, "2026-07-21T00:00:00.000Z");
    expect(reset.quest).toMatchObject({ stage: "check_fridge", day: 1, phase: "day" });
    expect(reset.mapId).toBe("home");
    expect(reset.phase).toBe("day");
    expect(reset.inventory).toEqual([]);
    expect(reset.equipment).toEqual({ weapon: null, body: null, accessory: null });
    expect(reset.status).toMatchObject({ level: 1, experience: 0, hp: 20, maxHp: 20 });
    expect(reset.flags).toEqual({
      dayWarningSeen: false,
      firstDayOpeningCompleted: false,
      brutusIntroTutorialCompleted: false
    });
    expect(reset.player).toMatchObject({ position: { x: 528, y: 304 }, facing: "right" });
    expect(reset.companion).toMatchObject({ mode: "stay", commandPose: "lay" });
    expect(canOccupy(home, reset.player.position, PLAYER.collider)).toBe(true);
    expect(canOccupy(home, reset.companion.position, BRUTUS.collider)).toBe(true);
    expect(parseBackupSave(serializeBackupSave(reset))).toEqual(reset);
  });

  it("leaves debug speed state outside the persistent quest reset snapshot", () => {
    expect(createDay1ResetSnapshot(runtimeHome())).not.toHaveProperty("playerSpeedMultiplier");
  });
});

function runtimeHome(): RuntimeMap {
  const root = resolve(process.cwd(), "public/data/maps/home");
  const semantic = readJson<FoundationSemantic>(resolve(root, "semantic.json"));
  const collision = readJson<CollisionSource>(resolve(root, "collision_grid.json"));
  const day = readJson<FoundationVisual>(resolve(root, "visual_day.json"));
  const night = readJson<FoundationVisual>(resolve(root, "visual_night.json"));
  return {
    id: "home",
    semantic,
    collision: decodeCollisionGrid(collision),
    visuals: { day, night },
    width: semantic.map_dimensions.pixels.width,
    height: semantic.map_dimensions.pixels.height,
    tileSize: semantic.map_dimensions.tile_size_px
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
