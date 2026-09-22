import { DEFAULT_PLAYER_SPEED_MULTIPLIER, PLAYER, WALK_MAX_STRENGTH, getPlayerMovementSpeed } from "./constants";
import {
  directionForVectorWithHysteresis,
  luluVisualDirectionForVectorWithHysteresis,
  normalizeLuluVisualDirection,
  type CharacterDirection,
  type LuluVisualDirection
} from "./characterContract";
import { canOccupy, type RuntimeMap, type WorldPoint } from "./foundation";

export type Facing = "down" | "left_down" | "left" | "left_up" | "up" | "right_up" | "right" | "right_down";

export type PlayerState = {
  position: WorldPoint;
  facing: Facing;
  visualFacing: LuluVisualDirection;
  isMoving: boolean;
  isRunning: boolean;
  animationTime: number;
  animationDistance: number;
  action: string | null;
  actionTime: number;
};

export function createPlayer(position: WorldPoint, facing: Facing = "down"): PlayerState {
  return {
    position: { ...position },
    facing,
    visualFacing: normalizeLuluVisualDirection(directionForFacing(facing)),
    isMoving: false,
    isRunning: false,
    animationTime: 0,
    animationDistance: 0,
    action: null,
    actionTime: 0
  };
}

export function updatePlayer(
  player: PlayerState,
  inputVector: WorldPoint,
  dt: number,
  map: RuntimeMap,
  speedMultiplier = DEFAULT_PLAYER_SPEED_MULTIPLIER
): void {
  if (player.action) {
    player.isMoving = false;
    player.isRunning = false;
    player.actionTime += dt;
    return;
  }

  const movement = normalizeMovementInput(inputVector);
  if (movement.strength < 0.001) {
    const wasMoving = player.isMoving;
    player.isMoving = false;
    player.isRunning = false;
    if (wasMoving) {
      player.animationTime = 0;
      player.animationDistance = 0;
    } else {
      player.animationTime += dt;
    }
    return;
  }

  const wasMoving = player.isMoving;
  const previousPosition = { ...player.position };
  const running = movement.strength > WALK_MAX_STRENGTH;
  const speed = getPlayerMovementSpeed(running, speedMultiplier) * movement.strength;
  const distance = speed * dt;
  const nextX = { x: player.position.x + movement.direction.x * distance, y: player.position.y };
  const nextY = { x: player.position.x, y: player.position.y + movement.direction.y * distance };

  if (canOccupy(map, nextX, PLAYER.collider)) {
    player.position.x = nextX.x;
  }
  if (canOccupy(map, nextY, PLAYER.collider)) {
    player.position.y = nextY.y;
  }

  const traveled = Math.hypot(player.position.x - previousPosition.x, player.position.y - previousPosition.y);
  player.facing = facingFromVectorWithHysteresis(movement.direction, player.facing);
  player.visualFacing = luluVisualDirectionForVectorWithHysteresis(
    movement.direction,
    player.visualFacing
  );
  player.isMoving = traveled > 0.001;
  player.isRunning = player.isMoving && running;
  if (!wasMoving && player.isMoving) {
    player.animationTime = 0;
    player.animationDistance = 0;
  }
  if (player.isMoving) {
    player.animationTime += dt;
    player.animationDistance += traveled;
  }
}

export function facingFromVector(vector: WorldPoint): Facing {
  if (Math.abs(vector.x) < 0.35) {
    return vector.y < 0 ? "up" : "down";
  }
  if (vector.x < 0) {
    if (Math.abs(vector.y) < 0.25) {
      return "left";
    }
    return vector.y < -0.25 ? "left_up" : "left_down";
  }
  if (Math.abs(vector.y) < 0.25) {
    return "right";
  }
  return vector.y < -0.25 ? "right_up" : "right_down";
}

export function facingFromVectorWithHysteresis(vector: WorldPoint, current: Facing): Facing {
  return facingForDirection(
    directionForVectorWithHysteresis(vector, directionForFacing(current))
  );
}

function directionForFacing(facing: Facing): CharacterDirection {
  return {
    down: "Down",
    left_down: "Down-Left",
    left: "Left",
    left_up: "Up-Left",
    up: "Up",
    right_up: "Up-Right",
    right: "Right",
    right_down: "Down-Right"
  }[facing] as CharacterDirection;
}

function facingForDirection(direction: CharacterDirection): Facing {
  return {
    Down: "down",
    "Down-Left": "left_down",
    Left: "left",
    "Up-Left": "left_up",
    Up: "up",
    "Up-Right": "right_up",
    Right: "right",
    "Down-Right": "right_down"
  }[direction] as Facing;
}

function normalizeMovementInput(inputVector: WorldPoint): { direction: WorldPoint; strength: number } {
  const length = Math.hypot(inputVector.x, inputVector.y);
  if (length < 0.001) {
    return { direction: { x: 0, y: 0 }, strength: 0 };
  }
  return {
    direction: { x: inputVector.x / length, y: inputVector.y / length },
    strength: Math.min(length, 1)
  };
}
