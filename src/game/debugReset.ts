import { createCompanion, resetCompanionForMap, setCompanionIntroRestState } from "./companion";
import { PLAYER } from "./constants";
import { createDemoQuestState } from "./demoQuest";
import { getSpawn, resolveSafeSpawn, type RuntimeMap } from "./foundation";
import {
  SAVE_SCHEMA_VERSION,
  createFreshGameFlags,
  createDefaultStatus,
  createEquipmentFromQuest,
  rebuildInventoryFromQuest,
  type PersistentGameState
} from "./gameState";

export function createDay1ResetSnapshot(home: RuntimeMap, savedAt = new Date().toISOString()): PersistentGameState {
  if (home.id !== "home") throw new Error("Day 1 reset requires the authoritative Home map.");

  const quest = createDemoQuestState();
  const spawn = getSpawn(home);
  const playerPosition = resolveSafeSpawn(home, spawn, PLAYER.collider).position;
  const companionAnchor = home.semantic.npc_spawn_markers.find((anchor) => anchor.id === "npc_anchor_home_companion");
  const companion = createCompanion(companionAnchor?.pixel_point ?? {
    x: playerPosition.x - 48,
    y: playerPosition.y + 36
  });
  resetCompanionForMap(companion, home, playerPosition, companionAnchor?.pixel_point);
  setCompanionIntroRestState(companion);

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt,
    quest,
    mapId: "home",
    phase: "day",
    player: {
      position: { ...playerPosition },
      facing: authoredFacing(spawn.facing)
    },
    companion: {
      position: { ...companion.position },
      facing: companion.facing,
      mode: companion.mode,
      commandPose: companion.commandPose
    },
    inventory: rebuildInventoryFromQuest(quest),
    equipment: createEquipmentFromQuest(quest),
    status: createDefaultStatus(),
    flags: createFreshGameFlags()
  };
}

function authoredFacing(facing: string): PersistentGameState["player"]["facing"] {
  return ({ north: "up", south: "down", east: "right", west: "left" } as const)[facing as "north" | "south" | "east" | "west"] ?? "down";
}
