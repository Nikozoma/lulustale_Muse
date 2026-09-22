import { COLLISION_CELL_SIZE_PX, GAME_TILE_SIZE_PX, OVERWORLD_AUTHORITY } from "./config.mjs";

export function compileCollisionV2(semantic, cellSize = COLLISION_CELL_SIZE_PX) {
  validateSemanticDimensions(semantic);
  if (GAME_TILE_SIZE_PX % cellSize !== 0) {
    throw new Error(`Collision cell size ${cellSize}px must divide the ${GAME_TILE_SIZE_PX}px gameplay tile.`);
  }
  const { width, height } = semantic.map_dimensions.pixels;
  if (width % cellSize !== 0 || height % cellSize !== 0) {
    throw new Error("Map pixel dimensions must be divisible by collision cell size.");
  }
  const widthCells = width / cellSize;
  const heightCells = height / cellSize;
  const cells = new Uint8Array(widthCells * heightCells);
  for (const [regions, value] of [
    [semantic.walkable_regions || [], 1],
    [semantic.blocked_regions || [], 0],
    [semantic.passable_overrides || [], 1]
  ]) {
    for (const region of regions) rasterizeRegion(cells, widthCells, heightCells, cellSize, region, value);
  }
  return {
    $schema: "../../schema/collision-grid.schema.json",
    schema_version: "2.0.0",
    map_id: semantic.map_id,
    width_tiles: semantic.map_dimensions.tiles.width,
    height_tiles: semantic.map_dimensions.tiles.height,
    tile_size_px: semantic.map_dimensions.tile_size_px,
    width_pixels: width,
    height_pixels: height,
    cell_size_px: cellSize,
    width_cells: widthCells,
    height_cells: heightCells,
    encoding: "row_rle_count_colon_value",
    derivation: "walkable union - blocked + passable overrides; rasterized at 4px using cell-center inclusion",
    rows_rle: encodeRows(cells, widthCells, heightCells)
  };
}

export function decodeCollisionSource(source) {
  const cellSize = Number(source.cell_size_px || source.tile_size_px);
  const width = Number(source.width_cells || source.width_tiles);
  const height = Number(source.height_cells || source.height_tiles);
  if (!Number.isInteger(cellSize) || cellSize < 1 || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error("Collision source has invalid dimensions.");
  }
  if (!Array.isArray(source.rows_rle) || source.rows_rle.length !== height) {
    throw new Error(`${source.map_id} collision row count does not match ${height}.`);
  }
  const cells = new Uint8Array(width * height);
  source.rows_rle.forEach((row, y) => {
    let x = 0;
    for (const run of row.split(",")) {
      const [countText, valueText] = run.split(":");
      const count = Number(countText);
      const value = Number(valueText);
      if (!Number.isInteger(count) || count < 1 || (value !== 0 && value !== 1) || x + count > width) {
        throw new Error(`${source.map_id} collision row ${y} has invalid RLE.`);
      }
      if (value === 1) cells.fill(1, y * width + x, y * width + x + count);
      x += count;
    }
    if (x !== width) throw new Error(`${source.map_id} collision row ${y} decodes to ${x}, expected ${width}.`);
  });
  return { cellSize, width, height, cells };
}

export function collisionEquivalentAtTileResolution(legacySource, compiledSource) {
  const legacy = decodeCollisionSource(legacySource);
  const precise = decodeCollisionSource(compiledSource);
  const scale = GAME_TILE_SIZE_PX / precise.cellSize;
  if (
    legacy.cellSize !== GAME_TILE_SIZE_PX ||
    precise.cellSize !== COLLISION_CELL_SIZE_PX ||
    legacy.width * scale !== precise.width ||
    legacy.height * scale !== precise.height
  ) {
    return false;
  }
  for (let tileY = 0; tileY < legacy.height; tileY += 1) {
    for (let tileX = 0; tileX < legacy.width; tileX += 1) {
      const expected = legacy.cells[tileY * legacy.width + tileX];
      for (let y = tileY * scale; y < (tileY + 1) * scale; y += 1) {
        for (let x = tileX * scale; x < (tileX + 1) * scale; x += 1) {
          if (precise.cells[y * precise.width + x] !== expected) return false;
        }
      }
    }
  }
  return true;
}

export function collisionEquivalentAtCellResolution(firstSource, secondSource) {
  const first = decodeCollisionSource(firstSource);
  const second = decodeCollisionSource(secondSource);
  if (
    first.cellSize !== second.cellSize ||
    first.width !== second.width ||
    first.height !== second.height ||
    first.cells.length !== second.cells.length
  ) {
    return false;
  }
  for (let index = 0; index < first.cells.length; index += 1) {
    if (first.cells[index] !== second.cells[index]) return false;
  }
  return true;
}

