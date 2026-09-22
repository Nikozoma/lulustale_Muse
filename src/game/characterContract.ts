export const CHARACTER_DIRECTIONS = [
  "Down",
  "Down-Left",
  "Left",
  "Up-Left",
  "Up",
  "Up-Right",
  "Right",
  "Down-Right"
] as const;

export type CharacterDirection = (typeof CHARACTER_DIRECTIONS)[number];
export const LULU_VISUAL_DIRECTIONS = [
  "Down",
  "Down-Left",
  "Up-Left",
  "Up",
  "Up-Right",
  "Down-Right"
] as const satisfies readonly CharacterDirection[];
export type LuluVisualDirection = (typeof LULU_VISUAL_DIRECTIONS)[number];
export type CharacterActionCategory =
  | "idle"
  | "locomotion"
  | "interaction"
  | "transition"
  | "battle"
  | "reaction"
  | "custom";
export type CharacterPlaybackMode = "loop" | "once" | "hold" | "transition";

export type RuntimeFrameContract = {
  durationMs: number;
  root: [number, number];
  visualOffset: [number, number];
  grounded: boolean;
  contact?: "left" | "right" | "both" | "none";
  anchors: Array<{
    id: string;
    role: string;
    point: [number, number];
    rotationDeg?: number;
    scale?: number;
    drawOrder?: "behind" | "body" | "front";
  }>;
  events: Array<{ id: string; type: string; payload?: string }>;
};

export type RuntimeCharacterActionContract = {
  id: string;
  category: CharacterActionCategory;
  playback: CharacterPlaybackMode;
  directionMode: "eight" | "explicit" | "single";
  sheet: string;
  cell: [number, number];
  directions: CharacterDirection[];
  framesPerDirection: number;
  loop: [number, number];
  entryFrame: number;
  stopPolicy: "idle_entry" | "finish_to_contact" | "transition";
  transitionActionId?: string;
  cycleDistancePx?: number;
  tracks: Partial<Record<CharacterDirection, RuntimeFrameContract[]>>;
};

export type RuntimeCharacterManifestContract = {
  schema: "lulus-character-runtime";
  version: 2;
  id: string;
  displayName: string;
  characterClass: "humanoid" | "canine" | "bird" | "animal" | "custom";
  species?: string;
  status: "reference_only" | "in_production" | "runtime_ready" | "deprecated";
  collisionProfileId: string;
  renderScales: Record<string, number>;
  actions: Record<string, RuntimeCharacterActionContract>;
  portraits?: Array<{
    id: string;
    expression: string;
    image: string;
    crop: [number, number, number, number];
    alphaRequired: boolean;
  }>;
  sourceProject: { path: string; revision: number };
};

export type CharacterIndexContract = {
  schema: "lulus-character-index";
  version: 1;
  characters: Array<{
    id: string;
    displayName: string;
    characterClass: RuntimeCharacterManifestContract["characterClass"];
    status: RuntimeCharacterManifestContract["status"];
    manifest: string;
  }>;
};

export type PlaybackCursor = {
  elapsedMs: number;
  distancePx: number;
  frameIndex: number;
  completed: boolean;
};

export type CharacterPlaybackState = {
  action: string;
  direction: CharacterDirection;
  normalizedPhase: number;
  distanceAccumulatorPx: number;
  transitionState: "none" | "entering" | "playing" | "exiting";
  eventCursor: number;
};

const DIRECTION_CENTERS: Readonly<Record<CharacterDirection, number>> = {
  Down: Math.PI / 2,
  "Down-Left": (3 * Math.PI) / 4,
  Left: Math.PI,
  "Up-Left": (-3 * Math.PI) / 4,
  Up: -Math.PI / 2,
  "Up-Right": -Math.PI / 4,
  Right: 0,
  "Down-Right": Math.PI / 4
};

