import { describe, expect, it } from "vitest";
import { ASSET_MANIFEST } from "./assets";

describe("asset manifest overworld readability mappings", () => {
  it("maps key overworld ground semantics to real city or nature assets", () => {
    expect(ASSET_MANIFEST.tiles.street.imageKey).toBe("cityPropTiles");
    expect(ASSET_MANIFEST.tiles.sidewalk.imageKey).toBe("cityPropTiles");
    expect(ASSET_MANIFEST.tiles.parking_lot.imageKey).toBe("cityPropTiles");
    expect(ASSET_MANIFEST.tiles.crosswalk.imageKey).toBe("cityPropTiles");
    expect(ASSET_MANIFEST.tiles.grass.imageKey).toBe("modernCityTiles");
  });

  it("renders overworld buildings as grouped real-asset facades", () => {
    expect(ASSET_MANIFEST.structures.player_apartment_building).toMatchObject({
      imageKey: "modernCityTiles",
      render: { mode: "fillRegion" }
    });
    expect(ASSET_MANIFEST.structures.charles_jr_building).toMatchObject({
      imageKey: "cityPropTiles",
      render: { mode: "fillRegion" }
    });
    expect(ASSET_MANIFEST.structures.apartment_building).toMatchObject({
      imageKey: "cityPropTiles",
      render: { mode: "fillRegion" }
    });
  });

  it("has real sprite crops for overworld transition door fixtures", () => {
    expect(ASSET_MANIFEST.tiles.home_door.imageKey).toBe("modernCityTiles");
    expect(ASSET_MANIFEST.tiles.charles_jr_door.imageKey).toBe("cityPropTiles");
  });

  it("maps home-specific indoor polish sprites to real expanded public assets", () => {
    expect(ASSET_MANIFEST.tiles.home_floor).toMatchObject({
      imageKey: "topDownFloorsWalls",
      crop: { x: 16, y: 80, width: 16, height: 16 }
    });
    expect(ASSET_MANIFEST.tiles.home_wall).toMatchObject({
      imageKey: "modernRoomBuilder32",
      crop: { x: 0, y: 544, width: 32, height: 32 }
    });
    expect(ASSET_MANIFEST.tiles.entrance_exit).toMatchObject({
      imageKey: "topDownDoorsWindows",
      crop: { x: 128, y: 80, width: 32, height: 48 }
    });
    expect(ASSET_MANIFEST.objects.doorway.imageKey).toBe("topDownDoorsWindows");
    expect(ASSET_MANIFEST.objects.home_dining_table).toMatchObject({
      imageKey: "topDownFurnitureState1",
      render: { mode: "fit", widthTiles: 2, heightTiles: 1 }
    });
    expect(ASSET_MANIFEST.objects.home_bed).toMatchObject({
      imageKey: "modernInteriors32",
      crop: { x: 224, y: 0, width: 64, height: 128 },
      render: { mode: "fit", widthTiles: 1.85, heightTiles: 2.15 }
    });
    expect(ASSET_MANIFEST.objects.home_refrigerator).toMatchObject({
      imageKey: "topDownFurnitureState2",
      crop: { x: 32, y: 192, width: 32, height: 64 }
    });
    expect(ASSET_MANIFEST.objects.home_counter_top).toMatchObject({
      imageKey: "topDownFurnitureState2",
      crop: { x: 128, y: 192, width: 32, height: 32 }
    });
    expect(ASSET_MANIFEST.objects.home_dog_bowl).toMatchObject({
      imageKey: "topDownSmallItems",
      crop: { x: 64, y: 64, width: 16, height: 16 }
    });
  });

  it("loads the expanded real Home asset sheets through the manifest", () => {
    expect(ASSET_MANIFEST.images.map((asset) => asset.key)).toEqual(
      expect.arrayContaining(["topDownFurnitureState2", "topDownSmallItems", "modernInteriors32", "modernRoomBuilder32"])
    );
  });

  it("does not load character sheets through the obsolete general asset manifest", () => {
    expect(ASSET_MANIFEST.images.map(({ key }) => key)).not.toEqual(
      expect.arrayContaining(["dogSheet", "cashierCharacter9", "tinyChick", "luluWalkDown", "luluIdle8Dir", "luluWalk8Dir"])
    );
  });
});
