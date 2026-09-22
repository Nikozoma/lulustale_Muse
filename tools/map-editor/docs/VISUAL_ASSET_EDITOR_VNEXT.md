# Visual Asset Editor vNext

## Purpose

This tool is for manually assigning real project assets to maps. It is meant to stop Codex from guessing sprite crops and repeated wall rules blindly.

## Separation rule

Tilemap Builder mode edits semantic/gameplay layers.

Tile Asset Editor mode edits visual placements only.

## Visual file format

Visual placements are stored in companion files next to the semantic map files:

```text
Home.json
Home.visual.json
```

Format:

```json
{
  "format": "lulus_visual_placements_v1",
  "version": "1.0",
  "mapFile": "Home.json",
  "mapId": "Home",
  "width": 28,
  "height": 43,
  "gameTileSizePx": 32,
  "visualLayerOrder": ["ground", "structures", "objects", "foreground"],
  "placements": []
}
```

Each placement stores:

```json
{
  "id": "vp_example",
  "label": "bed",
  "assetPath": "Top-Down_Retro_Interior/TopDownHouse_FurnitureState1.png",
  "crop": { "x": 0, "y": 0, "width": 32, "height": 48 },
  "tile": { "x": 10, "y": 5 },
  "draw": { "widthTiles": 2, "heightTiles": 3 },
  "anchor": "top-left",
  "drawLayer": "objects",
  "order": 12
}
```

## Workflow

1. Load a semantic map.
2. Switch to Tile Asset Editor mode.
3. Choose an asset folder and sprite sheet.
4. Select a crop from the sheet.
5. Set draw footprint, layer, anchor, and label.
6. Place the asset on the map.
7. Save Visual File.

## Backups

Direct saves always back up the overwritten file first.

Backups go to:

```text
tools/map-editor/backups/
```

Save reports go to:

```text
tools/map-editor/reports/
```
