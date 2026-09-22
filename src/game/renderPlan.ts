import type { ObjectRegion, SemanticCell } from "./world";

export type ObjectRenderRule = {
  mode: "fit" | "fillRegion" | "tile";
  anchor: "bottom" | "center";
  widthTiles?: number;
  heightTiles?: number;
};

export type DrawBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getStructureSpriteKey(cell: SemanticCell): string | undefined {
  if (cell === "doorway" || cell === "entrance_exit" || !cell) {
    return undefined;
  }
  return cell;
}

export function getObjectDrawBox(region: ObjectRegion, tileSize: number, rule: ObjectRenderRule): DrawBox {
  const footprint = {
    x: region.tileX * tileSize,
    y: region.tileY * tileSize,
    width: region.widthTiles * tileSize,
    height: region.heightTiles * tileSize
  };

  if (rule.mode === "fillRegion") {
    return footprint;
  }

  const width = (rule.widthTiles ?? region.widthTiles) * tileSize;
  const height = (rule.heightTiles ?? region.heightTiles) * tileSize;
  const x = footprint.x + (footprint.width - width) / 2;
  const y = rule.anchor === "center" ? footprint.y + (footprint.height - height) / 2 : footprint.y + footprint.height - height;

  return { x, y, width, height };
}
