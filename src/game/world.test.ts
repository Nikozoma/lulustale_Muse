import { describe, expect, it } from "vitest";
import { clampCamera } from "./camera";
import {
  buildCollisionGrid,
  canOccupyCircle,
  findMarkerPositions,
  normalizeSemanticMap,
  type RawSemanticMap
} from "./world";

const mapFixture: RawSemanticMap = {
  mapName: "Home",
  width: 4,
  height: 3,
  gameTileSizePx: 32,
  layerOrder: ["ground", "structures", "objects", "markers"],
  layers: {
    ground: [
      ["indoor_floor", "indoor_floor", "indoor_floor", "indoor_floor"],
      ["indoor_floor", "indoor_floor", "indoor_floor", "indoor_floor"],
      ["indoor_floor", "indoor_floor", "indoor_floor", "indoor_floor"]
    ],
    structures: [
      ["interior_wall", "doorway", null, "entrance_exit"],
      [null, null, null, null],
      [null, null, "exterior_wall", null]
    ],
    objects: [
      [null, null, "bed", null],
      [null, "refrigerator", "booth_seat", null],
      ["cashier_counter", "dining_table", null, null]
    ],
    markers: [
      [null, null, null, null],
      [null, null, "player_spawn", null],
      [null, null, null, null]
    ]
  }
};

describe("semantic home map helpers", () => {
  it("normalizes semantic map metadata and world size", () => {
    const map = normalizeSemanticMap(mapFixture);

    expect(map.name).toBe("Home");
    expect(map.widthTiles).toBe(4);
    expect(map.heightTiles).toBe(3);
    expect(map.tileSize).toBe(32);
    expect(map.worldWidth).toBe(128);
    expect(map.worldHeight).toBe(96);
    expect(map.layerOrder).toEqual(["ground", "structures", "objects", "markers"]);
  });

  it("finds marker positions at tile centers in world pixels", () => {
    const map = normalizeSemanticMap(mapFixture);

    expect(findMarkerPositions(map, "player_spawn")).toEqual([{ x: 80, y: 48, tileX: 2, tileY: 1 }]);
  });

  it("marks walls and solid furniture as blocking while leaving doorway and exits walkable", () => {
    const map = normalizeSemanticMap(mapFixture);
    const collision = buildCollisionGrid(map);

    expect(collision.isSolidTile(0, 0)).toBe(true);
    expect(collision.isSolidTile(2, 0)).toBe(true);
    expect(collision.isSolidTile(1, 1)).toBe(true);
    expect(collision.isSolidTile(2, 2)).toBe(true);
    expect(collision.isSolidTile(2, 1)).toBe(true);
    expect(collision.isSolidTile(0, 2)).toBe(true);
    expect(collision.isSolidTile(1, 2)).toBe(true);
    expect(collision.isSolidTile(1, 0)).toBe(false);
    expect(collision.isSolidTile(3, 0)).toBe(false);
  });

  it("rejects movement when the player's collision circle overlaps a solid tile", () => {
    const map = normalizeSemanticMap(mapFixture);
    const collision = buildCollisionGrid(map);

    expect(canOccupyCircle(map, collision, { x: 112, y: 48 }, 10)).toBe(true);
    expect(canOccupyCircle(map, collision, { x: 77, y: 17 }, 12)).toBe(false);
  });
});

describe("camera helpers", () => {
  it("centers a map that is narrower than the viewport and clamps vertical travel", () => {
    expect(
      clampCamera({ x: 448, y: 640 }, { width: 896, height: 1280 }, { width: 1280, height: 720 })
    ).toEqual({ x: -192, y: 280 });

    expect(
      clampCamera({ x: 100, y: 10 }, { width: 896, height: 1280 }, { width: 1280, height: 720 })
    ).toEqual({ x: -192, y: 0 });
  });

  it("centers compact maps on axes smaller than the zoomed visible world and follows taller axes", () => {
    const visibleWorld = { width: 1280 / 2.25, height: 720 / 2.25 };

    expect(clampCamera({ x: 160, y: 208 }, { width: 320, height: 416 }, visibleWorld)).toEqual({
      x: (320 - visibleWorld.width) / 2,
      y: 48
    });

    expect(clampCamera({ x: 160, y: 20 }, { width: 320, height: 416 }, visibleWorld)).toEqual({
      x: (320 - visibleWorld.width) / 2,
      y: 0
    });
  });
});
