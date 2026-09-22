import type { ObjectRegion } from "./world";

export type VisualLayerName = "ground" | "structures" | "objects" | "foreground";
export type VisualPhase = "day" | "night";

export type RawVisualPlacement = {
  id?: unknown;
  label?: unknown;
  assetPath?: unknown;
  crop?: {
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
  };
  sx?: unknown;
  sy?: unknown;
  sw?: unknown;
  sh?: unknown;
  tile?: {
    x?: unknown;
    y?: unknown;
  };
  tileX?: unknown;
  tileY?: unknown;
  draw?: {
    widthTiles?: unknown;
    heightTiles?: unknown;
  };
  widthTiles?: unknown;
  heightTiles?: unknown;
  anchor?: unknown;
  drawLayer?: unknown;
  order?: unknown;
  playerOcclusionOpacity?: unknown;
  notes?: unknown;
};

export type RawVisualMap = {
  format?: unknown;
  version?: unknown;
  mapFile?: unknown;
  mapId?: unknown;
  displayName?: unknown;
  width?: unknown;
  height?: unknown;
  gameTileSizePx?: unknown;
  visualLayerOrder?: unknown;
  placements?: unknown;
};

export type VisualPlacement = {
  id: string;
  label: string;
  assetPath: string;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  tile: {
    x: number;
    y: number;
  };
  draw: {
    widthTiles: number;
    heightTiles: number;
  };
  anchor: string;
  drawLayer: VisualLayerName;
  order: number;
  playerOcclusionOpacity?: number;
  notes: string;
};

export type VisualMap = {
  format: string;
  version: string;
  mapFile: string;
  mapId: string;
  displayName: string;
  width: number;
  height: number;
  gameTileSizePx: number;
  visualLayerOrder: VisualLayerName[];
  placements: VisualPlacement[];
};

export type VisualMapVariants = Record<VisualPhase, VisualMap | null>;

export type VisualDrawRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LoadedVisualImages = Map<string, HTMLImageElement>;

