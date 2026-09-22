import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCollisionSource, validateSemanticDimensions } from "./collision.mjs";
import {
  listProjects,
  loadProject,
  publishProject,
  stageProject,
  validateProject
} from "./projects.mjs";

const root = process.cwd();

describe("Lulu's Tale Map Studio active-runtime contract", () => {
  it("imports only the three live maps and hard-guards the 96x68 Overworld", async () => {
    const projects = await listProjects();
    expect(projects.map((project) => project.mapId)).toEqual(["home", "charles_jr", "overworld"]);
    const overworld = await loadProject("overworld");
    expect(overworld.manifest.dimensions).toMatchObject({
      widthTiles: 96,
      heightTiles: 68,
      widthPx: 3072,
      heightPx: 2176,
      tileSizePx: 32,
      collisionCellSizePx: 4
    });
    expect(overworld.drift).toEqual([]);
    expect(() =>
      validateSemanticDimensions({
        map_id: "overworld",
        map_dimensions: {
          tiles: { width: 48, height: 34 },
          pixels: { width: 1536, height: 1088 },
          tile_size_px: 32
        }
      })
    ).toThrow(/96x68/);
  });

  it.each(["home", "charles_jr", "overworld"])(
    "validates and losslessly expands %s collision to 4px",
    async (mapId) => {
      const validation = await validateProject(mapId);
      expect(validation.ok, validation.errors.join("\n")).toBe(true);
      const report = await stageProject(mapId);
      expect(report.collisionMigrationEquivalent).toBe(true);
      expect(report.files.some((file) => file.path.endsWith(".png"))).toBe(false);
      const collisionPath = resolve(
        root,
        "tools/map-editor/staging",
        mapId,
        `public/data/maps/${mapId}/collision_grid.json`
      );
      const collision = JSON.parse(await readFile(collisionPath, "utf8"));
      const decoded = decodeCollisionSource(collision);
      expect(collision.schema_version).toBe("2.0.0");
      expect(decoded.cellSize).toBe(4);
      expect(decoded.width).toBe(collision.width_tiles * 8);
      expect(decoded.height).toBe(collision.height_tiles * 8);
    }
  );

  it("preserves current semantic passthrough metadata while adding pixel triggers", async () => {
    await stageProject("home");
    const current = JSON.parse(
      await readFile(resolve(root, "public/data/maps/home/semantic.json"), "utf8")
    );
    const staged = JSON.parse(
      await readFile(
        resolve(root, "tools/map-editor/staging/home/public/data/maps/home/semantic.json"),
        "utf8"
      )
    );
    expect(staged.notes).toEqual(current.notes);
    for (const existing of current.foreground_occlusion_regions) {
      const migrated = staged.foreground_occlusion_regions.find(
        (candidate: { id: string }) => candidate.id === existing.id
      );
      expect(migrated?.source).toBe(existing.source);
      expect(migrated?.trigger_pixel_rect).toBeTruthy();
    }
  });

  it("keeps Overworld publication behind the explicit human calibration gate", async () => {
    await expect(publishProject("overworld")).rejects.toThrow(/calibration area/);
  });

  it("stages the current demo actor and quest anchors without bypassing that gate", async () => {
    const overworld = await loadProject("overworld");
    const ids = new Set(overworld.semantic.npc_spawn_markers.map((record: { id: string }) => record.id));
    for (const id of [
      "npc_anchor_homeless_day",
      "npc_anchor_night_guide",
      "npc_anchor_bird_hideout",
      "quest_anchor_bush_sword_approach",
      "quest_anchor_bird_gang_center",
      "npc_anchor_ambient_robin",
      ...Array.from({ length: 8 }, (_, index) => `npc_anchor_pedestrian_${String(index + 1).padStart(2, "0")}`)
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(overworld.manifest.approval?.calibrationAreaApproved).toBe(false);
  });
});
