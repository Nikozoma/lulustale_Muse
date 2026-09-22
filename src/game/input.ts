import type { Size } from "./camera";
import type { WorldPoint } from "./foundation";

type TrackedPointer = { id: number; start: WorldPoint; current: WorldPoint };

export type TouchState = {
  active: boolean;
  start: WorldPoint;
  current: WorldPoint;
};

const KEYS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 }
} as const;

export const TOUCH_RADIUS = 58;
export const TOUCH_DEADZONE_PX = 5;

export function createInputController(canvas: HTMLCanvasElement, getViewport: () => Size) {
  const pressed = new Set<string>();
  const blockedKeys = new Set<string>();
  let movementPointer: TrackedPointer | null = null;
  let blockedPointerId: number | null = null;

  window.addEventListener("keydown", (event) => {
    if (event.code in KEYS) {
      if (!blockedKeys.has(event.code)) pressed.add(event.code);
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code in KEYS) {
      pressed.delete(event.code);
      blockedKeys.delete(event.code);
      event.preventDefault();
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (blockedPointerId !== null) return;
    const viewport = getViewport();
    const point = pointerToLogical(canvas, viewport, event);
    if (point.x > viewport.width / 2 || movementPointer) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    movementPointer = { id: event.pointerId, start: point, current: point };
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!movementPointer || movementPointer.id !== event.pointerId) {
      return;
    }
    movementPointer.current = pointerToLogical(canvas, getViewport(), event);
    event.preventDefault();
  });
  const clearPointer = (event: PointerEvent) => {
    if (movementPointer?.id === event.pointerId) {
      movementPointer = null;
      event.preventDefault();
    }
  };
  const clearBlockedPointer = (event: PointerEvent) => {
    if (blockedPointerId === event.pointerId) {
      blockedPointerId = null;
      event.preventDefault();
    }
  };
  canvas.addEventListener("pointerup", clearPointer);
  canvas.addEventListener("pointercancel", clearPointer);
  canvas.addEventListener("lostpointercapture", clearPointer);
  window.addEventListener("pointerup", clearBlockedPointer);
  window.addEventListener("pointercancel", clearBlockedPointer);

  return {
    getMoveVector(): WorldPoint {
      const keyboard = keyboardVector(pressed);
      if (keyboard.x !== 0 || keyboard.y !== 0 || !movementPointer) {
        return keyboard;
      }
      return movementVectorFromDisplacement(
        movementPointer.current.x - movementPointer.start.x,
        movementPointer.current.y - movementPointer.start.y
      );
    },
    getTouchState(): TouchState {
      return movementPointer
        ? { active: true, start: movementPointer.start, current: movementPointer.current }
        : { active: false, start: { x: 0, y: 0 }, current: { x: 0, y: 0 } };
    },
    resetMovementInput(): void {
      for (const code of pressed) blockedKeys.add(code);
      pressed.clear();
      if (movementPointer) blockedPointerId = movementPointer.id;
      movementPointer = null;
    }
  };
}

export function movementVectorFromDisplacement(dx: number, dy: number): WorldPoint {
  const length = Math.hypot(dx, dy);
  if (length < TOUCH_DEADZONE_PX) {
    return { x: 0, y: 0 };
  }
  const strength = Math.min(length / TOUCH_RADIUS, 1);
  return { x: (dx / length) * strength, y: (dy / length) * strength };
}

export function keyboardVector(pressed: ReadonlySet<string>): WorldPoint {
  let x = 0;
  let y = 0;
  for (const code of pressed) {
    const vector = KEYS[code as keyof typeof KEYS];
    if (vector) {
      x += vector.x;
      y += vector.y;
    }
  }
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

function pointerToLogical(canvas: HTMLCanvasElement, viewport: Size, event: PointerEvent): WorldPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * viewport.width,
    y: ((event.clientY - rect.top) / rect.height) * viewport.height
  };
}
