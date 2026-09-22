import { describe, expect, it } from "vitest";
import { getNpcDialogue } from "./npcDialogue";

describe("NPC dialogue registry", () => {
  it("provides reusable dialogue for the cashier and guide", () => {
    expect(getNpcDialogue("cashier")?.displayName).toBe("Charles Jr. Employee");
    expect(getNpcDialogue("night-guide")?.bubble).toMatch(/birds/i);
  });

  it("provides dialogue for all eight ambient pedestrians", () => {
    for (let index = 1; index <= 8; index += 1) {
      expect(getNpcDialogue(`pedestrian-${index}`)?.lines.length).toBeGreaterThan(0);
    }
  });

  it("returns null for actors without NPC dialogue", () => {
    expect(getNpcDialogue("ambient-robin")).toBeNull();
  });
});
