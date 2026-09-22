# Lulu's Tale Map Studio workflow

## Runtime and authoring boundaries

`map-projects/<map-id>/map-project.json` is the canonical authoring record.
Runtime files under `public/data/maps` and `public/assets/maps/native` are
publication output after import. The Studio records their hashes and blocks
publication when any source changed externally.

The runtime registry is `public/data/maps/visual_companion_config.json`. Each
entry declares semantic, collision, Day visual, and Night visual descriptors.
The game keeps explicit quest guards for the current three-map demo. Legacy
root JSON and placement companions remain historical material only.

`map-projects/audits/index.json` records the two supplied categorical audits,
their source hashes, and the map repair categories exposed by the Studio.
Because the audits intentionally contain no coordinates, they never generate
repair geometry. Human current-build inspection supplies every real location.

## Existing-map repair

1. Select a live imported map.
2. Compare Day/Night, collision, semantic regions, foreground triggers, and
   foreground alpha over the exact real artwork.
3. Select real geometry and attach an audit-category repair annotation.
4. Make the smallest coordinated art, mask, trigger, semantic, or collision
   change.
5. Save the authoring project.
6. Validate. Missing assets, source drift, invalid bounds, broken references,
   non-reciprocal transitions, unreachable interaction areas, foreground-alpha
   mismatch, and invalid 96x68 Overworld authority are publication blockers.
7. Stage the full affected bundle and inspect the report.
8. Publish only after human approval. The backup location is returned in the
   publication result.

Raster changes are stored under `map-projects/<map-id>/art` until publication.
Externally edited PNGs may be linked by project-relative path. Their dimensions
and hashes are rechecked before staging.

## Raster and foreground editing

The base, detail, and foreground canvases use nearest-neighbor display. Tools
include brush, eraser, eyedropper, clone, crop-based real-asset stamp,
rectangular/polygon selection, and move/scale. Undo stores bounded pixel
patches, not full-canvas snapshots.

Mask Add changes alpha only where the selected foreground already contains real
RGB pixel data. Mask Remove clears alpha. The same alpha edit is applied to the
linked Day and Night layer. Component bounds are derived from nonzero alpha in
the selected area and cannot be independently typed. A new component requires
an explicit ID and trigger geometry plus matching real Day/Night alpha.

Use the real Lulu preview to inspect foot-anchor trigger behavior. If that asset
cannot load, the preview blocks instead of substituting a silhouette.

## Semantics and collision

Canonical geometry is pixel-space rectangle, polygon, or point data. Snapping is
32, 16, 8, 4px, or off. `tile_rect` and `tile_point` are derived only when
compatible with the 32px gameplay grid.

Collision schema v2 uses 4px cells and row RLE. The initial migration expanded
every old 32px cell to an identical 8x8 field. The runtime uses precise
occupancy, while the quest route remains a 32px search over precise candidate
occupancy. Collision strokes create explicit blocked or passable override
regions in canonical semantics.

## Day/Night

Day and dedicated Night share canvas, origin, semantic geometry, collision,
doors, transitions, spawns, and foreground alpha. Only real phase-specific RGB
and atmosphere differ. Single, split, wipe, blink, and difference views use one
coordinate system. The Studio never previews a generic tint over dedicated
Night art.

## New maps

Choose New Map Project and provide:

- a stable map ID and display name;
- a real full-resolution Day PNG;
- a real, dedicated full-resolution Night PNG;
- real semantic JSON with matching dimensions.

The Studio does not generate base art, Night art, semantics, transitions,
spawns, objects, NPCs, events, or sample data. Add foreground layers/components,
complete semantics and collision, validate reciprocal destinations, then stage.
Publication adds the runtime registry entry and rebuilds reciprocal transition
graph pairs when applicable. Gameplay and quest logic are implemented
separately.

## Recovery

Published bundles are backed up below `tools/backups/map-export-<timestamp>-<map>`.
Staged bundles live below `tools/map-editor/staging/<map>`. Both locations are
local generated state and are excluded from git.

If publication fails during replacement, every prepared temporary is removed
and all already-targeted files are restored from that publication's backup.
