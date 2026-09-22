import { describe, expect, it } from "vitest";
import { canActivateObjectiveMarker, describeWorldAction, getAvailableWorldActions } from "./interactionSystem";

describe("world action context system", () => {
  it("selects the nearest available target for each action kind", () => {
    const actions = getAvailableWorldActions(
      { x: 0, y: 0 },
      [
        { id: "far-chat", label: "Far NPC", kind: "chat", position: { x: 50, y: 0 } },
        { id: "near-chat", label: "Near NPC", kind: "chat", position: { x: 20, y: 0 } },
        { id: "fridge", label: "Fridge", kind: "use", position: { x: 10, y: 0 } },
        { id: "sword", label: "Bush Sword", kind: "pickup", position: { x: 30, y: 0 } }
      ],
      60
    );
    expect(actions.chat?.id).toBe("near-chat");
    expect(actions.use?.id).toBe("fridge");
    expect(actions.pickup?.id).toBe("sword");
  });

  it("honors explicit priority before distance", () => {
    const actions = getAvailableWorldActions(
      { x: 0, y: 0 },
      [
        { id: "ambient", label: "Ambient", kind: "chat", position: { x: 5, y: 0 } },
        { id: "quest", label: "Quest NPC", kind: "chat", position: { x: 25, y: 0 }, priority: 10 }
      ],
      60
    );
    expect(actions.chat?.id).toBe("quest");
  });

  it("describes disabled and enabled actions", () => {
    expect(describeWorldAction(null, "pickup")).toBe("Pick Up unavailable");
    expect(describeWorldAction({ id: "sword", label: "Bush Sword", kind: "pickup", position: { x: 0, y: 0 } }, "pickup"))
      .toBe("Pick Up: Bush Sword");
  });

  it("activates the objective marker only while its target is in range", () => {
    expect(canActivateObjectiveMarker({ x: 10, y: 10 }, { x: 68, y: 10 }, 58)).toBe(true);
    expect(canActivateObjectiveMarker({ x: 10, y: 10 }, { x: 69, y: 10 }, 58)).toBe(false);
    expect(canActivateObjectiveMarker({ x: 10, y: 10 }, null, 58)).toBe(false);
  });
});
