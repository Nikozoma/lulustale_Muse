import type { VisualPhase } from "./visual";

export type FoundationMapId = "home" | "overworld" | "charles_jr";

export type WorldPoint = { x: number; y: number };
export type PixelRect = { x: number; y: number; width: number; height: number };
export type Collider = { width: number; height: number; centerOffsetY: number };

export type SpawnDefinition = {
  id: string;
  pixel_point: WorldPoint;
  facing: string;
  source_transition_id?: string;
};

export type TransitionDefinition = {
  id: string;
  pixel_rect: PixelRect;
  target_map: FoundationMapId;
  target_transition_id: string;
  target_spawn_id: string;
  activation: "player_enter";
};

export type InteractionDefinition = {
  id: string;
  pixel_rect: PixelRect;
  action: string;
  facing: string;
};

export type NpcAnchorDefinition = {
  id: string;
  pixel_point: WorldPoint;
  kind: string;
  facing: string;
  enabled_by_default: boolean;
};

export type FoundationSemantic = {
  schema_version: string;
  map_id: FoundationMapId;
  map_dimensions: {
    tiles: { width: number; height: number };
    pixels: { width: number; height: number };
    tile_size_px: number;
    world_scale: number;
  };
  spawns: SpawnDefinition[];
  transitions: TransitionDefinition[];
  interactions: InteractionDefinition[];
  npc_spawn_markers: NpcAnchorDefinition[];
};

export type CollisionSource = {
  schema_version: string;
  map_id: FoundationMapId;
  width_tiles: number;
  height_tiles: number;
  tile_size_px: number;
  width_pixels?: number;
  height_pixels?: number;
  cell_size_px?: number;
  width_cells?: number;
  height_cells?: number;
  encoding: "row_rle_count_colon_value";
  rows_rle: string[];
};

export type PixelPolygon = {
  points: WorldPoint[];
};

export type AlphaComponent = {
  id: string;
  pixel_bbox: PixelRect;
  trigger_tile_rect?: PixelRect;
  trigger_pixel_rect?: PixelRect;
  trigger_pixel_polygon?: PixelPolygon;
};

export type ForegroundLayer = {
  id: string;
  z_index: number;
  asset: string;
  sha256: string;
  occlusion_opacity?: number;
  alpha_components: AlphaComponent[];
};

export type VisualImageLayer = {
  id?: string;
  z_index: number;
  asset: string;
  sha256: string;
  origin_px: WorldPoint;
};

export type FoundationVisual = {
  schema_version: string;
  map_id: FoundationMapId;
  variant: VisualPhase;
  canvas: { width_px: number; height_px: number; tile_size_px: number };
  base_layer: { asset: string; sha256: string; origin_px: WorldPoint; z_index: number };
  detail_layers?: VisualImageLayer[];
  foreground_layers: ForegroundLayer[];
};

export type RuntimeMap = {
  id: FoundationMapId;
  semantic: FoundationSemantic;
  collision: CollisionField;
  visuals: Record<VisualPhase, FoundationVisual>;
  width: number;
  height: number;
  tileSize: number;
};

export type CollisionField = {
  cellSize: number;
  widthCells: number;
  heightCells: number;
  walkable: Uint8Array;
  isWalkableCell: (cellX: number, cellY: number) => boolean;
  setWalkableCell: (cellX: number, cellY: number, value: boolean) => void;
};

export type LoadedForeground = { definition: ForegroundLayer; image: HTMLImageElement };
export type LoadedMapVisual = {
  phase: VisualPhase;
  definition: FoundationVisual;
  base: HTMLImageElement;
  details: Array<{ definition: VisualImageLayer; image: HTMLImageElement }>;
  foregrounds: LoadedForeground[];
};

export const FOUNDATION_MAP_IDS: readonly FoundationMapId[] = ["home", "overworld", "charles_jr"];

