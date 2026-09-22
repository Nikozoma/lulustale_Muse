import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CompanionInteractions } from "./characterAssets";
import {
  beginCompanionCommand,
  beginCompanionInteraction,
  beginFetch,
  createCompanion,
  getFeedingPropPosition,
  getFetchToyPosition,
  resetCompanionForMap,
  restoreCompanionCommandState,
  updateCompanion
} from "./companion";
import {
  collisionFieldFromTileGrid,
  pointInRect,
  type FoundationSemantic,
  type FoundationVisual,
  type RuntimeMap
} from "./foundation";
import { createPlayer } from "./player";

const interactions = JSON.parse(
  readFileSync(resolve(process.cwd(), "public/assets/characters/brutus/INTERACTIONS.json"), "utf8")
) as CompanionInteractions;

function openMap(): RuntimeMap {
  const widthTiles = 32;
  const heightTiles = 24;
  const semantic = {
    schema_version: "1.0.0",
    map_id: "home",
    map_dimensions: {
      tiles: { width: widthTiles, height: heightTiles },
      pixels: { width: widthTiles * 32, height: heightTiles * 32 },
      tile_size_px: 32,
      world_scale: 1
    },
    spawns: [],
    transitions: [],
    interactions: [],
    npc_spawn_markers: []
  } satisfies FoundationSemantic;
  const visual = {
    schema_version: "1.0.0",
    map_id: "home",
    variant: "day",
    canvas: { width_px: widthTiles * 32, height_px: heightTiles * 32, tile_size_px: 32 },
    base_layer: { asset: "", sha256: "", origin_px: { x: 0, y: 0 }, z_index: 0 },
    foreground_layers: []
  } satisfies FoundationVisual;
  return {
    id: "home",
    semantic,
    collision: collisionFieldFromTileGrid(
      Array.from({ length: heightTiles }, () => Array.from({ length: widthTiles }, () => true))
    ),
    visuals: { day: visual, night: { ...visual, variant: "night" } },
    width: widthTiles * 32,
    height: heightTiles * 32,
    tileSize: 32
  };
}

