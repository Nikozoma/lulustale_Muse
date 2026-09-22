import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSemanticMapFromProjectFile } from "./mapRegistryNode";
import { loadVisualMapFromProjectFile } from "./visualRegistryNode";
import { buildCollisionGrid } from "./world";

type BuildingForegroundManifest = {
  baseMapAsset: string;
  foregroundAsset: string;
  playerOcclusionOpacity: number;
  totalReleasedTileCount: number;
  buildings: Array<{
    id: string;
    semanticId: string;
    groundId: string;
    x: number;
    y: number;
    widthTiles: number;
    heightTiles: number;
    releasedTileCount: number;
  }>;
};

describe("Overworld building foreground coverage", () => {
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/assets/maps/overworld/foreground/building_foreground_manifest.json"),
      "utf8"
    )
  ) as BuildingForegroundManifest;

  it("releases exactly the four enlarged rows corresponding to the original upper two rows", () => {
    const map = loadSemanticMapFromProjectFile("Overworld");
    const collision = buildCollisionGrid(map);
    let releasedTiles = 0;

    expect(manifest.buildings).toHaveLength(4);
    for (const building of manifest.buildings) {
      expect(building.heightTiles).toBe(4);
      expect(building.releasedTileCount).toBe(building.widthTiles * 4);

      for (let y = building.y; y < building.y + building.heightTiles; y += 1) {
        for (let x = building.x; x < building.x + building.widthTiles; x += 1) {
          expect(map.layers.structures[y][x]).toBeNull();
          expect(map.layers.ground[y][x]).toBe(building.groundId);
          expect(collision.isSolidTile(x, y)).toBe(false);
          releasedTiles += 1;
        }
      }

      const firstLowerRow = building.y + building.heightTiles;
      for (let x = building.x; x < building.x + building.widthTiles; x += 1) {
        expect(map.layers.structures[firstLowerRow][x]).toBe(building.semanticId);
        expect(collision.isSolidTile(x, firstLowerRow)).toBe(true);
      }
    }

    expect(releasedTiles).toBe(384);
    expect(manifest.totalReleasedTileCount).toBe(384);
  });

  it("uses grass for apartments and parking lot for Charles Jr.", () => {
    const materials = Object.fromEntries(manifest.buildings.map(({ id, groundId }) => [id, groundId]));

    expect(materials).toEqual({
      apartment_north_upper: "grass",
      charles_jr_upper: "parking_lot",
      lulu_apartment_upper: "grass",
      apartment_south_upper: "grass"
    });
  });

  it("wires every daytime building zone to the real foreground asset and dynamic fade", () => {
    const visual = loadVisualMapFromProjectFile("Overworld", "day");
    const buildingPlacements = visual?.placements.filter(({ playerOcclusionOpacity }) =>
      playerOcclusionOpacity !== undefined
    );
    expect(existsSync(resolve(process.cwd(), manifest.baseMapAsset))).toBe(true);
    expect(existsSync(resolve(process.cwd(), manifest.foregroundAsset))).toBe(true);
    expect(buildingPlacements).toHaveLength(4);
    for (const placement of buildingPlacements ?? []) {
      expect(placement.assetPath).toBe(manifest.foregroundAsset);
      expect(placement.drawLayer).toBe("foreground");
      expect(placement.playerOcclusionOpacity).toBe(manifest.playerOcclusionOpacity);
    }
  });

  it("preserves the same four dynamic building zones in the night visual companion", () => {
    const day = loadVisualMapFromProjectFile("Overworld", "day");
    const night = loadVisualMapFromProjectFile("Overworld", "night");
    const getZones = (placements: NonNullable<typeof day>["placements"]) =>
      placements
        .filter(({ playerOcclusionOpacity }) => playerOcclusionOpacity !== undefined)
        .map(({ tile, draw, order, playerOcclusionOpacity }) => ({ tile, draw, order, playerOcclusionOpacity }));

    expect(getZones(night!.placements)).toEqual(getZones(day!.placements));
    for (const placement of night!.placements.filter(({ playerOcclusionOpacity }) => playerOcclusionOpacity !== undefined)) {
      expect(placement.assetPath).toBe(
        "public/assets/maps/night/overworld/foreground/overworld_building_upper_foreground_96x68_night.png"
      );
    }
  });
});
