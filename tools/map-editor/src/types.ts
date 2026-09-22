export type Phase = "day" | "night";
export type CompareMode = "single" | "split" | "wipe" | "blink" | "difference";
export type ToolMode =
  | "select"
  | "pan"
  | "rect"
  | "polygon"
  | "point"
  | "collision-open"
  | "collision-blocked"
  | "raster-brush"
  | "raster-eraser"
  | "eyedropper"
  | "clone"
  | "asset-stamp"
  | "mask-add"
  | "mask-remove"
  | "raster-select"
  | "raster-polygon";

export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };
export type Polygon = { points: Point[] };

export type SemanticRecord = {
  id: string;
  shape?: "rect" | "polygon";
  pixel_rect?: Rect;
  pixel_polygon?: Polygon;
  tile_rect?: Rect;
  pixel_point?: Point;
  tile_point?: Point;
  [key: string]: unknown;
};

export type SemanticMap = {
  $schema?: string;
  schema_version: string;
  map_id: string;
  coordinate_system: Record<string, unknown>;
  map_dimensions: {
    tiles: { width: number; height: number };
    pixels: { width: number; height: number };
    tile_size_px: number;
    world_scale: number;
  };
  day_night_contract: string;
  movement_resolution: Record<string, unknown>;
  walkable_regions: SemanticRecord[];
  blocked_regions: SemanticRecord[];
  passable_overrides: SemanticRecord[];
  structures: SemanticRecord[];
  objects: SemanticRecord[];
  doors: SemanticRecord[];
  transitions: SemanticRecord[];
  spawns: SemanticRecord[];
  npc_spawn_markers: SemanticRecord[];
  interactions: SemanticRecord[];
  event_regions: SemanticRecord[];
  foreground_occlusion_regions: SemanticRecord[];
  [key: string]: unknown;
};

export type AlphaComponent = {
  id: string;
  pixel_bbox: Rect;
  trigger_tile_rect?: Rect;
  trigger_pixel_rect?: Rect;
  trigger_pixel_polygon?: Polygon;
  area_px?: number;
  [key: string]: unknown;
};

export type ForegroundLayer = {
  id: string;
  kind?: string;
  z_index: number;
  asset: string;
  sha256?: string;
  occlusion_opacity?: number;
  alpha_components: AlphaComponent[];
  [key: string]: unknown;
};

export type VisualMap = {
  $schema?: string;
  schema_version: string;
  map_id: string;
  semantic_geometry: string;
  canvas: {
    width_px: number;
    height_px: number;
    tile_size_px: number;
    origin_px: Point;
  };
  variant: Phase;
  base_layer: {
    asset: string;
    sha256?: string;
    origin_px: Point;
    z_index: number;
    [key: string]: unknown;
  };
  detail_layers?: Array<{
    id: string;
    asset: string;
    sha256?: string;
    origin_px: Point;
    z_index: number;
  }>;
  foreground_layers: ForegroundLayer[];
  [key: string]: unknown;
};

export type CollisionSource = {
  schema_version: string;
  map_id: string;
  width_tiles: number;
  height_tiles: number;
  tile_size_px: number;
  cell_size_px?: number;
  width_cells?: number;
  height_cells?: number;
  rows_rle: string[];
  [key: string]: unknown;
};

export type CollisionPreview = {
  cellSize: number;
  width: number;
  height: number;
  cells: Uint8Array;
};

export type ArtLayer = {
  id: string;
  kind: "base" | "detail" | "foreground" | "mask" | "reference";
  path: string;
  sourcePath?: string;
  runtimeAsset: string;
  foregroundLayerId?: string;
  locked: boolean;
  visible?: boolean;
  sharedAlpha?: boolean;
  zIndex?: number;
  editedSha256?: string;
};

export type RepairAnnotation = {
  id: string;
  category: string;
  status: "open" | "in_progress" | "ready_for_review" | "approved";
  geometry: Rect | Polygon | Point;
  notes: string;
};

export type MapProjectManifest = {
  format: "lulus_map_project_v1";
  version: "1.0.0";
  mapId: string;
  displayName: string;
  dimensions: {
    widthTiles: number;
    heightTiles: number;
    widthPx: number;
    heightPx: number;
    tileSizePx: 32;
    collisionCellSizePx: 4;
  };
  runtime: {
    semantic: string;
    collision: string;
    dayVisual: string;
    nightVisual: string;
    assetRoot: string;
  };
  art: Record<Phase, { layers: ArtLayer[] }>;
  sourceHashes: Record<string, string>;
  lastExportHashes?: Record<string, string>;
  auditSources?: string[];
  repairAnnotations: RepairAnnotation[];
  approval?: {
    calibrationAreaApproved?: boolean;
    approvedAt?: string | null;
  };
  [key: string]: unknown;
};

export type LoadedProject = {
  manifest: MapProjectManifest;
  semantic: SemanticMap;
  visuals: Record<Phase, VisualMap>;
  collision: CollisionSource;
  audits: AuditIndex[];
  drift: Array<{ path: string; expected: string; actual: string | null }>;
  draft: Record<string, boolean>;
};

export type AuditIndex = {
  format: "lulus_map_audit_index_v1";
  map_repair_categories: Array<{
    id: string;
    label: string;
    status: string[];
  }>;
  coordinate_policy: string;
};

export type ProjectSummary = {
  mapId: string;
  displayName?: string;
  dimensions?: MapProjectManifest["dimensions"];
  repairCount?: number;
  calibrationAreaApproved?: boolean;
  sourceDrift?: Array<{ path: string }>;
  error?: string;
};

export type AssetInfo = {
  path: string;
  name: string;
  folder: string;
  width: number | null;
  height: number | null;
  bytes: number;
};

export type SelectedRecord = {
  collection: SemanticCollection;
  id: string;
};

export type SemanticCollection =
  | "walkable_regions"
  | "blocked_regions"
  | "passable_overrides"
  | "structures"
  | "objects"
  | "doors"
  | "transitions"
  | "spawns"
  | "npc_spawn_markers"
  | "interactions"
  | "event_regions";

export type RasterLayerState = {
  key: string;
  phase: Phase;
  layer: ArtLayer;
  image: HTMLImageElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  dirty: boolean;
};

export type HistorySnapshot = {
  label: string;
  semantic: SemanticMap;
  visuals: Record<Phase, VisualMap>;
  art: Record<Phase, { layers: ArtLayer[] }>;
  repairs: RepairAnnotation[];
  approval: MapProjectManifest["approval"];
};

export type ViewState = {
  zoom: number;
  panX: number;
  panY: number;
  phase: Phase;
  compareMode: CompareMode;
  comparePosition: number;
  snap: number;
  showGrid: boolean;
  showCollision: boolean;
  showSemantics: boolean;
  showForegroundTriggers: boolean;
  showRepairs: boolean;
  showLulu: boolean;
};
