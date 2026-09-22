# Map Production

## Current Authority

The active maps are:

| Map | Tiles | Native pixels | Tile size | Collision cell |
| --- | ---: | ---: | ---: | ---: |
| Home | `28×43` | `896×1376` | `32 px` | `4 px` |
| Charles Jr. | `39×33` | `1248×1056` | `32 px` | `4 px` |
| Overworld | `96×68` | `3072×2176` | `32 px` | `4 px` |

The historical `48×34` Overworld is superseded. Never mix its coordinates, semantic data, artwork, or assumptions into the active `96×68` variant.

Authority boundaries:

- `map-projects/<map-id>/map-project.json`: canonical Map Studio authoring record;
- `public/data/maps`: active published semantic, collision, Day visual, and Night visual descriptors;
- `public/assets/maps/native`: active published native artwork;
- `public/data/maps/visual_companion_config.json`: runtime registry;
- legacy root map JSON/visual companions and old reports: historical unless the active runtime references them.

## Art and Semantics

Keep visual art and gameplay data separate.

- Visual descriptors own base/detail/foreground artwork, crops, placement, ordering, and phase-specific RGB.
- Semantic data owns map bounds, walkability meaning, interactions, markers, regions, transitions, spawns, and foreground trigger geometry.
- Collision owns physical occupancy. Never infer it automatically from visual pixels.
- Foreground layers own walk-behind rendering. Their semantic triggers and alpha must agree with visible geometry.

Day and dedicated Night use the same canvas, origin, semantic geometry, collision, transitions, spawns, and foreground alpha relationship. Only real phase-specific artwork/atmosphere differs. Do not apply a generic night tint over a dedicated Night visual.

## Map Studio Workflow

Map Studio is the current production/repair authority:

1. Load the live authoring project and current published sources.
2. Compare real Day/Night art, semantics, collision, foreground alpha, and triggers.
3. Identify a concrete defect using current game/Studio evidence.
4. Make the smallest coordinated change across every owning layer.
5. Save authoring state.
6. Run only the targeted validation that can affect the next action.
7. Stage the complete affected bundle and inspect the change.
8. Publish only when the applicable human approval gate is satisfied.

The Studio must block rather than invent art, semantics, transitions, collision, NPCs, objects, or sample data. Preserve source hashes, backups, staging boundaries, and explicit publication.

## Geometry and Collision

Canonical geometry is pixel-space rectangle, polygon, or point data. Tile coordinates are derived only when compatible with the `32 px` gameplay grid.

Collision schema v2 uses `4 px` cells with row RLE. The format supports sub-tile precision, but imported regions may still be uniform `32 px` blocks. Refine collision only from approved visible geometry and real movement feel; do not bulk-convert the map merely because finer cells exist.

Preserve approved geometry unless an explicitly approved repair requires coordinated changes to art, semantic regions, collision, transitions, or foreground triggers.

## HD and Detail Refinement

- Work at native map dimensions and evaluate at real game scale.
- Preserve established composition, navigation, entrances, landmarks, quest anchors, and readable pathways.
- Add detail only from real project art and approved visual direction.
- Keep Day/Night geometry registered.
- Preserve pixel-sharp presentation and avoid resampling drift.
- Treat lighting strength, density, seam visibility, collision feel, and foreground opacity as human visual/gameplay judgments.

## Active Gate

Home and Charles Jr. are marked calibrated in current Map Studio records. The Overworld is not.

Overworld calibration, especially the representative `x=16–43, y=16–43` area, sub-tile collision, Charles Jr. exterior approach, and foreground feel, remains behind explicit user approval. Validation and staging do not authorize publication or whole-map propagation.
