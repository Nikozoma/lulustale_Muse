LULU'S TALE — OVERWORLD TREE FOREGROUND ASSETS
================================================

Purpose
-------
These assets add walk-behind depth to the approved Overworld without changing the base map image or semantic collision.

Active asset
------------
overworld_tree_canopy_foreground_96x68.png

This is a full-map transparent overlay containing conservative foliage-only canopy pixels copied from the approved Overworld artwork.

Runtime behavior
----------------
Overworld.visual.json places the overlay on drawLayer "foreground".
The renderer draws that layer after player/entities.
Result: Lulu and NPCs can pass visually behind tree canopy pixels while semantic collision remains separate.

Individual assets
-----------------
tree_canopies_96x68/tree_canopy_*.png

These are 21 per-tree transparent canopy crops retained for later Tile Tool refinement or replacement. They correspond one-to-one with the 21 connected 2x2 semantic tree regions (84 solid tree tiles) in Overworld.json.

Design choice
-------------
The masks are intentionally conservative. A slightly smaller canopy overlay is safer than carrying sidewalk, road, hedge, fence, trunk, or grass rectangles into the foreground layer.

No internet assets, generated replacement art, fake placeholders, or semantic changes were used.
