export type LayerName = "ground" | "structures" | "objects" | "markers";
export type SemanticCell = string | null;
export type SemanticLayers = Record<LayerName, SemanticCell[][]>;

export type RawSemanticMap = {
  mapName: string;
  width: number;
  height: number;
  gameTileSizePx: number;
  layerOrder: LayerName[];
  layers: SemanticLayers;
};

export type SemanticMap = {
  name: string;
  widthTiles: number;
  heightTiles: number;
  tileSize: number;
  worldWidth: number;
  worldHeight: number;
  layerOrder: LayerName[];
  layers: SemanticLayers;
};

export type WorldPoint = {
  x: number;
  y: number;
};

export type MarkerPosition = WorldPoint & {
  tileX: number;
  tileY: number;
};

export type CollisionGrid = {
  widthTiles: number;
  heightTiles: number;
  solid: boolean[][];
  walkable: boolean[][];
  isSolidTile: (tileX: number, tileY: number) => boolean;
  isWalkableTile: (tileX: number, tileY: number) => boolean;
};

export type ObjectRegion = {
  id: string;
  tileX: number;
  tileY: number;
  widthTiles: number;
  heightTiles: number;
};

const REQUIRED_LAYERS: LayerName[] = ["ground", "structures", "objects", "markers"];

const WALKABLE_GROUND_IDS = new Set(["indoor_floor", "street", "sidewalk", "parking_lot", "crosswalk", "grass"]);
const SOLID_STRUCTURE_IDS = new Set([
  "exterior_wall",
  "interior_wall",
  "collision_block",
  "window",
  "player_apartment_building",
  "charles_jr_building",
  "apartment_building",
  "building_shell",
  "fence"
]);
const SOLID_OBJECT_IDS = new Set([
  "bed",
  "booth_seat",
  "cashier_counter",
  "couch",
  "table",
  "dining_table",
  "refrigerator",
  "counter_top",
  "sink",
  "stove",
  "furniture_appliance",
  "tree",
  "bush"
]);

export function normalizeSemanticMap(raw: RawSemanticMap): SemanticMap {
  for (const layer of REQUIRED_LAYERS) {
    if (!raw.layers[layer]) {
      throw new Error(`Semantic map is missing required layer: ${layer}`);
    }
  }

  for (const layer of REQUIRED_LAYERS) {
    const rows = raw.layers[layer];
    if (rows.length !== raw.height) {
      throw new Error(`Layer ${layer} has ${rows.length} rows; expected ${raw.height}.`);
    }

    rows.forEach((row, rowIndex) => {
      if (row.length !== raw.width) {
        throw new Error(`Layer ${layer} row ${rowIndex} has ${row.length} columns; expected ${raw.width}.`);
      }
    });
  }

  return {
    name: raw.mapName,
    widthTiles: raw.width,
    heightTiles: raw.height,
    tileSize: raw.gameTileSizePx,
    worldWidth: raw.width * raw.gameTileSizePx,
    worldHeight: raw.height * raw.gameTileSizePx,
    layerOrder: raw.layerOrder,
    layers: raw.layers
  };
}

export function findMarkerPositions(map: SemanticMap, markerId: string): MarkerPosition[] {
  const positions: MarkerPosition[] = [];

  map.layers.markers.forEach((row, tileY) => {
    row.forEach((cell, tileX) => {
      if (cell === markerId) {
        positions.push({
          x: tileX * map.tileSize + map.tileSize / 2,
          y: tileY * map.tileSize + map.tileSize / 2,
          tileX,
          tileY
        });
      }
    });
  });

  return positions;
}

export function buildCollisionGrid(map: SemanticMap): CollisionGrid {
  const walkable = Array.from({ length: map.heightTiles }, (_, tileY) =>
    Array.from({ length: map.widthTiles }, (_, tileX) => {
      const ground = map.layers.ground[tileY][tileX];
      const structure = map.layers.structures[tileY][tileX];
      const object = map.layers.objects[tileY][tileX];
      return Boolean(
        ground &&
          WALKABLE_GROUND_IDS.has(ground) &&
          !(structure && SOLID_STRUCTURE_IDS.has(structure)) &&
          !(object && SOLID_OBJECT_IDS.has(object))
      );
    })
  );

  const solid = Array.from({ length: map.heightTiles }, (_, tileY) =>
    Array.from({ length: map.widthTiles }, (_, tileX) => {
      return !walkable[tileY][tileX];
    })
  );

  return {
    widthTiles: map.widthTiles,
    heightTiles: map.heightTiles,
    solid,
    walkable,
    isSolidTile(tileX: number, tileY: number): boolean {
      if (tileX < 0 || tileY < 0 || tileX >= map.widthTiles || tileY >= map.heightTiles) {
        return true;
      }
      return solid[tileY][tileX];
    },
    isWalkableTile(tileX: number, tileY: number): boolean {
      if (tileX < 0 || tileY < 0 || tileX >= map.widthTiles || tileY >= map.heightTiles) {
        return false;
      }
      return walkable[tileY][tileX];
    }
  };
}

export function canOccupyCircle(
  map: SemanticMap,
  collision: CollisionGrid,
  position: WorldPoint,
  radius: number
): boolean {
  if (
    position.x - radius < 0 ||
    position.y - radius < 0 ||
    position.x + radius > map.worldWidth ||
    position.y + radius > map.worldHeight
  ) {
    return false;
  }

  const minTileX = Math.floor((position.x - radius) / map.tileSize);
  const maxTileX = Math.floor((position.x + radius) / map.tileSize);
  const minTileY = Math.floor((position.y - radius) / map.tileSize);
  const maxTileY = Math.floor((position.y + radius) / map.tileSize);

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      if (!collision.isSolidTile(tileX, tileY)) {
        continue;
      }

      const tileLeft = tileX * map.tileSize;
      const tileTop = tileY * map.tileSize;
      const closestX = clamp(position.x, tileLeft, tileLeft + map.tileSize);
      const closestY = clamp(position.y, tileTop, tileTop + map.tileSize);
      const dx = position.x - closestX;
      const dy = position.y - closestY;
      if (dx * dx + dy * dy < radius * radius) {
        return false;
      }
    }
  }

  return true;
}

export function collectObjectRegions(map: SemanticMap): ObjectRegion[] {
  return collectRegions(map.layers.objects);
}

export function collectStructureRegions(map: SemanticMap): ObjectRegion[] {
  return collectRegions(map.layers.structures);
}

function collectRegions(layer: SemanticCell[][]): ObjectRegion[] {
  const height = layer.length;
  const width = layer[0]?.length ?? 0;
  const seen = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  const regions: ObjectRegion[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = layer[y][x];
      if (!id || seen[y][x]) {
        continue;
      }

      const queue: Array<[number, number]> = [[x, y]];
      seen[y][x] = true;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      for (let index = 0; index < queue.length; index += 1) {
        const [currentX, currentY] = queue[index];
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);

        for (const [nextX, nextY] of [
          [currentX + 1, currentY],
          [currentX - 1, currentY],
          [currentX, currentY + 1],
          [currentX, currentY - 1]
        ] as const) {
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= width ||
            nextY >= height ||
            seen[nextY][nextX] ||
            layer[nextY][nextX] !== id
          ) {
            continue;
          }

          seen[nextY][nextX] = true;
          queue.push([nextX, nextY]);
        }
      }

      regions.push({
        id,
        tileX: minX,
        tileY: minY,
        widthTiles: maxX - minX + 1,
        heightTiles: maxY - minY + 1
      });
    }
  }

  return regions;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
