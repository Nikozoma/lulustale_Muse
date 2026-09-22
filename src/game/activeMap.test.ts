import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCollisionGrid, normalizeSemanticMap, type RawSemanticMap } from "./world";

const requiredIds = [
  "indoor_floor",
  "exterior_wall",
  "entrance_exit",
  "player_spawn",
  "dog_spawn",
  "dog_interaction",
  "dog_bowl",
  "bed",
  "bed_interaction",
  "refrigerator",
  "fridge_interaction",
  "couch",
  "counter_top",
  "stove",
  "dining_table"
];

describe("active Home map", () => {
  function loadActiveMap() {
    const path = resolve(process.cwd(), "Home.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as RawSemanticMap & {
      mapId?: string;
      displayName?: string;
    };
    return { raw, map: normalizeSemanticMap(raw) };
  }

  it("uses the approved 28x43 Home semantic map with required IDs", () => {
    const { raw, map } = loadActiveMap();
    const ids = new Set(Object.values(map.layers).flat(2).filter((cell): cell is string => Boolean(cell)));

    expect(raw.mapId).toBe("Home");
    expect(raw.mapName).toBe("Home");
    expect(raw.displayName).toBe("Home");
    expect(map.widthTiles).toBe(28);
    expect(map.heightTiles).toBe(43);
    expect(map.tileSize).toBe(32);
    expect(map.worldWidth).toBe(896);
    expect(map.worldHeight).toBe(1376);
    expect(requiredIds.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("classifies current Home collision without marker blocking", () => {
    const { map } = loadActiveMap();
    const collision = buildCollisionGrid(map);

    expect(collision.isSolidTile(12, 0)).toBe(true); // exterior wall
    expect(collision.isSolidTile(18, 4)).toBe(true); // bed
    expect(collision.isSolidTile(1, 23)).toBe(true); // couch
    expect(collision.isSolidTile(24, 21)).toBe(true); // refrigerator
    expect(collision.isSolidTile(21, 23)).toBe(true); // stove
    expect(collision.isSolidTile(14, 32)).toBe(true); // dining table

    expect(collision.isSolidTile(17, 10)).toBe(false); // player spawn
    expect(collision.isSolidTile(19, 12)).toBe(false); // bed interaction
    expect(collision.isSolidTile(23, 28)).toBe(false); // fridge interaction
    expect(collision.isSolidTile(6, 37)).toBe(false); // dog interaction
    expect(collision.isSolidTile(14, 39)).toBe(false); // entrance/exit marker
    expect(collision.isSolidTile(6, 36)).toBe(false); // dog bowl remains non-blocking
  });
});
