LULU'S TALE — ACTIVE NIGHT MAP VARIANTS
========================================

Runtime behavior
----------------

The three daytime semantic maps remain the gameplay authority:

- Home.json
- Charles.json
- Overworld.json

Night does not create duplicate collision, marker, transition, or interaction
data. When the manual bed-driven game state sets quest.isNight to true, the
runtime selects the corresponding night visual companion:

- Home.night.visual.json
- Charles.night.visual.json
- Overworld.night.visual.json

When night is false, the original daytime visual companions are used. If a
future map has no night companion, the runtime safely falls back to its daytime
visual plus the existing generic night tint.

Active assets
-------------

Home:
- home/home_night_28x43.png

Charles Jr.:
- charles/charles_jr_interior_night_39x33.png

Overworld:
- overworld/overworld_walkbehind_base_96x68_night.png
- overworld/foreground/overworld_building_upper_foreground_96x68_night.png
- overworld/foreground/overworld_tree_canopy_foreground_96x68_night.png

The active Overworld uses the dedicated walk-behind layers supplied in
Night.OW.ForG.zip because they preserve the exact daytime foreground masks,
building zones, and player/collision coordinates. The approved preview remains
excluded from this optimized playable copy because it is not loaded at runtime.

Foreground behavior
-------------------

- All four enlarged four-row building foregrounds remain active at night.
- Their combined walkable semantic footprint is 384 tiles.
- Each building stays opaque normally and fades to 42% only while Lulu's feet
  are inside its own zone.
- The night tree canopy uses the exact same alpha mask as the daytime canopy and
  remains at foreground order 100.
- No night visual asset changes semantic collision.

Source-pack optimization
------------------------

The uploaded reconstruction ZIPs and approved-preview copies are intentionally
excluded from this optimized playable project. Runtime visual companions load
only the active completed PNGs listed above. No runtime map image was removed.
