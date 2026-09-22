import { ROOT_ANCHOR } from "./constants";
import {
  CHARACTER_DIRECTIONS,
  attachmentTransform,
  type CharacterActionCategory,
  type CharacterDirection,
  type CharacterPlaybackMode,
  type RuntimeFrameContract
} from "./characterContract";
import type { FoundationMapId, WorldPoint } from "./foundation";
import { loadCharacterRegistry, requireCharacter } from "./characterRegistry";
import type { Facing } from "./player";

export const DIRECTION_ORDER = CHARACTER_DIRECTIONS;

export type DirectionName = CharacterDirection;

type LuluAnimationManifest = {
  sheet: string;
  frames_per_direction: number;
  sheet_size: [number, number];
};

type CompanionAnimationManifest = {
  filename: string;
  frame_cell: [number, number];
  sheet_dimensions: [number, number];
  frames_per_direction: number;
  direction_order: DirectionName[];
  ground_root_anchor: [number, number];
};

export type LuluManifest = {
  package: string;
  frame_cell: [number, number];
  row_order: DirectionName[];
  foot_anchor: [number, number];
  animations: Record<string, LuluAnimationManifest>;
};

export type BrutusManifest = {
  package: string;
  frame_cell: [number, number];
  direction_order: DirectionName[];
  brutus_master_scale: { ground_root_anchor: [number, number] };
  brutus_animations: Record<string, CompanionAnimationManifest>;
  lulu_interaction_animations: Record<string, CompanionAnimationManifest>;
};

export type InteractionDirection = {
  brutus_relative_offset: [number, number];
  lulu_facing: DirectionName;
  brutus_facing: DirectionName;
  food_placement_relative_to_lulu_root?: [number, number];
  brutus_play_ready_relative_offset?: [number, number];
  brutus_mouth_anchor_local?: [number, number];
  lulu_throw_origin_local?: [number, number];
};

export type SynchronizedInteractionDefinition = {
  lulu_animation: string;
  brutus_animation: string;
  event_ids?: {
    lulu_food_spawn?: string;
    lulu_throw_release?: string;
    lulu_command_cue?: string;
    lulu_response?: string;
    brutus_command_cue?: string;
    brutus_response?: string;
  };
  anchor_ids?: {
    lulu_throw_origin?: string;
    brutus_mouth?: string;
  };
  synchronization: {
    frame_ms: number;
    total_frames?: number;
    food_spawn_frame?: number;
    command_cue_frame?: number;
    response_frame?: number;
    throw_release_frame?: number;
  };
  per_direction: Record<DirectionName, InteractionDirection>;
};

export type CompanionInteractions = {
  interactions: Record<string, SynchronizedInteractionDefinition>;
};

export type AnimationDefinition = {
  name: string;
  image: HTMLImageElement;
  href: string;
  framesPerDirection: number;
  frameWidth: number;
  frameHeight: number;
  rootAnchorX: number;
  rootAnchorY: number;
  category: CharacterActionCategory;
  playback: CharacterPlaybackMode;
  directions: DirectionName[];
  directionMode: "eight" | "explicit" | "single";
  loop: [number, number];
  entryFrame: number;
  stopPolicy: "idle_entry" | "finish_to_contact" | "transition";
  cycleDistancePx?: number;
  tracks: Partial<Record<DirectionName, RuntimeFrameContract[]>>;
  renderScales: Readonly<Record<string, number>>;
};

export type CharacterAssets = {
  lulu: Map<string, AnimationDefinition>;
  brutus: Map<string, AnimationDefinition>;
  interactions: CompanionInteractions;
  foodPropImage: HTMLImageElement;
};

export type CharacterRenderContext = FoundationMapId | "battle";

export async function loadCharacterAssets(): Promise<CharacterAssets> {
  const [registry, interactions, foodPropImage] = await Promise.all([
    loadCharacterRegistry(),
    fetchJson<CompanionInteractions>("/assets/characters/brutus/INTERACTIONS.json"),
    loadImage("/assets/top-down-retro-interior/TopDownHouse_SmallItems.png")
  ]);
  const lulu = animationMap(requireCharacter(registry, "lulu"));
  const brutus = animationMap(requireCharacter(registry, "brutus"));
  validateCompanionInteractionReferences(interactions, lulu, brutus);
  return { lulu, brutus, interactions, foodPropImage };
}

export function directionNameForFacing(facing: Facing): DirectionName {
  const names: Record<Facing, DirectionName> = {
    down: "Down",
    left_down: "Down-Left",
    left: "Left",
    left_up: "Up-Left",
    up: "Up",
    right_up: "Up-Right",
    right: "Right",
    right_down: "Down-Right"
  };
  return names[facing];
}

export function facingForDirectionName(direction: DirectionName): Facing {
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

export function directionRow(facing: Facing): number {
  return DIRECTION_ORDER.indexOf(directionNameForFacing(facing));
}

export function getAnimationRenderScale(
  definition: AnimationDefinition,
  context: CharacterRenderContext
): number {
  const scale = definition.renderScales[context];
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`${definition.name} has no valid Character Studio render scale for ${context}.`);
  }
  return scale;
}

