import {
  directionNameForFacing,
  facingForDirectionName,
  findAnimationEventFrame,
  getAnimationAnchorPosition,
  getAnimationDurationSeconds,
  getAnimationEventTimeSeconds,
  type CharacterAssets,
  type CompanionInteractions,
  type DirectionName
} from "./characterAssets";
import { frameIndexFromElapsed } from "./characterContract";
import { BRUTUS } from "./constants";
import {
  canOccupy,
  findSafePlacement,
  type RuntimeMap,
  type WorldPoint
} from "./foundation";
import { facingFromVectorWithHysteresis, type Facing, type PlayerState } from "./player";

export type CompanionMode = "follow" | "stay";
export type CompanionCommand = "sit" | "follow" | "lay";
export type CompanionInteractionName = "petting" | "feeding" | "companion_command";
export type CompanionActionName = "pet" | "feed" | "sit" | "follow" | "lay" | "fetch";

type ActiveInteraction = {
  name: CompanionInteractionName;
  elapsed: number;
  duration: number;
  priorMode: CompanionMode;
  direction: DirectionName;
  commandIntent?: CompanionCommand;
};

type ActiveFetch = {
  phase: "throwing" | "chasing" | "returning";
  elapsed: number;
  throwDuration: number;
  priorMode: CompanionMode;
  direction: DirectionName;
  toyStart: WorldPoint;
  toyPosition: WorldPoint;
  toyTarget: WorldPoint;
};

export type CompanionState = {
  position: WorldPoint;
  facing: Facing;
  isMoving: boolean;
  isRunning: boolean;
  animationTime: number;
  animationDistance: number;
  action: string | null;
  actionTime: number;
  mode: CompanionMode;
  commandPose: "sit" | "lay" | null;
  pathHistory: WorldPoint[];
  idleTime: number;
  stuckTime: number;
  postActionTime: number;
  interaction: ActiveInteraction | null;
  fetch: ActiveFetch | null;
  homeRoamTarget: WorldPoint | null;
  homeRoamDwellTime: number;
  homeRoamIndex: number;
  fallbackCount: number;
};

export type InteractionStartResult = { ok: true } | { ok: false; reason: string };
type InteractionCharacterAssets = Pick<CharacterAssets, "lulu" | "brutus">;

export function createCompanion(position: WorldPoint, facing: Facing = "down"): CompanionState {
  return {
    position: { ...position },
    facing,
    isMoving: false,
    isRunning: false,
    animationTime: 0,
    animationDistance: 0,
    action: null,
    actionTime: 0,
    mode: "follow",
    commandPose: null,
    pathHistory: [{ ...position }],
    idleTime: 0,
    stuckTime: 0,
    postActionTime: 0,
    interaction: null,
    fetch: null,
    homeRoamTarget: null,
    homeRoamDwellTime: 0,
    homeRoamIndex: 0,
    fallbackCount: 0
  };
}

export function restoreCompanionCommandState(
  companion: CompanionState,
  saved: { mode: CompanionMode; commandPose?: "sit" | "lay" | null }
): void {
  companion.mode = saved.mode;
  companion.commandPose = saved.mode === "stay" ? (saved.commandPose === "lay" ? "lay" : "sit") : null;
  companion.action = saved.mode === "stay" ? (companion.commandPose === "lay" ? "lay_rest" : "sit") : null;
  companion.actionTime = 0;
}

export function setCompanionIntroRestState(companion: CompanionState): void {
  companion.mode = "stay";
  companion.commandPose = "lay";
  companion.isMoving = false;
  companion.isRunning = false;
  companion.action = "lay_rest";
  companion.actionTime = 0;
  companion.interaction = null;
  companion.fetch = null;
}