export function validateSemanticDimensions(semantic) {
  if (!semantic || typeof semantic !== "object" || !semantic.map_dimensions) {
    throw new Error("Semantic map is missing map_dimensions.");
  }
  const { tiles, pixels, tile_size_px: tileSize } = semantic.map_dimensions;
  if (
    !tiles ||
    !pixels ||
    !Number.isInteger(tiles.width) ||
    !Number.isInteger(tiles.height) ||
    tiles.width < 1 ||
    tiles.height < 1 ||
    tileSize !== GAME_TILE_SIZE_PX ||
    pixels.width !== tiles.width * tileSize ||
    pixels.height !== tiles.height * tileSize
  ) {
    throw new Error(`${semantic.map_id || "Map"} has inconsistent tile and pixel dimensions.`);
  }
  if (semantic.map_id === "overworld") {
    const expected = OVERWORLD_AUTHORITY;
    if (
      tiles.width !== expected.widthTiles ||
      tiles.height !== expected.heightTiles ||
      pixels.width !== expected.widthPx ||
      pixels.height !== expected.heightPx ||
      tileSize !== expected.tileSizePx
    ) {
      throw new Error("Active Overworld authority must remain 96x68 tiles / 3072x2176 pixels at 32px per tile.");
    }
  }
}

export function pixelRectToTileRect(rect) {
  if (
    !rect ||
    [rect.x, rect.y, rect.width, rect.height].some((value) => !Number.isFinite(Number(value))) ||
    rect.x % GAME_TILE_SIZE_PX !== 0 ||
    rect.y % GAME_TILE_SIZE_PX !== 0 ||
    rect.width % GAME_TILE_SIZE_PX !== 0 ||
    rect.height % GAME_TILE_SIZE_PX !== 0
  ) {
    return null;
  }
  return {
    x: rect.x / GAME_TILE_SIZE_PX,
    y: rect.y / GAME_TILE_SIZE_PX,
    width: rect.width / GAME_TILE_SIZE_PX,
    height: rect.height / GAME_TILE_SIZE_PX
  };
}

export function normalizeSemanticGeometry(semantic) {
  validateSemanticDimensions(semantic);
  const clone = structuredClone(semantic);
  for (const collection of [
    "walkable_regions",
    "blocked_regions",
    "passable_overrides",
    "structures",
    "objects",
    "doors",
    "transitions",
    "interactions",
    "event_regions"
  ]) {
    for (const region of clone[collection] || []) {
      validateRegion(region, clone.map_dimensions.pixels);
      if (region.pixel_rect) {
        region.shape = "rect";
        const tileRect = pixelRectToTileRect(region.pixel_rect);
        if (tileRect) region.tile_rect = tileRect;
        else delete region.tile_rect;
      } else {
        region.shape = "polygon";
        delete region.tile_rect;
      }
    }
  }
  for (const collection of ["spawns", "npc_spawn_markers"]) {
    for (const point of clone[collection] || []) {
      if (!point.pixel_point) throw new Error(`${collection}:${point.id} is missing pixel_point.`);
      const { x, y } = point.pixel_point;
      if (x < 0 || y < 0 || x >= clone.map_dimensions.pixels.width || y >= clone.map_dimensions.pixels.height) {
        throw new Error(`${collection}:${point.id} is outside the map.`);
      }
      point.tile_point = { x: x / GAME_TILE_SIZE_PX, y: y / GAME_TILE_SIZE_PX };
    }
  }
  return clone;
}

function rasterizeRegion(cells, width, height, cellSize, region, value) {
  validateRegion(region, { width: width * cellSize, height: height * cellSize });
  const bounds = region.pixel_rect || polygonBounds(region.pixel_polygon.points);
  const minX = clamp(Math.floor(bounds.x / cellSize), 0, width);
  const minY = clamp(Math.floor(bounds.y / cellSize), 0, height);
  const maxX = clamp(Math.ceil((bounds.x + bounds.width) / cellSize), 0, width);
  const maxY = clamp(Math.ceil((bounds.y + bounds.height) / cellSize), 0, height);
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const point = { x: x * cellSize + cellSize / 2, y: y * cellSize + cellSize / 2 };
      if (region.pixel_rect ? pointInRect(point, region.pixel_rect) : pointInPolygon(point, region.pixel_polygon.points)) {
        cells[y * width + x] = value;
      }
    }
  }
}

function validateRegion(region, pixels) {
  if (!region?.id) throw new Error("Semantic region is missing a stable id.");
  if (region.pixel_rect) {
    const rect = region.pixel_rect;
    if (
      [rect.x, rect.y, rect.width, rect.height].some((value) => !Number.isFinite(Number(value))) ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.x + rect.width > pixels.width ||
      rect.y + rect.height > pixels.height
    ) {
      throw new Error(`${region.id} has an invalid pixel_rect.`);
    }
    return;
  }
  const points = region.pixel_polygon?.points;
  if (!Array.isArray(points) || points.length < 3) throw new Error(`${region.id} needs pixel_rect or pixel_polygon.`);
  for (const point of points) {
    if (
      !Number.isFinite(Number(point.x)) ||
      !Number.isFinite(Number(point.y)) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > pixels.width ||
      point.y > pixels.height
    ) {
      throw new Error(`${region.id} has an out-of-bounds polygon point.`);
    }
  }
}

function encodeRows(cells, width, height) {
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const runs = [];
    let value = cells[y * width];
    let count = 1;
    for (let x = 1; x < width; x += 1) {
      const next = cells[y * width + x];
      if (next === value) count += 1;
      else {
        runs.push(`${count}:${value}`);
        value = next;
        count = 1;
      }
    }
    runs.push(`${count}:${value}`);
    rows.push(runs.join(","));
  }
  return rows;
}

function polygonBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}

function pointInPolygon(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
