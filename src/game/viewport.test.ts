import { describe, expect, it } from "vitest";
import { calculateLogicalViewport } from "./viewport";

describe("shared responsive logical camera", () => {
  it("maps a 3040x1440 19:9 phone to 760x360 at integer 4x output", () => {
    expect(calculateLogicalViewport(760, 360, 4)).toMatchObject({
      width: 760,
      height: 360,
      outputScale: 4,
      cssWidth: 760,
      cssHeight: 360,
      compatibilityFallback: false
    });
  });

  it("uses the 640x360 safe view at 1920x1080 without a map-specific zoom", () => {
    expect(calculateLogicalViewport(1920, 1080, 1)).toMatchObject({ width: 640, height: 360, outputScale: 3 });
  });

  it("reveals more horizontal world on ultrawide displays", () => {
    const viewport = calculateLogicalViewport(2560, 1080, 1);
    expect(viewport.height).toBe(360);
    expect(viewport.width).toBe(853);
    expect(viewport.outputScale).toBe(3);
  });

  it("fills a wide Android usable viewport even when its height is not a 360px multiple", () => {
    const viewport = calculateLogicalViewport(883, 343, 3);
    expect(viewport.height).toBe(360);
    expect(viewport.width).toBe(927);
    expect(viewport.outputScale).toBe(2);
    expect(viewport.cssWidth).toBeCloseTo(883);
    expect(viewport.cssHeight).toBeGreaterThan(342.8);
  });

  it("falls back to a uniform nearest-neighbor fit below reference size", () => {
    expect(calculateLogicalViewport(480, 270, 1)).toMatchObject({
      width: 640,
      height: 360,
      cssWidth: 480,
      cssHeight: 270,
      compatibilityFallback: true
    });
  });
});