export function resetCompanionForMap(
  companion: CompanionState,
  map: RuntimeMap,
  playerPosition: WorldPoint,
  preferredPosition?: WorldPoint
): void {
  const safe = findSafePlacement(map, preferredPosition ?? { x: playerPosition.x - 48, y: playerPosition.y + 36 }, BRUTUS.collider);
  const fallback = safe ?? findSafePlacement(map, playerPosition, BRUTUS.collider);
  if (!fallback) {
    throw new Error(`No safe Brutus placement exists near the ${map.id} destination spawn.`);
  }
  companion.position = { ...fallback };
  companion.pathHistory = [{ ...fallback }, { ...playerPosition }];
  companion.mode = "follow";
  companion.commandPose = null;
  companion.isMoving = false;
  companion.isRunning = false;
  companion.animationTime = 0;
  companion.animationDistance = 0;
  companion.action = null;
  companion.actionTime = 0;
  companion.interaction = null;
  companion.fetch = null;
  companion.homeRoamTarget = null;
  companion.homeRoamDwellTime = 0;
  companion.postActionTime = 0;
  companion.stuckTime = 0;
  companion.idleTime = 0;
}

export function updateCompanion(
  companion: CompanionState,
  player: PlayerState,
  dt: number,
  map: RuntimeMap,
  interactions: CompanionInteractions
): void {
  recordPlayerPath(companion, player.position);

  if (companion.fetch) {
    updateFetch(companion, player, dt, map, interactions);
    return;
  }

  if (companion.interaction) {
    updateInteraction(companion, player, dt, interactions);
    return;
  }

  if (companion.postActionTime > 0) {
    companion.postActionTime = Math.max(0, companion.postActionTime - dt);
    companion.actionTime += dt;
    companion.isMoving = false;
    if (companion.postActionTime === 0) {
      companion.action = companion.mode === "stay" ? (companion.commandPose === "lay" ? "lay_rest" : "sit") : null;
      companion.actionTime = 0;
    }
    return;
  }

  if (companion.mode === "stay") {
    companion.isMoving = false;
    companion.isRunning = false;
    companion.action = companion.commandPose === "lay" ? "lay_rest" : "sit";
    companion.actionTime += dt;
    companion.homeRoamTarget = null;
    companion.homeRoamDwellTime = 0;
    return;
  }

  if (map.id !== "home" || player.isMoving || player.action) {
    companion.homeRoamTarget = null;
    companion.homeRoamDwellTime = 0;
  }

  if (map.id === "home" && !player.isMoving && !player.action && companion.homeRoamTarget) {
    updateHomeAmbientRoam(companion, player, dt, map);
    return;
  }

  const playerDistance = distance(companion.position, player.position);
  if (playerDistance > BRUTUS.fallbackDistancePx || companion.stuckTime > 1.5) {
    recoverToRecentPath(companion, player, map);
  }

  const target = trailingTarget(companion.pathHistory, BRUTUS.trailingDistancePx);
  const targetDistance = distance(companion.position, target);
  if (targetDistance <= 10) {
    companion.isMoving = false;
    companion.isRunning = false;
    companion.idleTime += dt;
    companion.animationTime += dt;

    if (map.id === "home" && !player.isMoving && playerDistance <= 140 && companion.idleTime >= 4) {
      const ambientTarget = nextHomeAmbientTarget(companion, map);
      if (ambientTarget && distance(ambientTarget, companion.position) > 28) {
        companion.homeRoamTarget = ambientTarget;
        companion.homeRoamDwellTime = 0;
        companion.idleTime = 0;
        companion.action = null;
        companion.actionTime = 0;
        return;
      }
    }

    companion.action = companion.idleTime >= 10 ? "lay_rest" : companion.idleTime >= 4 ? "sit" : null;
    companion.actionTime += dt;
    companion.stuckTime = 0;
    return;
  }

  companion.idleTime = 0;
  companion.action = null;
  companion.actionTime = 0;
  const run = playerDistance > BRUTUS.catchUpDistancePx;
  const speed = run ? BRUTUS.runSpeedPxPerSecond : BRUTUS.walkSpeedPxPerSecond;
  const wasMoving = companion.isMoving;
  const traveled = moveToward(companion, target, speed * dt, map);
  companion.isMoving = traveled > 0;
  companion.isRunning = traveled > 0 && run;
  if (traveled > 0) {
    if (!wasMoving) companion.animationDistance = 0;
    companion.animationTime += dt;
    companion.animationDistance += traveled;
  }
  companion.stuckTime = traveled > 0 ? 0 : companion.stuckTime + dt;
}

