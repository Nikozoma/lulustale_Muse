import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EDITOR_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PROJECT_ROOT = resolve(EDITOR_ROOT, "..", "..");
export const PROJECTS_ROOT = join(PROJECT_ROOT, "map-projects");
export const STAGING_ROOT = join(EDITOR_ROOT, "staging");
export const BACKUP_ROOT = join(PROJECT_ROOT, "tools", "backups");
export const RUNTIME_MAP_ROOT = join(PROJECT_ROOT, "public", "data", "maps");
export const RUNTIME_ASSET_ROOT = join(PROJECT_ROOT, "public", "assets", "maps", "native");
export const RUNTIME_AUTHORITY_PATH = join(PROJECT_ROOT, "RUNTIME_AUTHORITY_MANIFEST.json");
export const MAP_REGISTRY_PATH = join(RUNTIME_MAP_ROOT, "visual_companion_config.json");
export const TRANSITION_GRAPH_PATH = join(RUNTIME_MAP_ROOT, "transition_graph.json");
export const DEFAULT_PORT = Number(process.env.LULUS_MAP_EDITOR_PORT || 5187);
export const EDITOR_VERSION = "2.0.0-map-studio";
export const COLLISION_CELL_SIZE_PX = 4;
export const GAME_TILE_SIZE_PX = 32;
export const ACTIVE_MAP_IDS = ["home", "charles_jr", "overworld"];
export const MAX_JSON_BODY_BYTES = 32 * 1024 * 1024;
export const MAX_IMAGE_BODY_BYTES = 64 * 1024 * 1024;

export const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

export const OVERWORLD_AUTHORITY = Object.freeze({
  widthTiles: 96,
  heightTiles: 68,
  widthPx: 3072,
  heightPx: 2176,
  tileSizePx: 32
});
