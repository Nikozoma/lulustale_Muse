import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadVisualMapFromProjectFile } from "./visualRegistryNode";

type ManifestAsset = {
  path: string;
  sha256: string;
};

type NightMapManifest = {
  phase: "night";
  maps: Array<{
    mapId: "Home" | "Charles" | "Overworld";
    semanticMap: string;
    visualCompanion: string;
    dimensionsTiles: [number, number];
    dimensionsPixels: [number, number];
    activeAssets: ManifestAsset[];
    approvedReference?: ManifestAsset & { runtimeRole: string };
    buildingForeground?: {
      placementCount: number;
      releasedSemanticTileCount: number;
      playerOcclusionOpacity: number;
    };
    treeForeground?: {
      semanticTreeCount: number;
      semanticTreeTileCount?: number;
      order: number;
    };
  }>;
  sourcePacks: ManifestAsset[];
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(process.cwd(), path))).digest("hex");
}

function readPngDimensions(path: string): [number, number] {
  const bytes = readFileSync(resolve(process.cwd(), path));
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe("night map variants", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), "public/assets/maps/night/night_map_manifest.json"), "utf8")
  ) as NightMapManifest;

  it("registers one dimension-matched night companion for every active semantic map", () => {
    expect(manifest.phase).toBe("night");
    expect(manifest.maps.map(({ mapId }) => mapId).sort()).toEqual(["Charles", "Home", "Overworld"]);

    for (const entry of manifest.maps) {
      const visual = loadVisualMapFromProjectFile(entry.mapId, "night");
      expect(visual).toMatchObject({
        mapFile: entry.semanticMap,
        mapId: entry.mapId,
        width: entry.dimensionsTiles[0],
        height: entry.dimensionsTiles[1],
        gameTileSizePx: 32
      });
      expect(existsSync(resolve(process.cwd(), entry.visualCompanion))).toBe(true);
    }
  });

  it("keeps every active night image at its declared dimensions and exact recorded hash", () => {
    for (const entry of manifest.maps) {
      for (const asset of entry.activeAssets) {
        expect(existsSync(resolve(process.cwd(), asset.path))).toBe(true);
        expect(readPngDimensions(asset.path)).toEqual(entry.dimensionsPixels);
        expect(sha256(asset.path)).toBe(asset.sha256);
      }

      if (entry.approvedReference) {
        expect(readPngDimensions(entry.approvedReference.path)).toEqual(entry.dimensionsPixels);
        expect(sha256(entry.approvedReference.path)).toBe(entry.approvedReference.sha256);
      }
    }
  });

  it("excludes reconstruction-only night source packs from the optimized playable project", () => {
    expect(manifest.sourcePacks).toEqual([]);
  });

  it("records the completed Overworld building and tree foreground contracts", () => {
    const overworld = manifest.maps.find(({ mapId }) => mapId === "Overworld");

    expect(overworld?.buildingForeground).toEqual({
      placementCount: 4,
      releasedSemanticTileCount: 384,
      playerOcclusionOpacity: 0.42
    });
    expect(overworld?.treeForeground).toEqual({ semanticTreeCount: 21, semanticTreeTileCount: 84, order: 100 });
  });
});