export function beginCompanionInteraction(
  name: CompanionInteractionName,
  companion: CompanionState,
  player: PlayerState,
  map: RuntimeMap,
  interactions: CompanionInteractions,
  characterAssets?: InteractionCharacterAssets
): InteractionStartResult {
  return beginSynchronizedInteraction(name, companion, player, map, interactions, characterAssets);
}

export function beginCompanionCommand(
  command: CompanionCommand,
  companion: CompanionState,
  player: PlayerState,
  map: RuntimeMap,
  interactions: CompanionInteractions,
  characterAssets?: InteractionCharacterAssets
): InteractionStartResult {
  return beginSynchronizedInteraction("companion_command", companion, player, map, interactions, characterAssets, command);
}

export function beginFetch(
  companion: CompanionState,
  player: PlayerState,
  map: RuntimeMap,
  interactions: CompanionInteractions,
  characterAssets?: InteractionCharacterAssets
): InteractionStartResult {
  if (companion.interaction || companion.fetch || player.action) {
    return { ok: false, reason: "Lulu and Brutus are already busy." };
  }
  if (distance(companion.position, player.position) > 136) {
    return { ok: false, reason: "Brutus is too far away. Let him catch up first." };
  }
  const definition = interactions.interactions.play_fetch_preparation;
  if (!definition) {
    return { ok: false, reason: "Fetch interaction metadata is unavailable." };
  }
  const direction = player.visualFacing;
  const alignment = definition.per_direction[direction];
  const readyOffset = alignment.brutus_play_ready_relative_offset ?? alignment.brutus_relative_offset;
  const alignedPosition = {
    x: player.position.x + readyOffset[0],
    y: player.position.y + readyOffset[1]
  };
  if (!canOccupy(map, alignedPosition, BRUTUS.collider)) {
    return { ok: false, reason: "There is not enough clear space for fetch here." };
  }
  const toyTarget = findFetchTarget(map, player.position, alignedPosition, player.facing);
  if (!toyTarget) {
    return { ok: false, reason: "Brutus needs a little more open space to play fetch." };
  }
  const luluThrow = characterAssets?.lulu.get(definition.lulu_animation);
  const releaseEventId = definition.event_ids?.lulu_throw_release;
  const releaseMatch =
    luluThrow && releaseEventId
      ? findAnimationEventFrame(luluThrow, alignment.lulu_facing, releaseEventId)
      : null;
  const authoredThrowOrigin =
    luluThrow && definition.anchor_ids?.lulu_throw_origin
      ? getAnimationAnchorPosition(
          luluThrow,
          alignment.lulu_facing,
          releaseMatch?.frameIndex ?? 0,
          definition.anchor_ids.lulu_throw_origin,
          player.position,
          map.id
        )
      : null;
  const throwOffset = alignment.lulu_throw_origin_local ?? [0, -36];
  const toyStart = authoredThrowOrigin ?? {
    x: player.position.x + throwOffset[0],
    y: player.position.y + throwOffset[1]
  };
  const releaseFrame = definition.synchronization.throw_release_frame ?? 2;
  const authoredThrowDuration =
    luluThrow && releaseEventId
      ? getAnimationEventTimeSeconds(luluThrow, alignment.lulu_facing, releaseEventId, "end")
      : null;
  const throwDuration = Math.max(
    0.3,
    authoredThrowDuration ?? ((releaseFrame + 1) * definition.synchronization.frame_ms) / 1000
  );

  companion.position = alignedPosition;
  companion.facing = facingForDirectionName(alignment.brutus_facing);
  companion.isMoving = false;
  companion.isRunning = false;
  companion.action = definition.brutus_animation;
  companion.actionTime = 0;
  companion.fetch = {
    phase: "throwing",
    elapsed: 0,
    throwDuration,
    priorMode: companion.mode,
    direction,
    toyStart,
    toyPosition: { ...toyStart },
    toyTarget
  };
  companion.homeRoamTarget = null;
  companion.homeRoamDwellTime = 0;
  player.action = definition.lulu_animation;
  player.actionTime = 0;
  player.isMoving = false;
  player.isRunning = false;
  return { ok: true };
}