describe("daytime Brutus companion subsystem", () => {
  it("references Character Studio events and anchors while retaining numeric compatibility cues", () => {
    expect(interactions.interactions.feeding.event_ids?.lulu_food_spawn).toBe("feed_dog_food_spawn_frame");
    expect(interactions.interactions.play_fetch_preparation).toMatchObject({
      event_ids: { lulu_throw_release: "throw_toy_throw_release_frame" },
      anchor_ids: {
        lulu_throw_origin: "lulu_throw_origin_local",
        brutus_mouth: "brutus_mouth_anchor_local"
      },
      synchronization: { throw_release_frame: 2 }
    });
    expect(interactions.interactions.companion_command.event_ids).toMatchObject({
      lulu_command_cue: "companion_command_command_cue_frame",
      lulu_response: "companion_command_response_frame",
      brutus_command_cue: "idle_stand_command_cue_frame",
      brutus_response: "idle_stand_response_frame"
    });
  });

  it("follows recent player path with a trailing distance and natural catch-up", () => {
    const map = openMap();
    const player = createPlayer({ x: 400, y: 400 });
    const companion = createCompanion({ x: 328, y: 400 });
    const startX = companion.position.x;
    for (let index = 0; index < 80; index += 1) {
      player.position.x += 3;
      player.isMoving = true;
      updateCompanion(companion, player, 0.05, map, interactions);
    }
    expect(companion.position.x).toBeGreaterThan(startX + 120);
    expect(Math.hypot(companion.position.x - player.position.x, companion.position.y - player.position.y)).toBeLessThan(180);
  });

  it("recovers near a recent safe player position when separation is excessive", () => {
    const map = openMap();
    const player = createPlayer({ x: 700, y: 500 });
    const companion = createCompanion({ x: 40, y: 40 });
    updateCompanion(companion, player, 0.05, map, interactions);
    expect(companion.fallbackCount).toBe(1);
    expect(Math.hypot(companion.position.x - player.position.x, companion.position.y - player.position.y)).toBeLessThan(150);
  });

  it("uses supplied root offsets and timing for synchronized petting", () => {
    const map = openMap();
    const player = createPlayer({ x: 400, y: 400 }, "down");
    const companion = createCompanion({ x: 400, y: 434 }, "up");
    expect(beginCompanionInteraction("petting", companion, player, map, interactions)).toEqual({ ok: true });
    expect(player.action).toBe("pet_dog");
    expect(companion.action).toBe("being_petted");
    expect(companion.position).toEqual({ x: 400, y: 434 });
    for (let index = 0; index < 8; index += 1) {
      updateCompanion(companion, player, 0.1, map, interactions);
    }
    expect(player.action).toBeNull();
    expect(companion.action).toBe("happy_excited");
  });

  it("uses feeding metadata for a separate real prop and command metadata for stay/follow", () => {
    const map = openMap();
    const player = createPlayer({ x: 400, y: 400 }, "down");
    const companion = createCompanion({ x: 400, y: 438 }, "up");
    expect(beginCompanionInteraction("feeding", companion, player, map, interactions)).toEqual({ ok: true });
    updateCompanion(companion, player, 0.2, map, interactions);
    expect(getFeedingPropPosition(companion, player, interactions)).toEqual({ x: 400, y: 429 });
    for (let index = 0; index < 7; index += 1) {
      updateCompanion(companion, player, 0.1, map, interactions);
    }

    companion.position = { x: 400, y: 442 };
    expect(beginCompanionInteraction("companion_command", companion, player, map, interactions)).toEqual({ ok: true });
    for (let index = 0; index < 8; index += 1) {
      updateCompanion(companion, player, 0.1, map, interactions);
    }
    expect(companion.mode).toBe("stay");
    expect(companion.action).toBe("stand_to_sit");
  });


  it("supports explicit sit, lie-down, and follow commands", () => {
    const map = openMap();
    const player = createPlayer({ x: 400, y: 400 }, "down");
    const companion = createCompanion({ x: 400, y: 442 }, "up");

    expect(beginCompanionCommand("lay", companion, player, map, interactions)).toEqual({ ok: true });
    for (let index = 0; index < 8; index += 1) updateCompanion(companion, player, 0.1, map, interactions);
    expect(companion.mode).toBe("stay");
    expect(companion.commandPose).toBe("lay");

    companion.position = { x: 400, y: 442 };
    expect(beginCompanionCommand("follow", companion, player, map, interactions)).toEqual({ ok: true });
    for (let index = 0; index < 8; index += 1) updateCompanion(companion, player, 0.1, map, interactions);
    expect(companion.mode).toBe("follow");
    expect(companion.commandPose).toBeNull();
  });

  it.each([
    ["follow", null, null],
    ["stay", "sit", "sit"],
    ["stay", "lay", "lay_rest"],
    ["stay", undefined, "sit"]
  ] as const)("restores saved %s / %s command state at startup", (mode, commandPose, expectedAction) => {
    const companion = createCompanion({ x: 400, y: 442 }, "up");
    restoreCompanionCommandState(companion, { mode, commandPose });
    expect(companion.mode).toBe(mode);
    expect(companion.commandPose).toBe(mode === "follow" ? null : commandPose === "lay" ? "lay" : "sit");
    expect(companion.action).toBe(expectedAction);
  });

  it("runs a complete fetch cycle with the separate toy prop", () => {
    const map = openMap();
    const player = createPlayer({ x: 400, y: 400 }, "right");
    const companion = createCompanion({ x: 400, y: 442 }, "up");
    expect(beginFetch(companion, player, map, interactions)).toEqual({ ok: true });
    expect(player.action).toBe("throw_toy");
    expect(getFetchToyPosition(companion, interactions)).not.toBeNull();

    for (let index = 0; index < 240 && companion.fetch; index += 1) {
      updateCompanion(companion, player, 0.05, map, interactions);
    }
    expect(companion.fetch).toBeNull();
    expect(companion.action).toBe("happy_excited");
  });

  it("lets Brutus roam to safe rest spots when Lulu is idle at home", () => {
    const map = openMap();
    const player = createPlayer({ x: 400, y: 400 });
    const companion = createCompanion({ x: 328, y: 400 });
    companion.pathHistory = [{ x: 328, y: 400 }, { x: 400, y: 400 }];
    const start = { ...companion.position };
    for (let index = 0; index < 240; index += 1) {
      player.isMoving = false;
      updateCompanion(companion, player, 0.05, map, interactions);
    }
    expect(Math.hypot(companion.position.x - start.x, companion.position.y - start.y)).toBeGreaterThan(20);
    expect(["sniff", "sit", "lay_rest", null]).toContain(companion.action);
  });

  it("places Brutus outside transition activation areas after a map change", () => {
    const map = openMap();
    map.semantic.transitions.push({
      id: "door",
      pixel_rect: { x: 350, y: 350, width: 100, height: 100 },
      target_map: "overworld",
      target_transition_id: "return",
      target_spawn_id: "spawn",
      activation: "player_enter"
    });
    const player = createPlayer({ x: 400, y: 400 });
    const companion = createCompanion({ x: 400, y: 400 });
    resetCompanionForMap(companion, map, player.position, { x: 400, y: 400 });
    expect(pointInRect(companion.position, map.semantic.transitions[0].pixel_rect)).toBe(false);
  });
});
