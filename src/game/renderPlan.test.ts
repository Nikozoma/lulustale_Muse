import { describe, expect, it } from "vitest";
import { getObjectDrawBox, getStructureSpriteKey, type ObjectRenderRule } from "./renderPlan";
import type { ObjectRegion } from "./world";

describe("semantic render planning", () => {
  it("does not render passable doorway or entrance tiles as repeated door sprites", () => {
    expect(getStructureSpriteKey("interior_wall")).toBe("interior_wall");
    expect(getStructureSpriteKey("window")).toBe("window");
    expect(getStructureSpriteKey("doorway")).toBeUndefined();
    expect(getStructureSpriteKey("entrance_exit")).toBeUndefined();
  });

  it("draws a grouped object from an explicit fit rule centered and bottom-aligned in the footprint", () => {
    const region: ObjectRegion = {
      id: "bed",
      tileX: 17,
      tileY: 4,
      widthTiles: 5,
      heightTiles: 4
    };
    const rule: ObjectRenderRule = {
      mode: "fit",
      widthTiles: 4,
      heightTiles: 3,
      anchor: "bottom"
    };

    expect(getObjectDrawBox(region, 32, rule)).toEqual({
      x: 560,
      y: 160,
      width: 128,
      height: 96
    });
  });

  it("can render strip-like grouped objects as a single coherent region fill", () => {
    const region: ObjectRegion = {
      id: "counter_top",
      tileX: 12,
      tileY: 31,
      widthTiles: 5,
      heightTiles: 2
    };
    const rule: ObjectRenderRule = {
      mode: "fillRegion",
      anchor: "bottom"
    };

    expect(getObjectDrawBox(region, 32, rule)).toEqual({
      x: 384,
      y: 992,
      width: 160,
      height: 64
    });
  });
});