export function getFeedingPropPosition(
  companion: CompanionState,
  player: PlayerState,
  interactions: CompanionInteractions,
  characterAssets?: InteractionCharacterAssets
): WorldPoint | null {
  const active = companion.interaction;
  if (!active || active.name !== "feeding") {
    return null;
  }
  const definition = interactions.interactions.feeding;
  const luluFeed = characterAssets?.lulu.get(definition.lulu_animation);
  const spawnEventId = definition.event_ids?.lulu_food_spawn;
  const spawnTime =
    luluFeed && spawnEventId
      ? getAnimationEventTimeSeconds(luluFeed, definition.per_direction[active.direction].lulu_facing, spawnEventId) ??
        ((definition.synchronization.food_spawn_frame ?? 0) * definition.synchronization.frame_ms) / 1000
      : ((definition.synchronization.food_spawn_frame ?? 0) * definition.synchronization.frame_ms) / 1000;
  if (active.elapsed < spawnTime) {
    return null;
  }
  const offset = definition.per_direction[active.direction].food_placement_relative_to_lulu_root;
  return offset ? { x: player.position.x + offset[0], y: player.position.y + offset[1] } : null;
}

export function getFetchToyPosition(
  companion: CompanionState,
  interactions: CompanionInteractions,
  characterAssets?: InteractionCharacterAssets,
  renderContext: RuntimeMap["id"] = "overworld"
): WorldPoint | null {
  const fetch = companion.fetch;
  if (!fetch) return null;
  if (fetch.phase !== "returning") return { ...fetch.toyPosition };
  const definition = interactions.interactions.play_fetch_preparation;
  const facing = directionNameForFacing(companion.facing);
  const carry = characterAssets?.brutus.get("carry_pose");
  const carryFrames = carry?.tracks[facing] ?? carry?.tracks[carry?.directions[0] ?? "Down"] ?? [];
  const carryFrameIndex =
    carry && carryFrames.length > 0
      ? frameIndexFromElapsed(
          companion.actionTime * 1000,
          carryFrames,
          carry.playback,
          carry.loop,
          carry.entryFrame
        ).frameIndex
      : 0;
  const authoredMouth =
    carry && definition?.anchor_ids?.brutus_mouth
      ? getAnimationAnchorPosition(
          carry,
          facing,
          carryFrameIndex,
          definition.anchor_ids.brutus_mouth,
          companion.position,
          renderContext
        )
      : null;
  if (authoredMouth) return authoredMouth;
  const offset = definition?.per_direction[facing]?.brutus_mouth_anchor_local ?? [0, -24];
  return { x: companion.position.x + offset[0], y: companion.position.y + offset[1] };
}

function beginSynchronizedInteraction(
  name: CompanionInteractionName,
  companion: CompanionState,
  player: PlayerState,
  map: RuntimeMap,
  interactions: CompanionInteractions,
  characterAssets?: InteractionCharacterAssets,
  commandIntent?: CompanionCommand
): InteractionStartResult {
  if (companion.interaction || companion.fetch || player.action) {
    return { ok: false, reason: "Lulu and Brutus are already busy." };
  }
  if (distance(companion.position, player.position) > 136) {
    return { ok: false, reason: "Brutus is too far away. Let him catch up first." };
  }
  const definition = interactions.interactions[name];
  if (!definition) {
    return { ok: false, reason: `The ${name} metadata is unavailable.` };
  }
  const direction = player.visualFacing;
  const alignment = definition.per_direction[direction];
  const alignedPosition = {
    x: player.position.x + alignment.brutus_relative_offset[0],
    y: player.position.y + alignment.brutus_relative_offset[1]
  };
  if (!canOccupy(map, alignedPosition, BRUTUS.collider)) {
    return { ok: false, reason: "There is not enough clear space for that interaction here." };
  }

  companion.position = alignedPosition;
  companion.facing = facingForDirectionName(alignment.brutus_facing);
  companion.isMoving = false;
  companion.isRunning = false;
  companion.action = definition.brutus_animation;
  companion.actionTime = 0;
  player.action = definition.lulu_animation;
  player.actionTime = 0;
  player.isMoving = false;
  player.isRunning = false;
  const frameCount = definition.synchronization.total_frames ?? 4;
  const luluAction = characterAssets?.lulu.get(definition.lulu_animation);
  const brutusAction = characterAssets?.brutus.get(definition.brutus_animation);
  const authoredDuration = Math.max(
    luluAction ? getAnimationDurationSeconds(luluAction, alignment.lulu_facing) : 0,
    brutusAction ? getAnimationDurationSeconds(brutusAction, alignment.brutus_facing) : 0
  );
  companion.interaction = {
    name,
    elapsed: 0,
    duration: authoredDuration || (definition.synchronization.frame_ms * frameCount) / 1000,
    priorMode: companion.mode,
    direction,
    commandIntent
  };
  companion.homeRoamTarget = null;
  companion.homeRoamDwellTime = 0;
  return { ok: true };
}

