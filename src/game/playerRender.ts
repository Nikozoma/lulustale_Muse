import type { WorldPoint } from "./world";
import type { Facing } from "./player";

export type PlayerAnimationSheet = "idle" | "walk";

export const PLAYER_DIRECTION_ROWS: Record<Facing, number> = {
  down: 0,
  left_down: 1,
  left: 2,
  left_up: 3,
  up: 4,
  right_up: 5,
  right: 6,
  right_down: 7
};

export function getPlayerFrameCrop(
  facing: Facing,
  isMoving: boolean,
  animationTime: number,
  frameSeconds: number,
  frameWidth: number,
  frameHeight: number,
  framesPerDirection: number
): { sheet: PlayerAnimationSheet; x: number; y: number; width: number; height: number; frameIndex: number } {
  const frameIndex = Math.floor(animationTime / frameSeconds) % framesPerDirection;
  return {
    sheet: isMoving ? "walk" : "idle",
    x: frameIndex * frameWidth,
    y: PLAYER_DIRECTION_ROWS[facing] * frameHeight,
    width: frameWidth,
    height: frameHeight,
    frameIndex
  };
}

export type PlayerSpriteDrawBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getPlayerSpriteDrawBox(
  root: WorldPoint,
  frameWidth: number,
  frameHeight: number,
  renderScale: number,
  rootAnchorX: number,
  rootAnchorY: number
): PlayerSpriteDrawBox {
  const width = frameWidth * renderScale;
  const height = frameHeight * renderScale;

  return {
    x: root.x - rootAnchorX * renderScale,
    y: root.y - rootAnchorY * renderScale,
    width,
    height
  };
}
