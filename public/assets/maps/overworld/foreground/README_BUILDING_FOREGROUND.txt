LULU'S TALE — OVERWORLD BUILDING WALK-BEHIND ASSETS
=====================================================

Active files
------------

- ../overworld_walkbehind_base_96x68.png
- overworld_building_upper_foreground_96x68.png
- building_foreground_manifest.json

How the effect works
--------------------

The revised base replaces the four enlarged semantic rows corresponding to the
original upper two rows of each building with real ground pixels copied from
the approved Overworld artwork:

- grass beneath all three apartment buildings
- parking-lot asphalt beneath Charles Jr.

The matching original building pixels are stored in the transparent foreground
asset and drawn after Lulu and other entities.

Each building section is fully opaque while Lulu is outside its four-row zone.
While Lulu's feet are inside that zone, only that section fades to 42% opacity.
The player can therefore see Lulu walking behind the roof without permanently
fading the map.

At full opacity, the revised base plus foreground reproduces the approved source
map pixel-for-pixel. The original approved map remains in the project as the
source asset and was not overwritten.

Semantic behavior
-----------------

Exactly 384 enlarged tiles were released from building collision:

- North apartment: 112 tiles
- Charles Jr.: 48 tiles
- Lulu's apartment: 112 tiles
- South apartment: 112 tiles

Only the enlarged equivalent of the original upper two rows is walkable. All
lower building rows, doors, markers, transitions, trees, bushes, hedges, and
fences retain their existing behavior.

Asset provenance
----------------

No outside, generated, placeholder, or substitute art is used. Building pixels
and replacement ground pixels all come directly from the approved active
Overworld image. Exact source tile coordinates are recorded in
building_foreground_manifest.json.
