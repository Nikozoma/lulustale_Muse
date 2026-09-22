import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAYER } from "./constants";
import {
  canOccupy,
  decodeCollisionGrid,
  getSpawn,
  type CollisionSource,
  type FoundationSemantic,
  type FoundationVisual,
  type RuntimeMap,
  type WorldPoint
} from "./foundation";
import { DEFAULT_QUEST_TRAIL_ENABLED, findQuestTrailPath } from "./questTrail";

describe("collision-aware quest trail", () => {
  it("is off by default", () => {
    expect(DEFAULT_QUEST_TRAIL_ENABLED).toBe(false);
  });

  it("finds a same-map route from the real Home spawn to the refrigerator objective", () => {
    const home = runtimeHome();
    const refrigerator = home.semantic.interactions.find((interaction) => interaction.id === "interaction_refrigerator")!;
    const target = center(refrigerator.pixel_rect);
    const path = findQuestTrailPath(home, getSpawn(home).pixel_point, target, PLAYER.collider);
    expect(path?.[0]).toEqual(getSpawn(home).pixel_point);
    expect(path?.at(-1)).toEqual(target);
    expectPathTraversable(home, path!);
  });

  it("routes to the active top-left Home transition", () => {
    const home = runtimeHome();
    const transition = home.semantic.transitions.find((candidate) => candidate.id === "transition_home_to_overworld")!;
    const target = center(transition.pixel_rect);
    const path = findQuestTrailPath(home, getSpawn(home).pixel_point, target, PLAYER.collider);
    expect(path?.at(-1)).toEqual(target);
    expectPathTraversable(home, path!);
  });

  it("routes around the real couch and coffee-table collision instead of crossing it", () => {
    const home = runtimeHome();
    const start = { x: 128, y: 704 };
    const target = { x: 304, y: 880 };
    const path = findQuestTrailPath(home, start, target, PLAYER.collider)!;
    expect(path.length).toBeGreaterThan(2);
    expectPathTraversable(home, path);
  });

  it("returns no trail when there is no current-map target", () => {
    expect(findQuestTrailPath(runtimeHome(), getSpawn(runtimeHome()).pixel_point, null, PLAYER.collider)).toBeNull();
  });
});

function expectPathTraversable(map: RuntimeMap, path: WorldPoint[]): void {
  for (let segment = 1; segment < path.length; segment += 1) {
    const start = path[segment - 1];
    const end = path[segment];
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 4));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      expect(canOccupy(map, {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t
      }, PLAYER.collider)).toBe(true);
    }
  }
}

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

function center(rect: { x: number; y: number; width: number; height: number }): WorldPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
