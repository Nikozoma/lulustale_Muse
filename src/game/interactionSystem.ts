import type { WorldPoint } from "./foundation";

export type WorldActionKind = "use" | "chat" | "pickup";

export type WorldActionTarget = {
  id: string;
  label: string;
  kind: WorldActionKind;
  position: WorldPoint;
  priority?: number;
};

export type WorldActionAvailability = Record<WorldActionKind, WorldActionTarget | null>;

export const WORLD_ACTION_KINDS: WorldActionKind[] = ["use", "chat", "pickup"];

export const WORLD_ACTION_LABELS: Record<WorldActionKind, string> = {
  use: "Use",
  chat: "Chat",
  pickup: "Pick Up"
};

export function getAvailableWorldActions(
  playerPosition: WorldPoint,
  targets: readonly WorldActionTarget[],
  radius: number
): WorldActionAvailability {
  const result: WorldActionAvailability = { use: null, chat: null, pickup: null };
  const nearby = targets
    .map((target) => ({ target, distance: pointDistance(playerPosition, target.position) }))
    .filter(({ distance }) => distance <= radius)
    .sort((a, b) => {
      const priorityDelta = (b.target.priority ?? 0) - (a.target.priority ?? 0);
      return priorityDelta !== 0 ? priorityDelta : a.distance - b.distance;
    });

  for (const { target } of nearby) {
    if (!result[target.kind]) result[target.kind] = target;
  }
  return result;
}

export function canActivateObjectiveMarker(
  playerPosition: WorldPoint,
  targetPosition: WorldPoint | null,
  radius: number
): boolean {
  return targetPosition !== null && pointDistance(playerPosition, targetPosition) <= radius;
}

export function describeWorldAction(target: WorldActionTarget | null, kind: WorldActionKind): string {
  return target ? `${WORLD_ACTION_LABELS[kind]}: ${target.label}` : `${WORLD_ACTION_LABELS[kind]} unavailable`;
}

function pointDistance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
