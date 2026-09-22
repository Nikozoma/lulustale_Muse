import type { AnimationDefinition } from "./characterAssets";
import { loadCharacterRegistry, type LoadedCharacter } from "./characterRegistry";
import type { Facing } from "./player";
import type { WorldPoint } from "./foundation";

export type WorldActorRenderState = {
  id: string;
  position: WorldPoint;
  facing: Facing;
  definition: AnimationDefinition;
  animationTime: number;
  frameSeconds: number;
};

export type WorldActorAssets = {
  npcs: Map<string, AnimationDefinition>;
  birds: Map<string, AnimationDefinition>;
};

const REQUIRED_NPC_KEYS = new Set([
  "homeless_man_day:idle",
  "homeless_man_day:sit",
  "homeless_man_day:simple_gesture",
  "wizard_night:idle",
  "wizard_night:stand_pose",
  "wizard_night:magic_gesture",
  "charles_jr_employee:idle",
  "charles_jr_employee:serve_gesture",
  ...Array.from({ length: 8 }, (_, index) => `pedestrian_${String(index + 1).padStart(2, "0")}:idle`)
]);

const REQUIRED_BIRD_KEYS = new Set([
  "primary_fries_thief:idle",
  "primary_fries_thief:alert_interested",
  "primary_fries_thief:theft_attempt",
  "primary_fries_thief:carry_fly",
  "bird_lookout:idle",
  "peck_captain:idle",
  "peck_captain:command_reaction",
  "ambient_robin:idle"
]);

export async function loadWorldActorAssets(): Promise<WorldActorAssets> {
  const registry = await loadCharacterRegistry();
  const npcs = definitionsForKeys(registry.characters, REQUIRED_NPC_KEYS);
  const birds = definitionsForKeys(registry.characters, REQUIRED_BIRD_KEYS);

  for (const key of REQUIRED_NPC_KEYS) {
    if (!npcs.has(key)) {
      throw new Error(`Required NPC animation ${key} is missing from NPC_Overworld_Batch_v1.`);
    }
  }
  for (const key of REQUIRED_BIRD_KEYS) {
    if (!birds.has(key)) {
      throw new Error(`Required bird animation ${key} is missing from Bird_Overworld_Assets_Full_v1.`);
    }
  }

  return { npcs, birds };
}

export function requireNpcAnimation(assets: WorldActorAssets, key: string): AnimationDefinition {
  const definition = assets.npcs.get(key);
  if (!definition) {
    throw new Error(`NPC animation ${key} is not loaded.`);
  }
  return definition;
}

export function requireBirdAnimation(assets: WorldActorAssets, key: string): AnimationDefinition {
  const definition = assets.birds.get(key);
  if (!definition) {
    throw new Error(`Bird animation ${key} is not loaded.`);
  }
  return definition;
}

function definitionsForKeys(
  characters: Map<string, LoadedCharacter>,
  keys: ReadonlySet<string>
): Map<string, AnimationDefinition> {
  const definitions = new Map<string, AnimationDefinition>();
  for (const key of keys) {
    const [characterId, actionId] = key.split(":");
    const action = characters.get(characterId)?.actions.get(actionId);
    if (!action) continue;
    const firstFrame = action.tracks[action.directions[0]]?.[0];
    definitions.set(key, {
      name: key,
      image: action.image,
      href: action.sheet,
      framesPerDirection: action.framesPerDirection,
      frameWidth: action.cell[0],
      frameHeight: action.cell[1],
      rootAnchorX: firstFrame?.root[0] ?? 0,
      rootAnchorY: firstFrame?.root[1] ?? 0,
      category: action.category,
      playback: action.playback,
      directions: action.directions,
      directionMode: action.directionMode,
      loop: action.loop,
      entryFrame: action.entryFrame,
      stopPolicy: action.stopPolicy,
      cycleDistancePx: action.cycleDistancePx,
      tracks: action.tracks,
      renderScales: characters.get(characterId)?.manifest.renderScales ?? {}
    });
  }
  return definitions;
}
