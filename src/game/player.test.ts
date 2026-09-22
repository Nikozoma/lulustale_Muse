import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYER_SPEED_MULTIPLIER,
  MAX_PLAYER_SPEED_MULTIPLIER,
  MIN_PLAYER_SPEED_MULTIPLIER,
  PLAYER,
  PLAYER_SPEED_MULTIPLIER_STEP,
  WALK_MAX_STRENGTH,
  getPlayerMovementSpeed
} from "./constants";
import {
  collisionFieldFromTileGrid,
  type FoundationSemantic,
  type FoundationVisual,
  type RuntimeMap
} from "./foundation";
import { createPlayer, updatePlayer } from "./player";

function createOpenMap(widthTiles = 20, heightTiles = 20): RuntimeMap {
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

describe("authoritative player movement", () => {
  it("uses the requested 1.50x defaults of 144 px/s walk and 240 px/s run", () => {
    expect(DEFAULT_PLAYER_SPEED_MULTIPLIER).toBe(1.5);
    expect([MIN_PLAYER_SPEED_MULTIPLIER, MAX_PLAYER_SPEED_MULTIPLIER, PLAYER_SPEED_MULTIPLIER_STEP]).toEqual([0.5, 2, 0.25]);
    expect(PLAYER.walkSpeedPxPerSecond).toBe(144);
    expect(PLAYER.runSpeedPxPerSecond).toBe(240);
  });

  it("uses low analog strength to walk and ordinary strength to run", () => {
    const map = createOpenMap();
    const walker = createPlayer({ x: 160, y: 160 });
    const runner = createPlayer({ x: 160, y: 224 });
    updatePlayer(walker, { x: WALK_MAX_STRENGTH, y: 0 }, 1, map);
    updatePlayer(runner, { x: WALK_MAX_STRENGTH + 0.01, y: 0 }, 1, map);
    expect(walker.position.x).toBe(160 + PLAYER.walkSpeedPxPerSecond * WALK_MAX_STRENGTH);
    expect(runner.position.x).toBe(160 + PLAYER.runSpeedPxPerSecond * (WALK_MAX_STRENGTH + 0.01));
    expect(walker.isRunning).toBe(false);
    expect(runner.isRunning).toBe(true);
  });

  it("treats full-strength keyboard movement as running", () => {
    const map = createOpenMap();
    const player = createPlayer({ x: 160, y: 160 });
    updatePlayer(player, { x: 1, y: 0 }, 1, map);
    expect(player.position.x).toBe(160 + PLAYER.runSpeedPxPerSecond);
    expect(player.isRunning).toBe(true);
  });

  it("adjusts movement rate while locomotion cadence records actual traveled distance", () => {
    const map = createOpenMap();
    const player = createPlayer({ x: 160, y: 160 });
    updatePlayer(player, { x: WALK_MAX_STRENGTH, y: 0 }, 1, map, 0.5);
    const traveled = getPlayerMovementSpeed(false, 0.5) * WALK_MAX_STRENGTH;
    expect(player.position.x).toBe(160 + traveled);
    expect(getPlayerMovementSpeed(false, 2)).toBe(192);
    expect(getPlayerMovementSpeed(true, 2)).toBeCloseTo(320);
    expect(player.animationTime).toBe(1);
    expect(player.animationDistance).toBeCloseTo(traveled);
  });

  it("normalizes diagonal movement", () => {
    const map = createOpenMap();
    const player = createPlayer({ x: 256, y: 256 });
    updatePlayer(player, { x: 1, y: -1 }, 1, map);
    expect(Math.hypot(player.position.x - 256, player.position.y - 256)).toBeCloseTo(
      PLAYER.runSpeedPxPerSecond
    );
    expect(player.facing).toBe("right_up");
    expect(player.visualFacing).toBe("Up-Right");
  });

  it("keeps horizontal movement exact while presenting the neighboring diagonal", () => {
    const map = createOpenMap();
    const player = createPlayer({ x: 256, y: 256 });
    updatePlayer(player, { x: 1, y: 0 }, 0.25, map);
    expect(player.position.y).toBe(256);
    expect(player.facing).toBe("right");
    expect(player.visualFacing).toBe("Down-Right");

    updatePlayer(player, { x: 0, y: -1 }, 0.25, map);
    updatePlayer(player, { x: 1, y: 0 }, 0.25, map);
    expect(player.facing).toBe("right");
    expect(player.visualFacing).toBe("Up-Right");
  });

  it("uses the 20x12 foot-level collider", () => {
    const map = createOpenMap(4, 4);
    map.collision.setWalkableCell(2, 1, false);
    const player = createPlayer({ x: 54, y: 64 });
    updatePlayer(player, { x: 1, y: 0 }, 0.5, map);
    expect(player.position.x).toBeLessThan(64 - PLAYER.collider.width / 2 + 0.01);
    expect(player.animationDistance).toBeCloseTo(player.position.x - 54);
    const blockedDistance = player.animationDistance;
    for (let y = 0; y < map.collision.heightCells; y += 1) {
      for (let x = 0; x < map.collision.widthCells; x += 1) map.collision.setWalkableCell(x, y, false);
    }
    updatePlayer(player, { x: 1, y: 0 }, 0.5, map);
    expect(player.animationDistance).toBe(blockedDistance);
    expect(player.isMoving).toBe(false);
    expect(PLAYER.collider).toEqual({ width: 20, height: 12, centerOffsetY: -6 });
  });

  it("locks movement while a reusable action animation is active", () => {
    const map = createOpenMap();
    const player = createPlayer({ x: 160, y: 160 });
    player.action = "pet_dog";
    updatePlayer(player, { x: 1, y: 0 }, 0.5, map);
    expect(player.position).toEqual({ x: 160, y: 160 });
    expect(player.actionTime).toBeCloseTo(0.5);
  });
});