export async function loadFoundationMaps(): Promise<Map<FoundationMapId, RuntimeMap>> {
  const registry = await fetchJson<RuntimeMapRegistry>("/data/maps/visual_companion_config.json");
  const entries = await Promise.all(
    FOUNDATION_MAP_IDS.map(async (id) => {
      const entry = registry.maps[id];
      if (!entry?.semantic || !entry.collision || !entry.day || !entry.night) {
        throw new Error(`Runtime map registry is missing the complete ${id} bundle.`);
      }
      const [semantic, collisionSource, day, night] = await Promise.all([
        fetchJson<FoundationSemantic>(registryHref(entry.semantic)),
        fetchJson<CollisionSource>(registryHref(entry.collision)),
        fetchJson<FoundationVisual>(registryHref(entry.day)),
        fetchJson<FoundationVisual>(registryHref(entry.night))
      ]);
      const collision = decodeCollisionGrid(collisionSource);
      validateRuntimeMap(id, semantic, collisionSource, day, night, collision);
      return [
        id,
        {
          id,
          semantic,
          collision,
          visuals: { day, night },
          width: semantic.map_dimensions.pixels.width,
          height: semantic.map_dimensions.pixels.height,
          tileSize: semantic.map_dimensions.tile_size_px
        }
      ] as const;
    })
  );
  return new Map(entries);
}

export async function loadMapVisual(map: RuntimeMap, phase: VisualPhase): Promise<LoadedMapVisual> {
  const definition = map.visuals[phase];
  const details = definition.detail_layers || [];
  const images = await Promise.all([
    loadImage(mapAssetHref(definition.base_layer.asset)),
    ...details.map((layer) => loadImage(mapAssetHref(layer.asset))),
    ...definition.foreground_layers.map((layer) => loadImage(mapAssetHref(layer.asset)))
  ]);
  const base = images[0];
  const detailImages = images.slice(1, 1 + details.length);
  const foregroundImages = images.slice(1 + details.length);
  return {
    phase,
    definition,
    base,
    details: details.map((detail, index) => ({
      definition: detail,
      image: detailImages[index]
    })),
    foregrounds: definition.foreground_layers.map((foreground, index) => ({
      definition: foreground,
      image: foregroundImages[index]
    }))
  };
}

export function decodeCollisionGrid(source: CollisionSource): CollisionField {
  const cellSize = source.cell_size_px ?? source.tile_size_px;
  const widthCells = source.width_cells ?? source.width_tiles;
  const heightCells = source.height_cells ?? source.height_tiles;
  if (
    !Number.isInteger(cellSize) ||
    cellSize < 1 ||
    !Number.isInteger(widthCells) ||
    widthCells < 1 ||
    !Number.isInteger(heightCells) ||
    heightCells < 1
  ) {
    throw new Error(`${source.map_id} collision dimensions are invalid.`);
  }
  if (source.rows_rle.length !== heightCells) {
    throw new Error(`${source.map_id} collision row count does not match its declared height.`);
  }
  const walkable = new Uint8Array(widthCells * heightCells);
  source.rows_rle.forEach((row, rowIndex) => {
    let cellX = 0;
    for (const run of row.split(",")) {
      const [countText, valueText] = run.split(":");
      const count = Number(countText);
      const value = Number(valueText);
      if (!Number.isInteger(count) || count < 1 || (value !== 0 && value !== 1) || cellX + count > widthCells) {
        throw new Error(`${source.map_id} collision row ${rowIndex} contains invalid RLE data.`);
      }
      if (value === 1) {
        walkable.fill(1, rowIndex * widthCells + cellX, rowIndex * widthCells + cellX + count);
      }
      cellX += count;
    }
    if (cellX !== widthCells) {
      throw new Error(`${source.map_id} collision row ${rowIndex} has ${cellX} columns.`);
    }
  });
  return createCollisionField(cellSize, widthCells, heightCells, walkable);
}

