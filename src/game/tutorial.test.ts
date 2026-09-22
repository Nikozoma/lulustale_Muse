import { describe, expect, it } from "vitest";
import { OPENING_TUTORIAL_SEQUENCE, TUTORIAL_CONTENT } from "./tutorial";

describe("first-playthrough tutorial content", () => {
  it("presents four short mobile-first opening windows in order", () => {
    expect(OPENING_TUTORIAL_SEQUENCE).toEqual(["movement", "quest_interaction", "actions", "menu"]);

    for (const id of OPENING_TUTORIAL_SEQUENCE) {
      const tutorial = TUTORIAL_CONTENT[id];
      expect(tutorial.body).toHaveLength(1);
      expect(tutorial.buttonLabel).toBe("Continue");
      expect(tutorial.body[0]).not.toMatch(/WASD|arrow keys|press E/i);
    }

    expect(TUTORIAL_CONTENT.movement.body[0]).toContain("joystick");
    expect(TUTORIAL_CONTENT.quest_interaction.body[0]).toContain("❕");
    expect(TUTORIAL_CONTENT.actions.body[0]).toContain("Actions");
    expect(TUTORIAL_CONTENT.menu.body[0]).toContain("save/load");
  });

  it("describes only existing Brutus companion actions", () => {
    expect(TUTORIAL_CONTENT.brutus.body).toEqual([
      "Use Actions near Brutus to pet or feed him, or tell him to Follow, Sit / Stay, Lie Down, and Fetch."
    ]);
  });
});