function updateInteraction(
  companion: CompanionState,
  player: PlayerState,
  dt: number,
  interactions: CompanionInteractions
): void {
  const active = companion.interaction;
  if (!active) {
    return;
  }
  active.elapsed += dt;
  companion.actionTime += dt;
  player.actionTime += dt;
  if (active.elapsed < active.duration) {
    return;
  }

  player.action = null;
  player.actionTime = 0;
  if (active.name === "companion_command") {
    const command = active.commandIntent ?? (active.priorMode === "follow" ? "sit" : "follow");
    if (command === "follow") {
      companion.mode = "follow";
      companion.commandPose = null;
      companion.action = active.priorMode === "stay" ? "sit_to_stand" : "happy_excited";
    } else if (command === "lay") {
      companion.mode = "stay";
      companion.commandPose = "lay";
      companion.action = "stand_to_lay";
    } else {
      companion.mode = "stay";
      companion.commandPose = "sit";
      companion.action = "stand_to_sit";
    }
    companion.postActionTime = 0.52;
  } else {
    companion.mode = active.priorMode;
    companion.action = "happy_excited";
    companion.postActionTime = 0.8;
  }
  companion.actionTime = 0;
  companion.interaction = null;
  companion.pathHistory = [{ ...companion.position }, { ...player.position }];

  if (!interactions.interactions[active.name]) {
    throw new Error(`Interaction metadata disappeared during ${active.name}.`);
  }
}

function updateFetch(
  companion: CompanionState,
  player: PlayerState,
  dt: number,
  map: RuntimeMap,
  interactions: CompanionInteractions
): void {
  const fetch = companion.fetch;
  if (!fetch) return;
  fetch.elapsed += dt;
  companion.animationTime += dt;
  companion.actionTime += dt;

  if (fetch.phase === "throwing") {
    player.actionTime += dt;
    const t = Math.min(1, fetch.elapsed / fetch.throwDuration);
    const eased = 1 - (1 - t) * (1 - t);
    fetch.toyPosition = {
      x: fetch.toyStart.x + (fetch.toyTarget.x - fetch.toyStart.x) * eased,
      y: fetch.toyStart.y + (fetch.toyTarget.y - fetch.toyStart.y) * eased - Math.sin(Math.PI * t) * 18
    };
    if (t >= 1) {
      fetch.phase = "chasing";
      fetch.elapsed = 0;
      fetch.toyPosition = { ...fetch.toyTarget };
      player.action = null;
      player.actionTime = 0;
      companion.action = null;
      companion.actionTime = 0;
    }
    return;
  }

  if (fetch.phase === "chasing") {
    const wasMoving = companion.isMoving;
    const traveled = moveToward(companion, fetch.toyTarget, BRUTUS.runSpeedPxPerSecond * dt, map);
    companion.isMoving = traveled > 0;
    companion.isRunning = traveled > 0;
    if (traveled > 0) {
      if (!wasMoving) companion.animationDistance = 0;
      companion.animationDistance += traveled;
    }
    companion.action = null;
    companion.stuckTime = traveled > 0 ? 0 : companion.stuckTime + dt;
    if (distance(companion.position, fetch.toyTarget) <= 12) {
      fetch.phase = "returning";
      fetch.elapsed = 0;
      companion.action = "carry_pose";
      companion.actionTime = 0;
      companion.isMoving = false;
      companion.isRunning = false;
      companion.stuckTime = 0;
    } else if (companion.stuckTime > 1.2) {
      const safe = findSafePlacement(map, fetch.toyTarget, BRUTUS.collider);
      if (safe) companion.position = { ...safe };
      companion.stuckTime = 0;
    }
    return;
  }

  companion.action = "carry_pose";
  const wasMoving = companion.isMoving;
  const traveled = moveToward(companion, player.position, BRUTUS.runSpeedPxPerSecond * dt, map);
  companion.isMoving = traveled > 0;
  companion.isRunning = traveled > 0;
  if (traveled > 0) {
    if (!wasMoving) companion.animationDistance = 0;
    companion.animationDistance += traveled;
  }
  companion.stuckTime = traveled > 0 ? 0 : companion.stuckTime + dt;
  if (distance(companion.position, player.position) <= 52) {
    companion.mode = fetch.priorMode;
    companion.commandPose = null;
    companion.fetch = null;
    companion.action = "happy_excited";
    companion.actionTime = 0;
    companion.postActionTime = 0.8;
    companion.isMoving = false;
    companion.isRunning = false;
    companion.pathHistory = [{ ...companion.position }, { ...player.position }];
  } else if (companion.stuckTime > 1.2) {
    const safe = findSafePlacement(map, { x: player.position.x - 40, y: player.position.y + 32 }, BRUTUS.collider);
    if (safe) companion.position = { ...safe };
    companion.stuckTime = 0;
  }

  if (!interactions.interactions.play_fetch_preparation) {
    throw new Error("Fetch interaction metadata disappeared during play.");
  }
}

