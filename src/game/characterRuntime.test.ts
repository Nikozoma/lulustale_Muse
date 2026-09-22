import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DIRECTION_ORDER, type BrutusManifest, type CompanionInteractions, type LuluManifest } from "./characterAssets";
import { CHARACTER_CELL, ROOT_ANCHOR } from "./constants";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

describe("authoritative Lulu and Brutus packages", () => {
  const luluRoot = "public/assets/characters/lulu";
  const brutusRoot = "public/assets/characters/brutus";
  const lulu = readJson<LuluManifest>(`${luluRoot}/MANIFEST.json`);
  const brutus = readJson<BrutusManifest>(`${brutusRoot}/MANIFEST.json`);
  const interactions = readJson<CompanionInteractions>(`${brutusRoot}/INTERACTIONS.json`);

  it("uses 96x96 cells, (48,88) roots, and the fixed eight-direction order", () => {
    expect(lulu.frame_cell).toEqual([CHARACTER_CELL.width, CHARACTER_CELL.height]);
    expect(lulu.foot_anchor).toEqual([ROOT_ANCHOR.x, ROOT_ANCHOR.y]);
    expect(lulu.row_order).toEqual(DIRECTION_ORDER);
    expect(brutus.frame_cell).toEqual([96, 96]);
    expect(brutus.direction_order).toEqual(DIRECTION_ORDER);
    expect(brutus.brutus_master_scale.ground_root_anchor).toEqual([48, 88]);
  });

  it("ships every reusable Lulu animation at manifest-declared geometry", () => {
    expect(Object.keys(lulu.animations)).toEqual(
      expect.arrayContaining(["idle", "walk", "run", "jump", "dash", "sit", "pet_dog", "knocked_down", "hit"])
    );
    for (const animation of Object.values(lulu.animations)) {
      const path = resolve(process.cwd(), luluRoot, animation.sheet);
      expect(existsSync(path), path).toBe(true);
      expect(readPngDimensions(path)).toEqual(animation.sheet_size);
      expect(animation.sheet_size[0]).toBe(animation.frames_per_direction * 96);
      expect(animation.sheet_size[1]).toBe(8 * 96);
    }
  });

  it("ships Brutus follow, rest, transition, and synchronized interaction actions", () => {
    expect(Object.keys(brutus.brutus_animations)).toEqual(
      expect.arrayContaining([
        "idle_stand",
        "walk",
        "run",
        "sit",
        "lay_rest",
        "being_petted",
        "eating",
        "happy_excited",
        "stand_to_sit",
        "sit_to_stand"
      ])
    );
    for (const animation of Object.values(brutus.brutus_animations)) {
      const path = resolve(process.cwd(), brutusRoot, animation.filename);
      expect(existsSync(path), path).toBe(true);
      expect(readPngDimensions(path)).toEqual(animation.sheet_dimensions);
      expect(animation.direction_order).toEqual(DIRECTION_ORDER);
    }
  });

  it("loads metadata-backed petting, feeding, commands, and fetch preparation without baking entities together", () => {
    expect(Object.keys(interactions.interactions)).toEqual(
      expect.arrayContaining(["petting", "feeding", "companion_command", "play_fetch_preparation"])
    );
    for (const key of ["petting", "feeding", "companion_command"] as const) {
      const definition = interactions.interactions[key];
      expect(Object.keys(definition.per_direction)).toEqual(DIRECTION_ORDER);
      expect(definition.synchronization.frame_ms).toBeGreaterThan(0);
    }
    expect(brutus.lulu_interaction_animations.feed_dog.filename).toContain("Lulu_feed_dog.png");
    expect(brutus.lulu_interaction_animations.companion_command.filename).toContain("Lulu_companion_command.png");
  });
});

function readPngDimensions(path: string): readonly [number, number] {
  const png = readFileSync(path);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}