export function collisionFieldFromTileGrid(grid: boolean[][], tileSize = 32): CollisionField {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const walkable = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    if (grid[y]?.length !== width) throw new Error("Collision fixture rows must have equal width.");
    for (let x = 0; x < width; x += 1) walkable[y * width + x] = grid[y][x] ? 1 : 0;
  }
  return createCollisionField(tileSize, width, height, walkable);
}

export function collisionAtGameplayTile(
  collision: CollisionField,
  tileX: number,
  tileY: number,
  gameplayTileSize = 32
): boolean {
  const startX = Math.floor((tileX * gameplayTileSize) / collision.cellSize);
  const endX = Math.ceil(((tileX + 1) * gameplayTileSize) / collision.cellSize);
  const startY = Math.floor((tileY * gameplayTileSize) / collision.cellSize);
  const endY = Math.ceil(((tileY + 1) * gameplayTileSize) / collision.cellSize);
  for (let cellY = startY; cellY < endY; cellY += 1) {
    for (let cellX = startX; cellX < endX; cellX += 1) {
      if (!collision.isWalkableCell(cellX, cellY)) return false;
    }
  }
  return true;
}

export function collisionFieldToGameplayGrid(
  collision: CollisionField,
  widthTiles: number,
  heightTiles: number,
  gameplayTileSize = 32
): boolean[][] {
  return Array.from({ length: heightTiles }, (_, tileY) =>
    Array.from({ length: widthTiles }, (_, tileX) =>
      collisionAtGameplayTile(collision, tileX, tileY, gameplayTileSize)
    )
  );
}

export function canOccupy(map: RuntimeMap, point: WorldPoint, collider: Collider): boolean {
  const centerY = point.y + collider.centerOffsetY;
  const left = point.x - collider.width / 2;
  const right = point.x + collider.width / 2;
  const top = centerY - collider.height / 2;
  const bottom = centerY + collider.height / 2;
  if (left < 0 || top < 0 || right > map.width || bottom > map.height) {
    return false;
  }
  const epsilon = 0.001;
  const cellSize = map.collision.cellSize;
  const minCellX = Math.floor(left / cellSize);
  const maxCellX = Math.floor((right - epsilon) / cellSize);
  const minCellY = Math.floor(top / cellSize);
  const maxCellY = Math.floor((bottom - epsilon) / cellSize);
  for (let y = minCellY; y <= maxCellY; y += 1) {
    for (let x = minCellX; x <= maxCellX; x += 1) {
      if (!map.collision.isWalkableCell(x, y)) {
        return false;
      }
    }
  }
  return true;
}

export function transitionAt(map: RuntimeMap, point: WorldPoint): TransitionDefinition | null {
  return map.semantic.transitions.find((transition) => pointInRect(point, transition.pixel_rect)) ?? null;
}

export function getSpawn(map: RuntimeMap, spawnId?: string): SpawnDefinition {
  const spawn = spawnId
    ? map.semantic.spawns.find((candidate) => candidate.id === spawnId)
    : map.semantic.spawns.find((candidate) => candidate.id.includes("default"));
  if (!spawn) {
    throw new Error(`${map.id} is missing required spawn ${spawnId ?? "default"}.`);
  }
  return spawn;
}

export function resolveSafeSpawn(
  map: RuntimeMap,
  spawn: SpawnDefinition,
  collider: Collider
): { position: WorldPoint; adjusted: boolean } {
  if (canOccupy(map, spawn.pixel_point, collider) && transitionAt(map, spawn.pixel_point) === null) {
    return { position: { ...spawn.pixel_point }, adjusted: false };
  }
  const position = findSafePlacement(map, spawn.pixel_point, collider, true);
  if (!position) {
    throw new Error(`${map.id}:${spawn.id} has no safe runtime placement near its authoritative point.`);
  }
  return { position, adjusted: true };
}

