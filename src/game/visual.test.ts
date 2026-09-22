import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadVisualMapFromProjectFile } from "./visualRegistryNode";
import {
  getVisualCompanionFileName,
  getVisualPlacementOpacity,
  getVisualPlacementRect,
  normalizeVisualMap,
  regionOverlapsVisualPlacements,
  selectVisualMapForPhase,
  shouldUseNightTintFallback,
  sortVisualPlacements,
  visualAssetPathToHref,
  type RawVisualMap
} from "./visual";
import { buildCollisionGrid } from "./world";
import { loadSemanticMapFromProjectFile } from "./mapRegistryNode";

describe("visual companion maps", () => {
  it.each([
    ["Home", "day", 28, 43, 1],
    ["Home", "night", 28, 43, 1],
    ["Charles", "day", 39, 33, 1],
    ["Charles", "night", 39, 33, 1],
    ["Overworld", "day", 96, 68, 6],
    ["Overworld", "night", 96, 68, 6]
  ] as const)("discovers and parses the current %s %s visual companion", (id, phase, width, height, placementCount) => {
    const fileName = getVisualCompanionFileName(`${id}.json`, phase);
    expect(existsSync(resolve(process.cwd(), fileName))).toBe(true);

    const visual = loadVisualMapFromProjectFile(id, phase);
    expect(visual).toMatchObject({
      format: "lulus_visual_placements_v1",
      mapFile: `${id}.json`,
      mapId: id,
      width,
      height,
      gameTileSizePx: 32
    });
    expect(visual?.visualLayerOrder).toEqual(["ground", "structures", "objects", "foreground"]);
    expect(visual?.placements).toHaveLength(placementCount);
  });

  it("selects the dedicated night companion and safely falls back to day when one is unavailable", () => {
    const day = loadVisualMapFromProjectFile("Home", "day");
    const night = loadVisualMapFromProjectFile("Home", "night");

    expect(getVisualCompanionFileName("Home.json", "night")).toBe("Home.night.visual.json");
    expect(selectVisualMapForPhase({ day, night }, "night")?.displayName).toBe("Home — Night");
    expect(selectVisualMapForPhase({ day, night: null }, "night")).toBe(day);
    expect(shouldUseNightTintFallback({ day, night }, "night")).toBe(false);
    expect(shouldUseNightTintFallback({ day, night: null }, "night")).toBe(true);
    expect(shouldUseNightTintFallback({ day, night: null }, "day")).toBe(false);
  });

  it("uses the approved full-map Home placement", () => {
    const placement = loadVisualMapFromProjectFile("Home")?.placements[0];

    expect(placement).toMatchObject({
      id: "home_approved_full_map",
      assetPath: "public/assets/maps/home/home_interior_28x43.png",
      crop: { x: 0, y: 0, width: 896, height: 1376 },
      tile: { x: 0, y: 0 },
      draw: { widthTiles: 28, heightTiles: 43 },
      drawLayer: "objects",
      order: 0
    });
    expect(getVisualPlacementRect(placement!, 32)).toEqual({ x: 0, y: 0, width: 896, height: 1376 });
    expect(visualAssetPathToHref(placement!.assetPath)).toBe("/assets/maps/home/home_interior_28x43.png");
  });

  it("keeps visual placements separate from semantic collision", () => {
    const map = loadSemanticMapFromProjectFile("Home");
    const before = buildCollisionGrid(map).isSolidTile(18, 4);
    const visual = loadVisualMapFromProjectFile("Home");

    expect(regionOverlapsVisualPlacements({ id: "bed", tileX: 18, tileY: 4, widthTiles: 1, heightTiles: 1 }, 32, visual?.placements ?? [])).toBe(true);
    expect(buildCollisionGrid(map).isSolidTile(18, 4)).toBe(before);
  });

  it("sorts placements by layer-local order", () => {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), "Home.visual.json"), "utf8")) as RawVisualMap;
    const sourcePlacement = (raw.placements as Array<Record<string, unknown>>)[0];
    const visual = normalizeVisualMap({
      ...raw,
      placements: [
        { ...sourcePlacement, id: "later", order: 20 },
        { ...sourcePlacement, id: "earlier", order: 10 }
      ]
    });

    expect(sortVisualPlacements(visual, "objects").map((placement) => placement.id)).toEqual(["earlier", "later"]);
  });

  it("activates the Overworld tree canopy as the final foreground placement", () => {
    const visual = loadVisualMapFromProjectFile("Overworld");
    const foreground = sortVisualPlacements(visual!, "foreground");

    expect(foreground).toHaveLength(5);
    expect(foreground.at(-1)).toMatchObject({
      id: "overworld_tree_canopy_foreground",
      assetPath: "public/assets/maps/overworld/foreground/overworld_tree_canopy_foreground_96x68.png",
      crop: { x: 0, y: 0, width: 3072, height: 2176 },
      draw: { widthTiles: 96, heightTiles: 68 },
      drawLayer: "foreground",
      order: 100
    });
  });

  it("keeps the night Overworld tree canopy last after all four night building foregrounds", () => {
    const visual = loadVisualMapFromProjectFile("Overworld", "night");
    const foreground = sortVisualPlacements(visual!, "foreground");

    expect(foreground).toHaveLength(5);
    expect(foreground.at(-1)).toMatchObject({
      id: "overworld_tree_canopy_foreground_night",
      assetPath: "public/assets/maps/night/overworld/foreground/overworld_tree_canopy_foreground_96x68_night.png",
      order: 100
    });
  });

  it("fades a building foreground only while Lulu's feet are inside its walk-behind rows", () => {
    const visual = loadVisualMapFromProjectFile("Overworld");
    const placement = visual?.placements.find(({ id }) => id === "lulu_apartment_upper");

    expect(placement).toMatchObject({
      tile: { x: 52, y: 28 },
      draw: { widthTiles: 28, heightTiles: 4 },
      playerOcclusionOpacity: 0.42
    });
    expect(getVisualPlacementOpacity(placement!, { x: 52 * 32 + 16, y: 28 * 32 + 16 }, 32)).toBe(0.42);
    expect(getVisualPlacementOpacity(placement!, { x: 51 * 32 + 16, y: 28 * 32 + 16 }, 32)).toBe(1);
    expect(getVisualPlacementOpacity(placement!, undefined, 32)).toBe(1);
  });

  it("clamps authored player-occlusion opacity to a safe canvas alpha", () => {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), "Home.visual.json"), "utf8")) as RawVisualMap;
    const sourcePlacement = (raw.placements as Array<Record<string, unknown>>)[0];
    const visual = normalizeVisualMap({
      ...raw,
      placements: [{ ...sourcePlacement, playerOcclusionOpacity: 5 }]
    });

    expect(visual.placements[0].playerOcclusionOpacity).toBe(1);
  });
});
