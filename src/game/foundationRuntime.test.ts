import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAYER } from "./constants";
import { canUseQuestTransition, createDemoQuestState, feedBrutusForQuest, takeDogFood } from "./demoQuest";
import {
  canOccupy,
  collisionAtGameplayTile,
  collisionFieldToGameplayGrid,
  decodeCollisionGrid,
  findSafePlacement,
  pointInRect,
  resolveSafeSpawn,
  transitionAt,
  type CollisionSource,
  type FoundationMapId,
  type FoundationSemantic,
  type FoundationVisual,
  type RuntimeMap
} from "./foundation";
import { canActivateObjectiveMarker } from "./interactionSystem";
import { createPlayer, updatePlayer } from "./player";

const expected = {
  overworld: { tiles: [96, 68], pixels: [3072, 2176] },
  home: { tiles: [28, 43], pixels: [896, 1376] },
  charles_jr: { tiles: [39, 33], pixels: [1248, 1056] }
} as const;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

function runtimeMap(id: FoundationMapId): RuntimeMap {
  const root = `public/data/maps/${id}`;
  const semantic = readJson<FoundationSemantic>(`${root}/semantic.json`);
  const collisionSource = readJson<CollisionSource>(`${root}/collision_grid.json`);
  const day = readJson<FoundationVisual>(`${root}/visual_day.json`);
  const night = readJson<FoundationVisual>(`${root}/visual_night.json`);
  return {
    id,
    semantic,
    collision: decodeCollisionGrid(collisionSource),
    visuals: { day, night },
    width: semantic.map_dimensions.pixels.width,
    height: semantic.map_dimensions.pixels.height,
    tileSize: semantic.map_dimensions.tile_size_px
  };
}