export function findSafePlacement(
  map: RuntimeMap,
  origin: WorldPoint,
  collider: Collider,
  avoidTransitions = true
): WorldPoint | null {
  const candidates: WorldPoint[] = [{ ...origin }];
  for (let radius = 16; radius <= 160; radius += 16) {
    for (const [x, y] of [
      [0, radius],
      [-radius, 0],
      [radius, 0],
      [0, -radius],
      [-radius, radius],
      [radius, radius],
      [-radius, -radius],
      [radius, -radius]
    ] as const) {
      candidates.push({ x: origin.x + x, y: origin.y + y });
    }
  }
  return (
    candidates.find(
      (candidate) => canOccupy(map, candidate, collider) && (!avoidTransitions || transitionAt(map, candidate) === null)
    ) ?? null
  );
}

export function pointInRect(point: WorldPoint, rect: PixelRect): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}

export function pointInPolygon(point: WorldPoint, polygon: PixelPolygon): boolean {
  const points = polygon.points;
  if (points.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[index];
    const b = points[previous];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInForegroundTrigger(point: WorldPoint, component: AlphaComponent, tileSize: number): boolean {
  if (component.trigger_pixel_polygon) return pointInPolygon(point, component.trigger_pixel_polygon);
  if (component.trigger_pixel_rect) return pointInRect(point, component.trigger_pixel_rect);
  if (!component.trigger_tile_rect) return false;
  return pointInRect(point, {
    x: component.trigger_tile_rect.x * tileSize,
    y: component.trigger_tile_rect.y * tileSize,
    width: component.trigger_tile_rect.width * tileSize,
    height: component.trigger_tile_rect.height * tileSize
  });
}

function validateRuntimeMap(
  id: FoundationMapId,
  semantic: FoundationSemantic,
  collisionSource: CollisionSource,
  day: FoundationVisual,
  night: FoundationVisual,
  collision: CollisionField
): void {
  const dimensions = semantic.map_dimensions;
  if (
    semantic.map_id !== id ||
    collisionSource.map_id !== id ||
    day.map_id !== id ||
    night.map_id !== id ||
    dimensions.world_scale !== 1 ||
    dimensions.tile_size_px !== 32 ||
    day.canvas.width_px !== dimensions.pixels.width ||
    day.canvas.height_px !== dimensions.pixels.height ||
    night.canvas.width_px !== dimensions.pixels.width ||
    night.canvas.height_px !== dimensions.pixels.height ||
    collision.widthCells * collision.cellSize !== dimensions.pixels.width ||
    collision.heightCells * collision.cellSize !== dimensions.pixels.height
  ) {
    throw new Error(`${id} failed authoritative map contract validation.`);
  }
}

type RuntimeMapRegistry = {
  maps: Record<FoundationMapId, {
    semantic: string;
    collision: string;
    day: string;
    night: string;
  }>;
};

function createCollisionField(
  cellSize: number,
  widthCells: number,
  heightCells: number,
  walkable: Uint8Array
): CollisionField {
  return {
    cellSize,
    widthCells,
    heightCells,
    walkable,
    isWalkableCell(cellX: number, cellY: number): boolean {
      if (cellX < 0 || cellY < 0 || cellX >= widthCells || cellY >= heightCells) return false;
      return walkable[cellY * widthCells + cellX] === 1;
    },
    setWalkableCell(cellX: number, cellY: number, value: boolean): void {
      if (cellX < 0 || cellY < 0 || cellX >= widthCells || cellY >= heightCells) {
        throw new Error(`Collision cell ${cellX},${cellY} is out of bounds.`);
      }
      walkable[cellY * widthCells + cellX] = value ? 1 : 0;
    }
  };
}

function registryHref(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^(\.\/|\.\.\/maps\/)/, "");
  return `/data/maps/${normalized}`;
}

function mapAssetHref(assetPath: string): string {
  const relative = assetPath.replace(/^production\//, "");
  return `/assets/maps/native/${relative}`;
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
    image.onerror = () => reject(new Error(`Unable to load authoritative image ${href}.`));
    image.src = href;
  });
}