export function findAnimationEventFrame(
  definition: AnimationDefinition,
  direction: DirectionName,
  eventId: string
): { frame: RuntimeFrameContract; frameIndex: number } | null {
  const frames = definition.tracks[direction] ?? definition.tracks[definition.directions[0]] ?? [];
  const frameIndex = frames.findIndex((frame) => frame.events.some((event) => event.id === eventId));
  return frameIndex >= 0 ? { frame: frames[frameIndex], frameIndex } : null;
}

export function getAnimationEventTimeSeconds(
  definition: AnimationDefinition,
  direction: DirectionName,
  eventId: string,
  edge: "start" | "end" = "start"
): number | null {
  const match = findAnimationEventFrame(definition, direction, eventId);
  if (!match) return null;
  const frames = definition.tracks[direction] ?? definition.tracks[definition.directions[0]] ?? [];
  const end = edge === "end" ? match.frameIndex + 1 : match.frameIndex;
  return frames
    .slice(0, end)
    .reduce((total, frame) => total + Math.max(1, frame.durationMs), 0) / 1000;
}

export function getAnimationDurationSeconds(
  definition: AnimationDefinition,
  direction: DirectionName
): number {
  const frames = definition.tracks[direction] ?? definition.tracks[definition.directions[0]] ?? [];
  return frames.reduce((total, frame) => total + Math.max(1, frame.durationMs), 0) / 1000;
}

export function getAnimationAnchorPosition(
  definition: AnimationDefinition,
  direction: DirectionName,
  frameIndex: number,
  anchorId: string,
  root: WorldPoint,
  renderContext: CharacterRenderContext
): WorldPoint | null {
  const frames = definition.tracks[direction] ?? definition.tracks[definition.directions[0]] ?? [];
  const frame = frames[Math.max(0, Math.min(frameIndex, frames.length - 1))];
  const anchor = frame?.anchors.find((candidate) => candidate.id === anchorId);
  if (!frame || !anchor) return null;
  const transform = attachmentTransform(root, frame, anchor, getAnimationRenderScale(definition, renderContext));
  return { x: transform.x, y: transform.y };
}

function validateCompanionInteractionReferences(
  interactions: CompanionInteractions,
  lulu: Map<string, AnimationDefinition>,
  brutus: Map<string, AnimationDefinition>
): void {
  for (const [interactionId, interaction] of Object.entries(interactions.interactions)) {
    const luluAction = lulu.get(interaction.lulu_animation);
    const brutusAction = brutus.get(interaction.brutus_animation);
    if (!luluAction || !brutusAction) {
      throw new Error(`${interactionId} references an unavailable character action.`);
    }
    const eventChecks: Array<[AnimationDefinition, string | undefined]> = [
      [luluAction, interaction.event_ids?.lulu_food_spawn],
      [luluAction, interaction.event_ids?.lulu_throw_release],
      [luluAction, interaction.event_ids?.lulu_command_cue],
      [luluAction, interaction.event_ids?.lulu_response],
      [brutusAction, interaction.event_ids?.brutus_command_cue],
      [brutusAction, interaction.event_ids?.brutus_response]
    ];
    for (const [action, eventId] of eventChecks) {
      if (!eventId) continue;
      for (const direction of action.directions) {
        if (!findAnimationEventFrame(action, direction, eventId)) {
          throw new Error(`${interactionId} requires missing event ${action.name}/${direction}/${eventId}.`);
        }
      }
    }
    const brutusAnchorAction =
      interactionId === "play_fetch_preparation"
        ? brutus.get("carry_pose") ?? brutusAction
        : brutusAction;
    const anchorChecks: Array<[AnimationDefinition, string | undefined]> = [
      [luluAction, interaction.anchor_ids?.lulu_throw_origin],
      [brutusAnchorAction, interaction.anchor_ids?.brutus_mouth]
    ];
    for (const [action, anchorId] of anchorChecks) {
      if (!anchorId) continue;
      for (const direction of action.directions) {
        const frames = action.tracks[direction] ?? [];
        if (frames.some((frame) => !frame.anchors.some((anchor) => anchor.id === anchorId))) {
          throw new Error(`${interactionId} requires missing anchor ${action.name}/${direction}/${anchorId}.`);
        }
      }
    }
  }
}

function animationMap(character: ReturnType<typeof requireCharacter>): Map<string, AnimationDefinition> {
  return new Map(
    [...character.actions.entries()].map(([name, action]) => [
      name,
      {
        name,
        image: action.image,
        href: action.sheet,
        framesPerDirection: action.framesPerDirection,
        frameWidth: action.cell[0],
        frameHeight: action.cell[1],
        rootAnchorX: action.tracks[action.directions[0]]?.[0]?.root[0] ?? ROOT_ANCHOR.x,
        rootAnchorY: action.tracks[action.directions[0]]?.[0]?.root[1] ?? ROOT_ANCHOR.y,
        category: action.category,
        playback: action.playback,
        directions: action.directions,
        directionMode: action.directionMode,
        loop: action.loop,
        entryFrame: action.entryFrame,
        stopPolicy: action.stopPolicy,
        cycleDistancePx: action.cycleDistancePx,
        tracks: action.tracks,
        renderScales: character.manifest.renderScales
      }
    ])
  );
}

async function fetchJson<T>(href: string): Promise<T> {
  const response = await fetch(href);
  if (!response.ok) {
    throw new Error(`Unable to load ${href}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function loadImage(href: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load authoritative character asset ${href}.`));
    image.src = href;
  });
}