export type VisualSpriteReference = {
  href: string;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type SemanticFallbackSuppressionReason = "none" | "covered-by-visual-placement" | "replaced-by-visual-sprite";

const DEFAULT_VISUAL_LAYER_ORDER: VisualLayerName[] = ["ground", "structures", "objects", "foreground"];
const VISUAL_LAYER_SET = new Set<string>(DEFAULT_VISUAL_LAYER_ORDER);

export function getVisualCompanionFileName(semanticFileName: string, phase: VisualPhase = "day"): string {
  const suffix = phase === "night" ? ".night.visual.json" : ".visual.json";
  return semanticFileName.replace(/\.json$/i, suffix);
}

export function selectVisualMapForPhase(variants: VisualMapVariants, phase: VisualPhase): VisualMap | null {
  return variants[phase] ?? variants.day;
}

export function shouldUseNightTintFallback(variants: VisualMapVariants, phase: VisualPhase): boolean {
  return phase === "night" && variants.night === null;
}

export function normalizeVisualMap(raw: RawVisualMap): VisualMap {
  if (!Array.isArray(raw.placements)) {
    throw new Error("Visual map is missing a placements array.");
  }

  const visualLayerOrder = normalizeLayerOrder(raw.visualLayerOrder);

  return {
    format: stringOrEmpty(raw.format),
    version: stringOrEmpty(raw.version),
    mapFile: stringOrEmpty(raw.mapFile),
    mapId: stringOrEmpty(raw.mapId),
    displayName: stringOrEmpty(raw.displayName),
    width: numberOrZero(raw.width),
    height: numberOrZero(raw.height),
    gameTileSizePx: numberOrZero(raw.gameTileSizePx),
    visualLayerOrder,
    placements: raw.placements.map((placement, index) => normalizePlacement(placement as RawVisualPlacement, index))
  };
}

export function sortVisualPlacements(visual: VisualMap, layer: VisualLayerName): VisualPlacement[] {
  return visual.placements
    .filter((placement) => placement.drawLayer === layer)
    .map((placement, index) => ({ placement, index }))
    .sort((a, b) => a.placement.order - b.placement.order || a.index - b.index)
    .map(({ placement }) => placement);
}

export function getVisualPlacementRect(placement: VisualPlacement, tileSize: number): VisualDrawRect {
  const width = placement.draw.widthTiles * tileSize;
  const height = placement.draw.heightTiles * tileSize;
  let x = placement.tile.x * tileSize;
  let y = placement.tile.y * tileSize;

  if (placement.anchor === "center") {
    x -= width / 2 - tileSize / 2;
    y -= height / 2 - tileSize / 2;
  } else if (placement.anchor === "bottom-center") {
    x -= width / 2 - tileSize / 2;
    y -= height - tileSize;
  }

  return { x, y, width, height };
}

export function getVisualPlacementOpacity(
  placement: VisualPlacement,
  playerFeet: { x: number; y: number } | undefined,
  tileSize: number
): number {
  if (placement.playerOcclusionOpacity === undefined || !playerFeet) {
    return 1;
  }

  const rect = getVisualPlacementRect(placement, tileSize);
  const playerIsInside =
    playerFeet.x >= rect.x &&
    playerFeet.x < rect.x + rect.width &&
    playerFeet.y >= rect.y &&
    playerFeet.y < rect.y + rect.height;

  return playerIsInside ? placement.playerOcclusionOpacity : 1;
}

export function regionOverlapsVisualPlacements(
  region: ObjectRegion,
  tileSize: number,
  placements: readonly VisualPlacement[]
): boolean {
  const regionRect = {
    x: region.tileX * tileSize,
    y: region.tileY * tileSize,
    width: region.widthTiles * tileSize,
    height: region.heightTiles * tileSize
  };

  return placements.some((placement) => rectanglesOverlap(regionRect, getVisualPlacementRect(placement, tileSize)));
}

export function placementsUseVisualSprite(
  placements: readonly VisualPlacement[],
  sprite: VisualSpriteReference | undefined
): boolean {
  if (!sprite) {
    return false;
  }

  return placements.some((placement) => placementUsesVisualSprite(placement, sprite));
}

export function getSemanticFallbackSuppressionReason(
  region: ObjectRegion,
  tileSize: number,
  placements: readonly VisualPlacement[],
  sprite?: VisualSpriteReference
): SemanticFallbackSuppressionReason {
  if (regionOverlapsVisualPlacements(region, tileSize, placements)) {
    return "covered-by-visual-placement";
  }

  if (placementsUseVisualSprite(placements, sprite)) {
    return "replaced-by-visual-sprite";
  }

  return "none";
}

export function visualAssetPathToHref(assetPath: string): string {
  const normalized = assetPath.replace(/\\/g, "/");
  if (normalized.startsWith("public/")) {
    return `/${normalized.slice("public/".length)}`;
  }
  if (normalized.startsWith("/")) {
    return normalized;
  }
  return `/${normalized}`;
}

function placementUsesVisualSprite(placement: VisualPlacement, sprite: VisualSpriteReference): boolean {
  return visualAssetPathToHref(placement.assetPath) === sprite.href && cropContains(sprite.crop, placement.crop);
}

function cropContains(container: VisualSpriteReference["crop"], contained: VisualSpriteReference["crop"]): boolean {
  return (
    contained.x >= container.x &&
    contained.y >= container.y &&
    contained.x + contained.width <= container.x + container.width &&
    contained.y + contained.height <= container.y + container.height
  );
}

function normalizePlacement(raw: RawVisualPlacement, index: number): VisualPlacement {
  const assetPath = stringOrEmpty(raw.assetPath);
  if (!assetPath) {
    throw new Error(`Visual placement ${index} is missing assetPath.`);
  }

  return {
    id: stringOrDefault(raw.id, `visual_${index}`),
    label: stringOrEmpty(raw.label),
    assetPath,
    crop: {
      x: numberOrZero(raw.crop?.x ?? raw.sx),
      y: numberOrZero(raw.crop?.y ?? raw.sy),
      width: numberOrDefault(raw.crop?.width ?? raw.sw, 32),
      height: numberOrDefault(raw.crop?.height ?? raw.sh, 32)
    },
    tile: {
      x: numberOrZero(raw.tile?.x ?? raw.tileX),
      y: numberOrZero(raw.tile?.y ?? raw.tileY)
    },
    draw: {
      widthTiles: numberOrDefault(raw.draw?.widthTiles ?? raw.widthTiles, 1),
      heightTiles: numberOrDefault(raw.draw?.heightTiles ?? raw.heightTiles, 1)
    },
    anchor: stringOrDefault(raw.anchor, "top-left"),
    drawLayer: normalizeLayer(raw.drawLayer),
    order: numberOrDefault(raw.order, index),
    playerOcclusionOpacity: optionalOpacity(raw.playerOcclusionOpacity),
    notes: stringOrEmpty(raw.notes)
  };
}

function normalizeLayerOrder(value: unknown): VisualLayerName[] {
  if (!Array.isArray(value)) {
    return DEFAULT_VISUAL_LAYER_ORDER;
  }

  const layers = value.map(normalizeLayer);
  return layers.length > 0 ? layers : DEFAULT_VISUAL_LAYER_ORDER;
}

function normalizeLayer(value: unknown): VisualLayerName {
  const layer = stringOrDefault(value, "objects");
  return VISUAL_LAYER_SET.has(layer) ? (layer as VisualLayerName) : "objects";
}

function optionalOpacity(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(1, Math.max(0, value));
}

function rectanglesOverlap(a: VisualDrawRect, b: VisualDrawRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberOrZero(value: unknown): number {
  return numberOrDefault(value, 0);
}

function numberOrDefault(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}