export function directionForVectorWithHysteresis(
  vector: { x: number; y: number },
  current: CharacterDirection,
  hysteresisDegrees = 10
): CharacterDirection {
  if (Math.hypot(vector.x, vector.y) < 0.001) return current;
  const angle = Math.atan2(vector.y, vector.x);
  const currentDifference = angularDifference(angle, DIRECTION_CENTERS[current]);
  const holdThreshold = Math.PI / 8 + (hysteresisDegrees * Math.PI) / 180;
  if (currentDifference <= holdThreshold) return current;
  return CHARACTER_DIRECTIONS.reduce((best, candidate) =>
    angularDifference(angle, DIRECTION_CENTERS[candidate]) <
    angularDifference(angle, DIRECTION_CENTERS[best])
      ? candidate
      : best
  );
}

export function luluVisualDirectionForVectorWithHysteresis(
  vector: { x: number; y: number },
  current: CharacterDirection,
  hysteresisDegrees = 10
): LuluVisualDirection {
  const normalizedCurrent = normalizeLuluVisualDirection(current);
  if (Math.hypot(vector.x, vector.y) < 0.001) return normalizedCurrent;

  // Pure horizontal input sits exactly between the two neighboring diagonals.
  // Preserve the current vertical hemisphere so steady horizontal movement
  // cannot alternate rows because of tiny joystick Y noise.
  if (Math.abs(vector.y) < 0.001) {
    const upperHemisphere =
      normalizedCurrent === "Up" ||
      normalizedCurrent === "Up-Left" ||
      normalizedCurrent === "Up-Right";
    if (vector.x < 0) return upperHemisphere ? "Up-Left" : "Down-Left";
    return upperHemisphere ? "Up-Right" : "Down-Right";
  }

  const angle = Math.atan2(vector.y, vector.x);
  const candidate = LULU_VISUAL_DIRECTIONS.reduce((best, direction) =>
    angularDifference(angle, DIRECTION_CENTERS[direction]) <
    angularDifference(angle, DIRECTION_CENTERS[best])
      ? direction
      : best
  );
  if (candidate === normalizedCurrent) return candidate;

  const hysteresis = (hysteresisDegrees * Math.PI) / 180;
  const currentDifference = angularDifference(
    angle,
    DIRECTION_CENTERS[normalizedCurrent]
  );
  const candidateDifference = angularDifference(
    angle,
    DIRECTION_CENTERS[candidate]
  );
  return candidateDifference + hysteresis < currentDifference
    ? candidate
    : normalizedCurrent;
}

export function normalizeLuluVisualDirection(
  direction: CharacterDirection
): LuluVisualDirection {
  if (direction === "Left") return "Down-Left";
  if (direction === "Right") return "Down-Right";
  return direction;
}

export function angularDifference(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function frameIndexFromDistance(
  distancePx: number,
  cycleDistancePx: number,
  frameCount: number,
  entryFrame = 0
): number {
  if (frameCount <= 0) return 0;
  if (cycleDistancePx <= 0) return clampFrame(entryFrame, frameCount);
  const wrapped = ((distancePx % cycleDistancePx) + cycleDistancePx) % cycleDistancePx;
  return (clampFrame(entryFrame, frameCount) + Math.floor((wrapped / cycleDistancePx) * frameCount)) % frameCount;
}

export function frameIndexFromElapsed(
  elapsedMs: number,
  frames: readonly Pick<RuntimeFrameContract, "durationMs">[],
  playback: CharacterPlaybackMode,
  loop: readonly [number, number],
  entryFrame = 0
): { frameIndex: number; completed: boolean } {
  if (frames.length === 0) return { frameIndex: 0, completed: true };
  const start = Math.max(0, Math.min(loop[0], frames.length - 1));
  const end = Math.max(start, Math.min(loop[1], frames.length - 1));
  const initial = clampFrame(entryFrame, frames.length);
  if (elapsedMs <= 0) return { frameIndex: initial, completed: false };

  const initialEnd = initial < start ? start - 1 : end;
  const initialDuration = frames
    .slice(initial, initialEnd + 1)
    .reduce((total, frame) => total + Math.max(1, frame.durationMs), 0);
  if (elapsedMs < initialDuration) {
    return { frameIndex: walkDurations(frames, initial, initialEnd, elapsedMs), completed: false };
  }
  const loopElapsed = elapsedMs - initialDuration;
  const range = frames.slice(start, end + 1);
  const rangeDuration = range.reduce((total, frame) => total + Math.max(1, frame.durationMs), 0);
  if (playback === "loop") {
    return { frameIndex: walkDurations(frames, start, end, loopElapsed % rangeDuration), completed: false };
  }
  return { frameIndex: end, completed: true };
}

function walkDurations(
  frames: readonly Pick<RuntimeFrameContract, "durationMs">[],
  start: number,
  end: number,
  elapsedMs: number
): number {
  let remaining = elapsedMs;
  for (let index = start; index <= end; index += 1) {
    const duration = Math.max(1, frames[index]?.durationMs ?? 1);
    if (remaining < duration) return index;
    remaining -= duration;
  }
  return Math.max(start, end);
}

function clampFrame(frame: number, frameCount: number): number {
  return Math.max(0, Math.min(Math.floor(frame), frameCount - 1));
}

export function spriteDrawBox(
  root: { x: number; y: number },
  cell: readonly [number, number],
  anchor: readonly [number, number],
  visualOffset: readonly [number, number],
  renderScale: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(root.x - anchor[0] * renderScale + visualOffset[0] * renderScale),
    y: Math.round(root.y - anchor[1] * renderScale + visualOffset[1] * renderScale),
    width: cell[0] * renderScale,
    height: cell[1] * renderScale
  };
}