describe("authoritative map runtime foundation", () => {
  it.each(Object.entries(expected) as Array<[FoundationMapId, (typeof expected)[FoundationMapId]]>)(
    "loads %s at the required native size and 1.0x world scale",
    (id, dimensions) => {
      const map = runtimeMap(id);
      expect([map.semantic.map_dimensions.tiles.width, map.semantic.map_dimensions.tiles.height]).toEqual(dimensions.tiles);
      expect([map.width, map.height]).toEqual(dimensions.pixels);
      expect(map.tileSize).toBe(32);
      expect(map.semantic.map_dimensions.world_scale).toBe(1);
      expect([map.semantic.map_dimensions.tiles.width, map.semantic.map_dimensions.tiles.height]).not.toEqual([48, 34]);
    }
  );

  it("keeps all destination spawns safe and outside their source activation rectangles", () => {
    const maps = new Map((Object.keys(expected) as FoundationMapId[]).map((id) => [id, runtimeMap(id)]));
    for (const map of maps.values()) {
      for (const spawn of map.semantic.spawns) {
        const resolved = resolveSafeSpawn(map, spawn, PLAYER.collider);
        expect(canOccupy(map, resolved.position, PLAYER.collider), `${map.id}:${spawn.id}`).toBe(true);
        expect(map.semantic.transitions.some((transition) => pointInRect(resolved.position, transition.pixel_rect))).toBe(false);
      }
    }
  });

  it("keeps the corrected Home entry spawn safe below the top-left exterior door", () => {
    const home = runtimeMap("home");
    const spawn = home.semantic.spawns.find((candidate) => candidate.id === "spawn_home_entry")!;
    expect(canOccupy(home, spawn.pixel_point, PLAYER.collider)).toBe(true);
    expect(resolveSafeSpawn(home, spawn, PLAYER.collider)).toEqual({
      position: { x: 208, y: 624 },
      adjusted: false
    });
  });

  it("aligns representative Home collision points to visible walls, dividers, furniture, and floor", () => {
    const home = runtimeMap("home");
    expect(collisionAtGameplayTile(home.collision, 25, 3)).toBe(false); // Bedroom right wall.
    expect(collisionAtGameplayTile(home.collision, 13, 15)).toBe(false); // Bedroom connector side wall.
    expect(collisionAtGameplayTile(home.collision, 14, 15)).toBe(true); // Visible connector opening.
    expect(collisionAtGameplayTile(home.collision, 4, 16)).toBe(false); // Main-room top divider wall.
    expect(collisionAtGameplayTile(home.collision, 6, 16)).toBe(true); // Top-left exterior doorway opening.
    expect(collisionAtGameplayTile(home.collision, 5, 18)).toBe(true); // Main-room floor below divider.
    expect(collisionAtGameplayTile(home.collision, 3, 25)).toBe(false); // Couch body.
    expect(collisionAtGameplayTile(home.collision, 6, 25)).toBe(false); // Coffee-table body.
    expect(collisionAtGameplayTile(home.collision, 8, 27)).toBe(true); // Open rug immediately beside the table.
    expect(collisionAtGameplayTile(home.collision, 9, 25)).toBe(true); // Open floor beside the furniture grouping.
    expect(collisionAtGameplayTile(home.collision, 6, 30)).toBe(true); // Open rug below the coffee table.
    expect(collisionAtGameplayTile(home.collision, 22, 27)).toBe(true); // Floor band in front of stove/fridge.
    expect(collisionAtGameplayTile(home.collision, 23, 28)).toBe(false); // Right pantry front.
    expect(collisionAtGameplayTile(home.collision, 10, 38)).toBe(false); // Bottom wall outside door.
    expect(collisionAtGameplayTile(home.collision, 12, 38)).toBe(true); // Bottom sliding-door floor remains walkable scenery.
  });

  it("keeps the Home collision companion synchronized with corrected semantic regions", () => {
    const home = runtimeMap("home");
    const semantic = readJson<FoundationSemantic & {
      walkable_regions: Array<{ tile_rect: TileRect }>;
      blocked_regions: Array<{ tile_rect: TileRect }>;
      passable_overrides: Array<{ tile_rect: TileRect }>;
    }>("public/data/maps/home/semantic.json");
    const derived = Array.from({ length: 43 }, () => Array.from({ length: 28 }, () => false));
    for (const region of semantic.walkable_regions) fillTiles(derived, region.tile_rect, true);
    for (const region of semantic.blocked_regions) fillTiles(derived, region.tile_rect, false);
    for (const region of semantic.passable_overrides) fillTiles(derived, region.tile_rect, true);
    expect(collisionFieldToGameplayGrid(home.collision, 28, 43)).toEqual(derived);
  });

  it("keeps the enlarged Overworld collision companion synchronized with semantic authority", () => {
    const overworld = runtimeMap("overworld");
    expect(collisionFieldToGameplayGrid(overworld.collision, 96, 68)).toEqual(deriveSemanticCollision("overworld", 96, 68));
  });

  it("aligns enlarged Overworld apartment buildings, paths, landscaping, parking, and vehicles", () => {
    const overworld = runtimeMap("overworld");
    expect(collisionAtGameplayTile(overworld.collision, 60, 20)).toBe(false); // North apartment lower roof/facade.
    expect(collisionAtGameplayTile(overworld.collision, 60, 34)).toBe(false); // Lulu apartment lower roof/facade.
    expect(collisionAtGameplayTile(overworld.collision, 60, 50)).toBe(false); // South apartment lower roof/facade.
    expect(collisionAtGameplayTile(overworld.collision, 60, 16)).toBe(true); // North building active walk-behind row.
    expect(collisionAtGameplayTile(overworld.collision, 60, 30)).toBe(true); // Middle building active walk-behind row.
    expect(collisionAtGameplayTile(overworld.collision, 60, 46)).toBe(true); // South building active walk-behind row.
    expect(collisionAtGameplayTile(overworld.collision, 65, 37)).toBe(true); // Visible Home doorway.
    expect(collisionAtGameplayTile(overworld.collision, 70, 40)).toBe(true); // Courtyard cross path.
    expect(collisionAtGameplayTile(overworld.collision, 68, 42)).toBe(false); // Courtyard landscaped island.
    expect(collisionAtGameplayTile(overworld.collision, 45, 40)).toBe(true); // West parking aisle.
    expect(collisionAtGameplayTile(overworld.collision, 49, 30)).toBe(false); // Parked car in west aisle.
  });

  it("aligns roads, sidewalks, crossings, and Charles Jr. exterior geometry", () => {
    const overworld = runtimeMap("overworld");
    expect(collisionAtGameplayTile(overworld.collision, 50, 8)).toBe(false); // SE Division traffic lane.
    expect(collisionAtGameplayTile(overworld.collision, 12, 8)).toBe(true); // Division east-side crosswalk.
    expect(collisionAtGameplayTile(overworld.collision, 8, 20)).toBe(false); // SE 148th traffic lane.
    expect(collisionAtGameplayTile(overworld.collision, 8, 13)).toBe(true); // South-side intersection crosswalk.
    expect(collisionAtGameplayTile(overworld.collision, 8, 39)).toBe(true); // Charles property crosswalk.
    expect(collisionAtGameplayTile(overworld.collision, 29, 21)).toBe(true); // Charles active walk-behind row.
    expect(collisionAtGameplayTile(overworld.collision, 29, 28)).toBe(false); // Charles lower building footprint.
    expect(collisionAtGameplayTile(overworld.collision, 29, 37)).toBe(true); // Charles entrance threshold.
    expect(collisionAtGameplayTile(overworld.collision, 22, 30)).toBe(true); // Charles parking aisle.
    expect(collisionAtGameplayTile(overworld.collision, 18, 26)).toBe(false); // Parked cars.
    expect(collisionAtGameplayTile(overworld.collision, 32, 41)).toBe(false); // Service carts.
    expect(collisionAtGameplayTile(overworld.collision, 40, 30)).toBe(false); // Property boundary hedge.
  });

  it("keeps lower nature and event routes accessible without crossing solid scenery", () => {
    const overworld = runtimeMap("overworld");
    expect(collisionAtGameplayTile(overworld.collision, 30, 55)).toBe(true); // Charles south lawn.
    expect(collisionAtGameplayTile(overworld.collision, 22, 53)).toBe(false); // Charles roadside sign.
    expect(collisionAtGameplayTile(overworld.collision, 65, 63)).toBe(true); // Lower dirt event area.
    expect(collisionAtGameplayTile(overworld.collision, 60, 59)).toBe(false); // North event fence.
    expect(collisionAtGameplayTile(overworld.collision, 65, 59)).toBe(true); // Visible center gate.
  });

  it("keeps Overworld transitions, arrivals, and authored NPC anchors on safe visible routes", () => {
    const overworld = runtimeMap("overworld");
    for (const transition of overworld.semantic.transitions) {
      const center = {
        x: transition.pixel_rect.x + transition.pixel_rect.width / 2,
        y: transition.pixel_rect.y + transition.pixel_rect.height / 2
      };
      expect(canOccupy(overworld, center, PLAYER.collider), transition.id).toBe(true);
    }
    for (const spawn of overworld.semantic.spawns) {
      expect(resolveSafeSpawn(overworld, spawn, PLAYER.collider), spawn.id).toEqual({
        position: spawn.pixel_point,
        adjusted: false
      });
    }
    for (const anchor of overworld.semantic.npc_spawn_markers) {
      expect(canOccupy(overworld, anchor.pixel_point, PLAYER.collider), anchor.id).toBe(true);
    }
  });

  it("preserves connected Day 1, bird, and lower-event routes on the corrected grid", () => {
    const overworld = runtimeMap("overworld");
    const homeArrival = overworld.semantic.spawns.find((spawn) => spawn.id === "spawn_overworld_from_home")!.pixel_point;
    const charlesDoor = overworld.semantic.transitions.find(
      (transition) => transition.id === "transition_overworld_to_charles_jr"
    )!.pixel_rect;
    const charlesTarget = { x: charlesDoor.x + charlesDoor.width / 2, y: charlesDoor.y + charlesDoor.height / 2 };
    const bushApproach = { x: 68.5 * 32, y: 40.5 * 32 };
    const birdHideout = { x: 23 * 32, y: 48.5 * 32 };
    const birdGang = findSafePlacement(overworld, { x: 87.5 * 32, y: 48.5 * 32 }, PLAYER.collider, true)!;
    const lowerEvent = overworld.semantic.npc_spawn_markers.find(
      (anchor) => anchor.id === "npc_anchor_lower_event_area"
    )!.pixel_point;

    for (const target of [charlesTarget, birdHideout, bushApproach, birdGang, lowerEvent]) {
      expect(hasCollisionRoute(overworld, homeArrival, target), JSON.stringify(target)).toBe(true);
    }
  });

  it("places the refrigerator objective within range of legal floor", () => {
    const home = runtimeMap("home");
    const refrigerator = home.semantic.interactions.find((candidate) => candidate.id === "interaction_refrigerator")!;
    const marker = {
      x: refrigerator.pixel_rect.x + refrigerator.pixel_rect.width / 2,
      y: refrigerator.pixel_rect.y + refrigerator.pixel_rect.height / 2
    };
    const legalFloor = { x: 720, y: 880 };
    expect(canOccupy(home, legalFloor, PLAYER.collider)).toBe(true);
    expect(canActivateObjectiveMarker(legalFloor, marker, 58)).toBe(true);
  });

  it("uses the top-left exterior door, not the bottom sliding door, for Home to Overworld", () => {
    const home = runtimeMap("home");
    const player = createPlayer({ x: 208, y: 624 }, "up");
    updatePlayer(player, { x: 0, y: -1 }, 0.1, home);
    expect(player.position.y).toBeLessThan(624);
    expect(transitionAt(home, player.position)?.id).toBe("transition_home_to_overworld");
    expect(transitionAt(home, { x: 448, y: 1248 })).toBeNull();

    const beforeFeeding = createDemoQuestState();
    const readyToLeave = feedBrutusForQuest(takeDogFood(beforeFeeding));
    expect(canUseQuestTransition(beforeFeeding, "transition_home_to_overworld")).toBe(false);
    expect(canUseQuestTransition(readyToLeave, "transition_home_to_overworld")).toBe(true);
  });

  it("keeps Home and Charles Jr. transitions reciprocal with valid named arrival spawns", () => {
    const maps = new Map((Object.keys(expected) as FoundationMapId[]).map((id) => [id, runtimeMap(id)]));
    for (const map of maps.values()) {
      for (const transition of map.semantic.transitions) {
        const target = maps.get(transition.target_map)!;
        expect(target.semantic.transitions.some((candidate) => candidate.id === transition.target_transition_id)).toBe(true);
        expect(target.semantic.spawns.some((spawn) => spawn.id === transition.target_spawn_id)).toBe(true);
      }
    }
  });

  it("ships every selected day/night base and alpha-derived foreground at full-canvas origin", () => {
    for (const id of Object.keys(expected) as FoundationMapId[]) {
      const map = runtimeMap(id);
      for (const visual of Object.values(map.visuals)) {
        expect(visual.base_layer.origin_px).toEqual({ x: 0, y: 0 });
        expect([visual.canvas.width_px, visual.canvas.height_px]).toEqual(expected[id].pixels);
        for (const layer of visual.foreground_layers) {
          expect(layer.alpha_components.length).toBeGreaterThan(0);
          const assetPath = resolve(process.cwd(), "public/assets/maps/native", layer.asset.replace(/^production\//, ""));
          expect(existsSync(assetPath), assetPath).toBe(true);
          expect(readPngDimensions(assetPath)).toEqual(expected[id].pixels);
        }
        const basePath = resolve(
          process.cwd(),
          "public/assets/maps/native",
          visual.base_layer.asset.replace(/^production\//, "")
        );
        expect(existsSync(basePath), basePath).toBe(true);
        expect(readPngDimensions(basePath)).toEqual(expected[id].pixels);
      }
    }
  });

  it("matches every selected map byte to the runtime authority manifest", () => {
    const manifest = readJson<{ map_assets_sha256: Record<string, string> }>("RUNTIME_AUTHORITY_MANIFEST.json");
    for (const [relative, expectedHash] of Object.entries(manifest.map_assets_sha256)) {
      const bytes = readFileSync(resolve(process.cwd(), "public/assets/maps/native", relative));
      expect(createHash("sha256").update(bytes).digest("hex"), relative).toBe(expectedHash);
    }
  });

  it("keeps every active visual descriptor synchronized with runtime asset and package authority", () => {
    const manifest = readJson<{
      map_visual_sources: { overworld: string; home_and_charles_jr: string };
      map_assets_sha256: Record<string, string>;
    }>("RUNTIME_AUTHORITY_MANIFEST.json");
    const expectedPackages: Record<FoundationMapId, string> = {
      overworld: manifest.map_visual_sources.overworld,
      home: manifest.map_visual_sources.home_and_charles_jr.split(" (")[0],
      charles_jr: manifest.map_visual_sources.home_and_charles_jr.split(" (")[0]
    };

    for (const id of Object.keys(expected) as FoundationMapId[]) {
      for (const phase of ["day", "night"] as const) {
        const visual = readJson<VisualAuthorityDescriptor>(`public/data/maps/${id}/visual_${phase}.json`);
        expect(visual.art_source).toEqual({
          package: expectedPackages[id],
          authority: "RUNTIME_AUTHORITY_MANIFEST.json"
        });
        expectAssetHash(visual.base_layer.asset, visual.base_layer.sha256, manifest.map_assets_sha256);
        for (const layer of visual.foreground_layers) {
          expectAssetHash(layer.asset, layer.sha256, manifest.map_assets_sha256);
          expectAssetHash(layer.day_asset, layer.day_sha256, manifest.map_assets_sha256);
          expectAssetHash(layer.night_asset, layer.night_sha256, manifest.map_assets_sha256);
        }
      }
    }
  });
});

type VisualAuthorityDescriptor = FoundationVisual & {
  art_source: { package: string; authority: string };
  base_layer: FoundationVisual["base_layer"] & { sha256: string };
  foreground_layers: Array<FoundationVisual["foreground_layers"][number] & {
    sha256: string;
    day_asset: string;
    day_sha256: string;
    night_asset: string;
    night_sha256: string;
  }>;
};

type TileRect = { x: number; y: number; width: number; height: number };

function deriveSemanticCollision(id: FoundationMapId, width: number, height: number): boolean[][] {
  const semantic = readJson<FoundationSemantic & {
    walkable_regions: Array<{ tile_rect: TileRect }>;
    blocked_regions: Array<{ tile_rect: TileRect }>;
    passable_overrides: Array<{ tile_rect: TileRect }>;
  }>(`public/data/maps/${id}/semantic.json`);
  const derived = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  for (const region of semantic.walkable_regions) fillTiles(derived, region.tile_rect, true);
  for (const region of semantic.blocked_regions) fillTiles(derived, region.tile_rect, false);
  for (const region of semantic.passable_overrides) fillTiles(derived, region.tile_rect, true);
  return derived;
}

function fillTiles(grid: boolean[][], rect: TileRect, value: boolean): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) grid[y][x] = value;
  }
}

function hasCollisionRoute(map: RuntimeMap, start: { x: number; y: number }, end: { x: number; y: number }): boolean {
  const tile = (point: { x: number; y: number }) => ({
    x: Math.floor(point.x / map.tileSize),
    y: Math.floor(point.y / map.tileSize)
  });
  const from = tile(start);
  const target = tile(end);
  const queue = [from];
  const visited = new Set([`${from.x},${from.y}`]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.x === target.x && current.y === target.y) return true;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;
      const center = { x: (next.x + 0.5) * map.tileSize, y: (next.y + 0.5) * map.tileSize };
      if (!canOccupy(map, center, PLAYER.collider)) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return false;
}

function expectAssetHash(asset: string, embeddedHash: string, manifestHashes: Record<string, string>): void {
  const relative = asset.replace(/^production\//, "");
  const bytes = readFileSync(resolve(process.cwd(), "public/assets/maps/native", relative));
  const actual = createHash("sha256").update(bytes).digest("hex");
  expect(embeddedHash, asset).toBe(actual);
  expect(manifestHashes[relative], asset).toBe(actual);
}

function readPngDimensions(path: string): readonly [number, number] {
  const png = readFileSync(path);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}
