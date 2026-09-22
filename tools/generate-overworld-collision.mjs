import { readFile, writeFile } from "node:fs/promises";

const semanticPath = new URL("../public/data/maps/overworld/semantic.json", import.meta.url);
const collisionPath = new URL("../public/data/maps/overworld/collision_grid.json", import.meta.url);
const semantic = JSON.parse(await readFile(semanticPath, "utf8"));
const { width, height } = semantic.map_dimensions.tiles;
const tileSize = semantic.map_dimensions.tile_size_px;

if (semantic.map_id !== "overworld" || width !== 96 || height !== 68 || tileSize !== 32) {
  throw new Error("Active enlarged Overworld authority must remain 96x68 at 32px per tile.");
}

const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
for (const [regions, value] of [
  [semantic.walkable_regions, true],
  [semantic.blocked_regions, false],
  [semantic.passable_overrides, true]
]) {
  for (const region of regions) {
    validateRegion(region);
    fill(region.tile_rect, value);
  }
}

const existing = JSON.parse(await readFile(collisionPath, "utf8"));
const output = {
  ...existing,
  width_tiles: width,
  height_tiles: height,
  tile_size_px: tileSize,
  derivation: "walkable union - blocked + passable overrides; evaluated per whole 32px tile",
  rows_rle: grid.map(encodeRow)
};
await writeFile(collisionPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

function validateRegion(region) {
  const rect = region.tile_rect;
  const pixels = region.pixel_rect;
  if (
    !rect ||
    !pixels ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width < 1 ||
    rect.height < 1 ||
    rect.x + rect.width > width ||
    rect.y + rect.height > height ||
    pixels.x !== rect.x * tileSize ||
    pixels.y !== rect.y * tileSize ||
    pixels.width !== rect.width * tileSize ||
    pixels.height !== rect.height * tileSize
  ) {
    throw new Error(`Invalid active Overworld semantic region: ${region.id}`);
  }
}

function fill(rect, value) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) grid[y][x] = value;
  }
}

function encodeRow(row) {
  const runs = [];
  let value = row[0];
  let count = 1;
  for (let index = 1; index < row.length; index += 1) {
    if (row[index] === value) {
      count += 1;
    } else {
      runs.push(`${count}:${value ? 1 : 0}`);
      value = row[index];
      count = 1;
    }
  }
  runs.push(`${count}:${value ? 1 : 0}`);
  return runs.join(",");
}
