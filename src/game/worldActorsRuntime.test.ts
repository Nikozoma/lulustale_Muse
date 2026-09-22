import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const directionOrder = ["Down", "Down-Left", "Left", "Up-Left", "Up", "Up-Right", "Right", "Down-Right"];

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
}

describe("NPC and bird runtime asset integration", () => {
  it("ships every selected NPC runtime sheet from the authoritative NPC package", () => {
    const base = join(root, "public", "assets", "characters", "npcs");
    const manifest = readJson(join(base, "MANIFEST.json"));
    expect(manifest.production_cell).toEqual([96, 96]);
    expect(manifest.runtime_direction_order).toEqual(directionOrder);
    const required = new Set([
      "homeless_man_day:idle",
      "homeless_man_day:sit",
      "wizard_night:idle",
      "charles_jr_employee:idle",
      ...Array.from({ length: 8 }, (_, index) => `pedestrian_${String(index + 1).padStart(2, "0")}:idle`)
    ]);
    for (const sheet of manifest.sheets as Array<Record<string, any>>) {
      const key = `${sheet.character_key}:${sheet.action}`;
      if (!required.has(key)) continue;
      expect(sheet.frame_cell_size).toEqual([96, 96]);
      expect(sheet.direction_order).toEqual(directionOrder);
      expect(existsSync(join(base, sheet.filename))).toBe(true);
      required.delete(key);
    }
    expect([...required]).toEqual([]);
  });

  it("ships the real fry thief, lookout, captain, and ambient robin runtime sheets", () => {
    const base = join(root, "public", "assets", "characters", "birds");
    const manifest = readJson(join(base, "MANIFEST.json"));
    expect(manifest.production_cell).toEqual([96, 96]);
    expect(manifest.runtime_direction_order).toEqual(directionOrder);
    const required = new Set([
      "primary_fries_thief:idle",
      "primary_fries_thief:theft_attempt",
      "bird_lookout:idle",
      "peck_captain:idle",
      "ambient_robin:idle"
    ]);
    for (const sheet of manifest.sheets as Array<Record<string, any>>) {
      const key = `${sheet.bird_id}:${sheet.action}`;
      if (!required.has(key)) continue;
      expect(sheet.frame_cell_size).toEqual([96, 96]);
      expect(sheet.direction_order).toEqual(directionOrder);
      expect(existsSync(join(base, sheet.filename))).toBe(true);
      required.delete(key);
    }
    expect([...required]).toEqual([]);
  });
});
