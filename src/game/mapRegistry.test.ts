import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAP_REGISTRY, getMapSpec } from "./mapRegistry";
import { loadSemanticMapFromProjectFile } from "./mapRegistryNode";
import { buildCollisionGrid, findMarkerPositions } from "./world";

describe("map registry", () => {
  it("contains the three active map specs", () => {
    expect(Object.keys(MAP_REGISTRY).sort()).toEqual(["Charles", "Home", "Overworld"]);
    expect(getMapSpec("Home").fileName).toBe("Home.json");
    expect(getMapSpec("Overworld").fileName).toBe("Overworld.json");
    expect(getMapSpec("Charles").fileName).toBe("Charles.json");
  });

  it("loads the approved 96x68 Overworld metadata and transitions", () => {
    const map = loadSemanticMapFromProjectFile("Overworld");

    expect(map.name).toBe("Overworld");
    expect(map.widthTiles).toBe(96);
    expect(map.heightTiles).toBe(68);
    expect(map.tileSize).toBe(32);
    expect(map.worldWidth).toBe(3072);
    expect(map.worldHeight).toBe(2176);
    expect(findMarkerPositions(map, "player_spawn")).toEqual([{ x: 2160, y: 1328, tileX: 67, tileY: 41 }]);
    expect(findMarkerPositions(map, "transition_to_home")).toEqual([{ x: 2160, y: 1264, tileX: 67, tileY: 39 }]);
    expect(findMarkerPositions(map, "transition_to_charles_jr")).toEqual([{ x: 944, y: 1328, tileX: 29, tileY: 41 }]);
  });

  it("classifies current Overworld collision from semantic IDs", () => {
    const collision = buildCollisionGrid(loadSemanticMapFromProjectFile("Overworld"));

    expect(collision.isSolidTile(4, 0)).toBe(false); // street
    expect(collision.isSolidTile(0, 0)).toBe(false); // sidewalk
    expect(collision.isSolidTile(19, 15)).toBe(false); // parking lot
    expect(collision.isSolidTile(7, 7)).toBe(false); // crosswalk
    expect(collision.isSolidTile(15, 13)).toBe(true); // tree 2x2 region
    expect(collision.isSolidTile(17, 3)).toBe(true); // completed top-left tree pass
    expect(collision.isSolidTile(85, 3)).toBe(true); // completed top-right tree pass
    expect(collision.isSolidTile(3, 63)).toBe(true); // completed bottom-left tree pass
    expect(collision.isSolidTile(53, 13)).toBe(true); // bush
    expect(collision.isSolidTile(25, 21)).toBe(false); // Charles Jr. upper walk-behind rows
    expect(collision.isSolidTile(25, 25)).toBe(true); // Charles Jr. lower building remains solid
    expect(collision.isSolidTile(53, 29)).toBe(false); // Lulu apartment upper walk-behind rows
    expect(collision.isSolidTile(53, 33)).toBe(true); // Lulu apartment lower building remains solid
    expect(collision.isSolidTile(29, 41)).toBe(false); // Charles transition
    expect(collision.isSolidTile(67, 39)).toBe(false); // Home transition
  });

  it("loads the approved 39x33 Charles Jr. metadata", () => {
    const map = loadSemanticMapFromProjectFile("Charles");

    expect(map.name).toBe("Charles");
    expect(map.widthTiles).toBe(39);
    expect(map.heightTiles).toBe(33);
    expect(map.tileSize).toBe(32);
    expect(map.worldWidth).toBe(1248);
    expect(map.worldHeight).toBe(1056);
    expect(findMarkerPositions(map, "player_spawn")).toEqual([{ x: 592, y: 944, tileX: 18, tileY: 29 }]);
    expect(findMarkerPositions(map, "order_interaction")).toEqual([{ x: 592, y: 336, tileX: 18, tileY: 10 }]);
  });

  it("classifies current Charles Jr. collision from semantic IDs", () => {
    const collision = buildCollisionGrid(loadSemanticMapFromProjectFile("Charles"));

    expect(collision.isSolidTile(0, 0)).toBe(true); // exterior wall
    expect(collision.isSolidTile(1, 5)).toBe(true); // booth seat
    expect(collision.isSolidTile(7, 6)).toBe(true); // cashier counter
    expect(collision.isSolidTile(10, 11)).toBe(true); // dining table
    expect(collision.isSolidTile(18, 10)).toBe(false); // order interaction
    expect(collision.isSolidTile(18, 29)).toBe(false); // player spawn
    expect(collision.isSolidTile(18, 30)).toBe(false); // entrance/exit
  });

  it.each([
    ["Home", 28, 43],
    ["Charles", 39, 33],
    ["Overworld", 96, 68]
  ] as const)("keeps %s map identity and current dimensions", (id, width, height) => {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), `${id}.json`), "utf8")) as {
      mapId?: string;
      mapName?: string;
      displayName?: string;
      width?: number;
      height?: number;
      gameTileSizePx?: number;
    };

    expect(raw).toMatchObject({ mapId: id, mapName: id, displayName: id, width, height, gameTileSizePx: 32 });
  });
});