export function attachmentTransform(
  root: { x: number; y: number },
  frame: Pick<RuntimeFrameContract, "root" | "visualOffset">,
  anchor: RuntimeFrameContract["anchors"][number],
  renderScale: number
): { x: number; y: number; rotationDeg: number; scale: number; drawOrder: "behind" | "body" | "front" } {
  return {
    x: Math.round(root.x + (anchor.point[0] - frame.root[0] + frame.visualOffset[0]) * renderScale),
    y: Math.round(root.y + (anchor.point[1] - frame.root[1] + frame.visualOffset[1]) * renderScale),
    rotationDeg: anchor.rotationDeg ?? 0,
    scale: (anchor.scale ?? 1) * renderScale,
    drawOrder: anchor.drawOrder ?? "front"
  };
}

export function directionRow(action: RuntimeCharacterActionContract, direction: CharacterDirection): number {
  const exact = action.directions.indexOf(direction);
  if (exact >= 0) return exact;
  if (action.directionMode === "single") return 0;
  throw new Error(`${action.id} does not author direction ${direction}.`);
}

export function validateRuntimeCharacterManifest(manifest: RuntimeCharacterManifestContract): string[] {
  const errors: string[] = [];
  if (manifest.schema !== "lulus-character-runtime" || manifest.version !== 2) {
    errors.push("Unsupported character runtime manifest.");
  }
  if (Object.keys(manifest.renderScales).length === 0) {
    errors.push(`${manifest.id} has no authored render scales.`);
  }
  for (const [context, scale] of Object.entries(manifest.renderScales)) {
    if (!Number.isFinite(scale) || scale <= 0) {
      errors.push(`${manifest.id} has an invalid ${context} render scale.`);
    }
  }
  if (manifest.status !== "runtime_ready") errors.push(`${manifest.id} is not runtime-ready.`);
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    if (action.id !== actionId) errors.push(`Action key ${actionId} does not match ${action.id}.`);
    if (action.directions.length === 0) errors.push(`${actionId} has no directions.`);
    if (action.framesPerDirection <= 0) errors.push(`${actionId} has no frames.`);
    if (action.category === "locomotion" && !action.cycleDistancePx) {
      errors.push(`${actionId} locomotion has no cycle distance.`);
    }
    for (const direction of action.directions) {
      const frames = action.tracks[direction];
      if (frames?.length !== action.framesPerDirection) {
        errors.push(`${actionId}/${direction} does not match framesPerDirection.`);
      }
      for (const frame of frames ?? []) {
        for (const anchor of frame.anchors) {
          if (
            !Number.isFinite(anchor.point[0]) ||
            !Number.isFinite(anchor.point[1]) ||
            anchor.point[0] < 0 ||
            anchor.point[1] < 0 ||
            anchor.point[0] > action.cell[0] ||
            anchor.point[1] > action.cell[1]
          ) {
            errors.push(`${actionId}/${direction} anchor ${anchor.id} is outside the authored cell.`);
          }
        }
      }
    }
  }
  return errors;
}