function updateHomeAmbientRoam(
  companion: CompanionState,
  player: PlayerState,
  dt: number,
  map: RuntimeMap
): void {
  const target = companion.homeRoamTarget;
  if (!target) return;
  if (player.isMoving || player.action) {
    companion.homeRoamTarget = null;
    companion.homeRoamDwellTime = 0;
    return;
  }
  const targetDistance = distance(companion.position, target);
  if (targetDistance > 10) {
    companion.action = null;
    companion.actionTime = 0;
    const wasMoving = companion.isMoving;
    const traveled = moveToward(companion, target, BRUTUS.walkSpeedPxPerSecond * dt, map);
    companion.isMoving = traveled > 0;
    companion.isRunning = false;
    if (traveled > 0) {
      if (!wasMoving) companion.animationDistance = 0;
      companion.animationTime += dt;
      companion.animationDistance += traveled;
    }
    companion.stuckTime = traveled > 0 ? 0 : companion.stuckTime + dt;
    if (traveled === 0 && companion.stuckTime > 1.2) {
      companion.homeRoamTarget = null;
      companion.homeRoamDwellTime = 0;
      companion.stuckTime = 0;
    }
    return;
  }

  companion.isMoving = false;
  companion.isRunning = false;
  companion.homeRoamDwellTime += dt;
  companion.actionTime += dt;
  if (companion.homeRoamDwellTime < 1.6) {
    companion.action = "sniff";
  } else {
    companion.action = companion.homeRoamIndex % 2 === 0 ? "lay_rest" : "sit";
  }
  const dwellTarget = 6 + (companion.homeRoamIndex % 3) * 1.5;
  if (companion.homeRoamDwellTime >= dwellTarget) {
    companion.homeRoamTarget = null;
    companion.homeRoamDwellTime = 0;
    companion.homeRoamIndex += 1;
    companion.idleTime = 0;
    companion.action = null;
    companion.actionTime = 0;
  }
}

function nextHomeAmbientTarget(companion: CompanionState, map: RuntimeMap): WorldPoint | null {
  const candidates: WorldPoint[] = [
    { x: map.width * 0.76, y: map.height * 0.29 },
    { x: map.width * 0.51, y: map.height * 0.31 },
    { x: map.width * 0.29, y: map.height * 0.61 },
    { x: map.width * 0.31, y: map.height * 0.79 },
    { x: map.width * 0.62, y: map.height * 0.69 }
  ];
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const index = (companion.homeRoamIndex + offset) % candidates.length;
    const safe = findSafePlacement(map, candidates[index], BRUTUS.collider);
    if (safe) {
      companion.homeRoamIndex = index;
      return safe;
    }
  }
  return null;
}

