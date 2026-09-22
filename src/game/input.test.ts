import { describe, expect, it } from "vitest";
import { WALK_MAX_STRENGTH } from "./constants";
import { keyboardVector, movementVectorFromDisplacement, TOUCH_DEADZONE_PX, TOUCH_RADIUS } from "./input";

describe("automatic analog walk/run input", () => {
  it("returns no movement inside the joystick deadzone", () => {
    expect(movementVectorFromDisplacement(TOUCH_DEADZONE_PX - 0.01, 0)).toEqual({ x: 0, y: 0 });
  });

  it("keeps a deliberate inner-ring push in walking range", () => {
    const vector = movementVectorFromDisplacement(TOUCH_RADIUS * 0.2, 0);
    expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(0.2);
    expect(Math.hypot(vector.x, vector.y)).toBeLessThanOrEqual(WALK_MAX_STRENGTH);
  });

  it("moves an ordinary or maximum joystick push into running range", () => {
    for (const displacement of [TOUCH_RADIUS * 0.6, TOUCH_RADIUS * 2]) {
      const vector = movementVectorFromDisplacement(displacement, 0);
      expect(Math.hypot(vector.x, vector.y)).toBeGreaterThan(WALK_MAX_STRENGTH);
    }
    expect(movementVectorFromDisplacement(TOUCH_RADIUS * 2, 0)).toEqual({ x: 1, y: 0 });
  });

  it("reports directional keyboard input at full strength", () => {
    expect(keyboardVector(new Set(["KeyD"]))).toEqual({ x: 1, y: 0 });
    const diagonal = keyboardVector(new Set(["KeyW", "KeyD"]));
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
  });
});
