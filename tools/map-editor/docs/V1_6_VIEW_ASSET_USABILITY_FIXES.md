# Tile Tool v1.6 — View / Asset Usability Fixes

## Summary

v1.6 focuses on the usability issues found while testing v1.5 in the live Lulu's Tale project.

## Fixes / Upgrades

### Map View Behavior

- `Color Coding View` shows semantic/color-coded map data.
- `Actual Asset View` now shows visual asset placements and auto-rendered semantic asset previews only.
- `Actual Asset View` no longer shows the translucent semantic color overlay.
- `Combined View` is now the only view where semantic overlay opacity and marker glyph overlay controls apply.

### Auto Asset Preview

Added a toggle:

- `Show auto asset preview from semantic map`

This draws a preview of the current Codex/game renderer-style assets generated from semantic IDs, such as floors, walls, furniture, buildings, trees, doors, dog/cashier markers, etc.

This preview is not saved as visual placements. It is only a guide so the user can see what the current game-style map looks like before manually overriding/adding visual placements.

### Sprite Sheet Viewer

Added explicit sprite sheet tools:

- `Select Crop`
- `Pan Sheet`

`Pan Sheet` mode allows left-dragging the sprite sheet to move around large sheets.

### Asset Folder Selector

The asset folder selector now uses grouped/shortened labels instead of repeating long full folder paths for every entry.

### Tilemap Builder Move Tool

Added Tilemap Builder tools:

- `Paint`
- `Move Tile`
- `Erase`

`Move Tile` lets the user drag a painted semantic cell within the currently selected semantic layer only. It does not affect other semantic layers and does not affect visual placements.

### Legacy Visual Data Recognition

The tool now recognizes more possible visual data structures when no current `.visual.json` file exists:

- `assetLayers`
- `assetPlacements`
- `visualPlacements`
- `visualLayers`

These are migrated in-memory into the v1 visual placements format when loaded. The original semantic map is not changed unless the user explicitly saves semantic edits.

## Preserved

- `tools/map-editor/tiletool.bat`
- current map naming: `Home.json`, `Charles.json`, `Overworld.json`
- visual companion naming: `Home.visual.json`, `Charles.visual.json`, `Overworld.visual.json`
- numbered project-relative backups in `tools/backups/backup<number>`
- semantic/visual mode separation
