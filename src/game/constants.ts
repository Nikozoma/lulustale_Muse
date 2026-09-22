export const TILE_SIZE_PX = 32;
export const LOGICAL_CAMERA_HEIGHT = 360;
export const CORE_SAFE_VIEW = { width: 640, height: 360 } as const;
export const CHARACTER_CELL = { width: 96, height: 96 } as const;
export const ROOT_ANCHOR = { x: 48, y: 88 } as const;
export const INTERACTION_RADIUS_PX = 40;
export const WALK_MAX_STRENGTH = 0.3;
export const DEFAULT_PLAYER_SPEED_MULTIPLIER = 1.5;
export const MIN_PLAYER_SPEED_MULTIPLIER = 0.5;
export const MAX_PLAYER_SPEED_MULTIPLIER = 2;
export const PLAYER_SPEED_MULTIPLIER_STEP = 0.25;

export const PLAYER = {
  walkSpeedPxPerSecond: 144,
  runSpeedPxPerSecond: 240,
  collider: { width: 20, height: 12, centerOffsetY: -6 },
  frameWidth: CHARACTER_CELL.width,
  frameHeight: CHARACTER_CELL.height,
  rootAnchorX: ROOT_ANCHOR.x,
  rootAnchorY: ROOT_ANCHOR.y,
  walkFrameSeconds: 0.125,
  runFrameSeconds: 0.1,
  idleFrameSeconds: 0.25
} as const;

export function getPlayerMovementSpeed(running: boolean, multiplier = DEFAULT_PLAYER_SPEED_MULTIPLIER): number {
  const defaultSpeed = running ? PLAYER.runSpeedPxPerSecond : PLAYER.walkSpeedPxPerSecond;
  return defaultSpeed * (multiplier / DEFAULT_PLAYER_SPEED_MULTIPLIER);
}

export const BRUTUS = {
  walkSpeedPxPerSecond: 112,
  runSpeedPxPerSecond: 184,
  collider: { width: 24, height: 14, centerOffsetY: -7 },
  trailingDistancePx: 72,
  catchUpDistancePx: 160,
  fallbackDistancePx: 420,
  waypointSpacingPx: 8
} as const;
