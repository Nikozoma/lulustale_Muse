import { describe, expect, it } from "vitest";
import { createBattleBackdrop } from "./battlePresentation";
import type { FoundationVisual } from "./foundation";

describe("location-based battle presentation", () => {
  it("uses the active Overworld night artwork and encounter position", () => {
    const backdrop = createBattleBackdrop(
      { id: "overworld", width: 3072, height: 2176 },
      visual(
        "overworld",
        "night",
        "production/overworld/night_base.png",
        "7bf096dec8cad4d0f57da5843cde8fca5bc405289f6665b9f888aa93803f07dc",
        3072,
        2176
      ),
      { x: 2304, y: 1632 }
    );

    expect(backdrop).toEqual({
      assetHref: "/assets/maps/native/overworld/night_base.png",
      backgroundPosition: "75.00% 75.00%",
      backgroundSize: "240% auto",
      locationLabel: "Overworld · Night",
      theme: "night"
    });
  });

  it("supports current interiors without encounter-specific hardcoding", () => {
    const backdrop = createBattleBackdrop(
      { id: "charles_jr", width: 1248, height: 1056 },
      visual(
        "charles_jr",
        "day",
        "production/charles_jr/day_base.png",
        "faad265cd12def23bdf5b1677809c98c8597bc041e08c08af3e8381e2ed4299d",
        1248,
        1056
      ),
      { x: 624, y: 528 }
    );

    expect(backdrop.assetHref).toBe("/assets/maps/native/charles_jr/day_base.png");
    expect(backdrop.backgroundPosition).toBe("50.00% 50.00%");
    expect(backdrop.locationLabel).toBe("Charles Jr. · Day");
    expect(backdrop.theme).toBe("interior");
  });
});

function visual(
  mapId: FoundationVisual["map_id"],
  variant: FoundationVisual["variant"],
  asset: string,
  sha256: string,
  width: number,
  height: number
): FoundationVisual {
  return {
    schema_version: "1.0.0",
    map_id: mapId,
    variant,
    canvas: { width_px: width, height_px: height, tile_size_px: 32 },
    base_layer: { asset, sha256, origin_px: { x: 0, y: 0 }, z_index: 0 },
    foreground_layers: []
  };
}