function findFetchTarget(
  map: RuntimeMap,
  playerPosition: WorldPoint,
  brutusStart: WorldPoint,
  facing: Facing
): WorldPoint | null {
  const vector = facingVector(facing);
  for (const throwDistance of [112, 96, 80, 64]) {
    const candidate = {
      x: playerPosition.x + vector.x * throwDistance,
      y: playerPosition.y + vector.y * throwDistance
    };
    if (canOccupy(map, candidate, BRUTUS.collider) && lineIsClear(map, brutusStart, candidate)) {
      return candidate;
    }
  }
  return null;
}

function lineIsClear(map: RuntimeMap, start: WorldPoint, end: WorldPoint): boolean {
  const length = distance(start, end);
  const steps = Math.max(1, Math.ceil(length / 8));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const point = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    if (!canOccupy(map, point, BRUTUS.collider)) return false;
  }
  return true;
}

function facingVector(facing: Facing): WorldPoint {
  const raw: Record<Facing, WorldPoint> = {
    down: { x: 0, y: 1 },
    left_down: { x: -1, y: 1 },
    left: { x: -1, y: 0 },
    left_up: { x: -1, y: -1 },
    up: { x: 0, y: -1 },
    right_up: { x: 1, y: -1 },
    right: { x: 1, y: 0 },
    right_down: { x: 1, y: 1 }
  };
  const vector = raw[facing];
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function recordPlayerPath(companion: CompanionState, playerPosition: WorldPoint): void {
  const last = companion.pathHistory.at(-1);
  if (!last || distance(last, playerPosition) >= BRUTUS.waypointSpacingPx) {
    companion.pathHistory.push({ ...playerPosition });
  }
  if (companion.pathHistory.length > 256) {
    companion.pathHistory.splice(0, companion.pathHistory.length - 256);
  }
}

function trailingTarget(path: readonly WorldPoint[], trailingDistance: number): WorldPoint {
  if (path.length === 0) {
    return { x: 0, y: 0 };
  }
  let remaining = trailingDistance;
  for (let index = path.length - 1; index > 0; index -= 1) {
    const newer = path[index];
    const older = path[index - 1];
    const segment = distance(newer, older);
    if (segment >= remaining && segment > 0) {
      const ratio = remaining / segment;
      return {
        x: newer.x + (older.x - newer.x) * ratio,
        y: newer.y + (older.y - newer.y) * ratio
      };
    }
    remaining -= segment;
  }
  return { ...path[0] };
}

function moveToward(companion: CompanionState, target: WorldPoint, maxDistance: number, map: RuntimeMap): number {
  const dx = target.x - companion.position.x;
  const dy = target.y - companion.position.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) {
    return 0;
  }
  const previous = { ...companion.position };
  const distanceToMove = Math.min(maxDistance, length);
  const direction = { x: dx / length, y: dy / length };
  const nextX = { x: companion.position.x + direction.x * distanceToMove, y: companion.position.y };
  if (canOccupy(map, nextX, BRUTUS.collider)) {
    companion.position.x = nextX.x;
  }
  const nextY = { x: companion.position.x, y: companion.position.y + direction.y * distanceToMove };
  if (canOccupy(map, nextY, BRUTUS.collider)) {
    companion.position.y = nextY.y;
  }
  const traveled = distance(previous, companion.position);
  if (traveled > 0) {
    companion.facing = facingFromVectorWithHysteresis(direction, companion.facing);
  }
  return traveled;
}

function recoverToRecentPath(companion: CompanionState, player: PlayerState, map: RuntimeMap): void {
  const recent = [...companion.pathHistory]
    .reverse()
    .find(
      (point) =>
        distance(point, player.position) >= 40 &&
        distance(point, player.position) <= 128 &&
        canOccupy(map, point, BRUTUS.collider)
    );
  const safe = recent ?? findSafePlacement(map, { x: player.position.x - 48, y: player.position.y + 40 }, BRUTUS.collider);
  if (safe) {
    companion.position = { ...safe };
    companion.pathHistory = [{ ...safe }, { ...player.position }];
    companion.fallbackCount += 1;
  }
  companion.stuckTime = 0;
}

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
