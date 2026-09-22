import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSemanticMapFromProjectFile } from "./mapRegistryNode";

type CanopyManifest = {
  canopyCount: number;
  semanticTreeRegionCount: number;
  semanticTreeTileCount: number;
  activeForegroundOverlay: string;
  canopies: Array<{
    semanticTreeTile: { x: number; y: number };
    semanticTreeRegion: { x: number; y: number; widthTiles: number; heightTiles: number };
    assetPath: string;
  }>;
};

describe("Overworld tree foreground coverage", () => {
  const manifestPath = resolve(
    process.cwd(),
    "public/assets/maps/overworld/foreground/tree_canopy_manifest.json"
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CanopyManifest;

  it("keeps one foreground canopy for every connected 2x2 semantic tree region", () => {
    const map = loadSemanticMapFromProjectFile("Overworld");
    const semanticTreeTiles = map.layers.objects.flatMap((row, y) =>
      row.flatMap((cell, x) => (cell === "tree" ? [`${x},${y}`] : []))
    );

    expect(manifest.canopyCount).toBe(21);
    expect(manifest.semanticTreeRegionCount).toBe(21);
    expect(manifest.semanticTreeTileCount).toBe(84);
    expect(manifest.canopies).toHaveLength(21);
    expect(semanticTreeTiles).toHaveLength(84);
    for (const { semanticTreeRegion, semanticTreeTile } of manifest.canopies) {
      expect(semanticTreeRegion).toMatchObject({ widthTiles: 2, heightTiles: 2 });
      expect(semanticTreeTile).toEqual({ x: semanticTreeRegion.x + 1, y: semanticTreeRegion.y + 1 });
      for (let y = semanticTreeRegion.y; y < semanticTreeRegion.y + 2; y += 1) {
        for (let x = semanticTreeRegion.x; x < semanticTreeRegion.x + 2; x += 1) {
          expect(map.layers.objects[y][x]).toBe("tree");
        }
      }
    }
  });

  it("references the active overlay and 21 real canopy assets", () => {
    expect(existsSync(resolve(process.cwd(), manifest.activeForegroundOverlay))).toBe(true);
    for (const canopy of manifest.canopies) {
      expect(existsSync(resolve(process.cwd(), canopy.assetPath))).toBe(true);
    }
  });
});
