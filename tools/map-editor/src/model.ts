import type {
  AlphaComponent,
  CollisionPreview,
  CollisionSource,
  Point,
  Rect,
  SemanticCollection,
  SemanticMap,
  SemanticRecord
} from "./types.js";

export const SEMANTIC_COLLECTIONS: SemanticCollection[] = [
  "walkable_regions",
  "blocked_regions",
  "passable_overrides",
  "structures",
  "objects",
  "doors",
  "transitions",
  "spawns",
  "npc_spawn_markers",
  "interactions",
  "event_regions"
];

export const COLLECTION_LABELS: Record<SemanticCollection, string> = {
  walkable_regions: "Walkable",
  blocked_regions: "Blocked",
  passable_overrides: "Passable Overrides",
  structures: "Structures",
  objects: "Objects",
  doors: "Doors",
  transitions: "Transitions",
  spawns: "Spawns",
  npc_spawn_markers: "NPC Anchors",
  interactions: "Interactions",
  event_regions: "Event Regions"
};

export const COLLECTION_COLORS: Record<SemanticCollection, string> = {
  walkable_regions: "#22c55e",
  blocked_regions: "#ef4444",
  passable_overrides: "#2dd4bf",
  structures: "#8b5cf6",
  objects: "#f59e0b",
  doors: "#38bdf8",
  transitions: "#06b6d4",
  spawns: "#ffffff",
  npc_spawn_markers: "#fde047",
  interactions: "#fb7185",
  event_regions: "#e879f9"
};

export function decodeCollision(source: CollisionSource): CollisionPreview {
  const cellSize = source.cell_size_px ?? source.tile_size_px;
  const width = source.width_cells ?? source.width_tiles;
  const height = source.height_cells ?? source.height_tiles;
  if (!Number.isInteger(cellSize) || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error("Collision source dimensions are invalid.");
  }
  if (source.rows_rle.length !== height) throw new Error("Collision row count is invalid.");
  const cells = new Uint8Array(width * height);
  source.rows_rle.forEach((row, y) => {
    let x = 0;
    for (const run of row.split(",")) {
      const [countText, valueText] = run.split(":");
      const count = Number(countText);
      const value = Number(valueText);
      if (!Number.isInteger(count) || count < 1 || (value !== 0 && value !== 1) || x + count > width) {
        throw new Error(`Collision row ${y} has invalid RLE.`);
      }
      if (value === 1) cells.fill(1, y * width + x, y * width + x + count);
      x += count;
    }
    if (x !== width) throw new Error(`Collision row ${y} width is invalid.`);
  });
  return { cellSize, width, height, cells };
}

export function compileCollisionPreview(semantic: SemanticMap, cellSize = 4): CollisionPreview {
  const width = semantic.map_dimensions.pixels.width / cellSize;
  const height = semantic.map_dimensions.pixels.height / cellSize;
  const cells = new Uint8Array(width * height);
  for (const [records, value] of [
    [semantic.walkable_regions, 1],
    [semantic.blocked_regions, 0],
    [semantic.passable_overrides, 1]
  ] as const) {
    for (const record of records) rasterizeRecord(cells, width, height, cellSize, record, value);
  }
  return { cellSize, width, height, cells };
}

export function recordContains(record: SemanticRecord, point: Point): boolean {
  if (record.pixel_point) return Math.hypot(record.pixel_point.x - point.x, record.pixel_point.y - point.y) <= 12;
  if (record.pixel_rect) return pointInRect(point, record.pixel_rect);
  if (record.pixel_polygon) return pointInPolygon(point, record.pixel_polygon.points);
  return false;
}

export function recordBounds(record: SemanticRecord): Rect | null {
  if (record.pixel_point) return { x: record.pixel_point.x - 6, y: record.pixel_point.y - 6, width: 12, height: 12 };
  if (record.pixel_rect) return record.pixel_rect;
  if (record.pixel_polygon) return polygonBounds(record.pixel_polygon.points);
  return null;
}

export function snapPoint(point: Point, snap: number): Point {
  if (snap <= 0) return point;
  return {
    x: Math.round(point.x / snap) * snap,
    y: Math.round(point.y / snap) * snap
  };
}

export function normalizeRecordGeometry(record: SemanticRecord): void {
  if (record.pixel_rect) {
    record.shape = "rect";
    const rect = record.pixel_rect;
    if ([rect.x, rect.y, rect.width, rect.height].every((value) => value % 32 === 0)) {
      record.tile_rect = {
        x: rect.x / 32,
        y: rect.y / 32,
        width: rect.width / 32,
        height: rect.height / 32
      };
    } else delete record.tile_rect;
    delete record.pixel_polygon;
    return;
  }
  if (record.pixel_polygon) {
    record.shape = "polygon";
    delete record.tile_rect;
    delete record.pixel_rect;
    return;
  }
  if (record.pixel_point) {
    record.tile_point = { x: record.pixel_point.x / 32, y: record.pixel_point.y / 32 };
  }
}

export function componentTriggerContains(component: AlphaComponent, point: Point): boolean {
  if (component.trigger_pixel_polygon) return pointInPolygon(point, component.trigger_pixel_polygon.points);
  if (component.trigger_pixel_rect) return pointInRect(point, component.trigger_pixel_rect);
  if (component.trigger_tile_rect) {
    return pointInRect(point, {
      x: component.trigger_tile_rect.x * 32,
      y: component.trigger_tile_rect.y * 32,
      width: component.trigger_tile_rect.width * 32,
      height: component.trigger_tile_rect.height * 32
    });
  }
  return false;
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}

export function pointInPolygon(point: Point, points: Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[index];
    const b = points[previous];
    if (!a || !b) continue;
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function rasterizeRecord(
  cells: Uint8Array,
  width: number,
  height: number,
  cellSize: number,
  record: SemanticRecord,
  value: number
): void {
  const bounds = recordBounds(record);
  if (!bounds) return;
  const minimumX = clamp(Math.floor(bounds.x / cellSize), 0, width);
  const minimumY = clamp(Math.floor(bounds.y / cellSize), 0, height);
  const maximumX = clamp(Math.ceil((bounds.x + bounds.width) / cellSize), 0, width);
  const maximumY = clamp(Math.ceil((bounds.y + bounds.height) / cellSize), 0, height);
  for (let y = minimumY; y < maximumY; y += 1) {
    for (let x = minimumX; x < maximumX; x += 1) {
      const point = { x: x * cellSize + cellSize / 2, y: y * cellSize + cellSize / 2 };
      if (recordContains(record, point)) cells[y * width + x] = value;
    }
  }
}

function polygonBounds(points: Point[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
