# Overworld Calibration Issue Ledger

Observed 2026-07-25 in Lulu's Tale Map Studio and the current development game. Coordinates are authoritative Overworld tile coordinates unless pixel coordinates are shown. The representative gate remains tiles `x=16–43, y=16–43`.

## Objective findings

| ID | Coordinates / scope | Finding | Disposition |
| --- | --- | --- | --- |
| O-01 | Whole Overworld; calibration `16–43,16–43` | The collision grid is structurally 4 px (`768×544` cells), but all `6,528` 32 px tiles are uniform. The calibration region contains `784` uniform tiles (`370` blocked, `414` open) and zero mixed/sub-tile tiles. | Confirmed production gap. Do not bulk-convert: author only against approved geometry and real-game feel. |
| O-02 | Charles Jr. structure `x=25–34, y=20–37`; door/transition `x=28–30, y=36–38` | Structure, door, transition, foreground component, and visible entrance are registered and aligned. The entrance path is open in the Studio overlay. | No automatic repair. Preserve during calibration. |
| O-03 | Building foreground component 04: trigger `x=25–33, y=18–35`; pixel alpha bbox `812,600,258×525` | Dedicated day/night foreground alpha geometry matches. The trigger excludes the bottom entrance rows and uses `0.1` occlusion opacity. | Geometry confirmed; opacity/feel remains a human decision. |
| O-04 | Home production foreground | The two-white-circle derivative is absent from the loaded Home day/night maps. It is discoverable only at `map-projects/home/art/rejected/high_foreground_white_circle_smoke_test.png`. | Correctly rejected; never publish. |
| O-05 | Overworld authority | Fourteen current actor/quest anchors are present in authoring, validation passes, and five runtime files are staged. `approval.calibrationAreaApproved` remains `false`, so publication stays blocked. | Correct safe state. |

## Likely issues requiring focused real-game confirmation

These are geometry-to-feel candidates, not approved repairs.

| ID | Coordinates | Candidate issue | What to test |
| --- | --- | --- | --- |
| L-01 | Charles Jr. blocked footprint `x=25–34, y=24–37` plus west/east/south landscaping `x=23–35, y=22–38` | Rectangular tile collision does not follow the rounded building/curb outline at 4 px resolution. | Walk every rounded corner and both sides of the entrance; tighten only where Lulu visibly stops in empty pavement or clips landscaping. |
| L-02 | West parked cars `x=17–19, y=24–30`; north parked car `x=35–37, y=17–21` | Vehicle silhouettes are represented by full tile rectangles. | Test narrow approaches around bumpers and side gaps; author sub-tile cells only if the current boundary feels visibly oversized. |
| L-03 | Service carts `x=32–34, y=39–43` | A single rectangular block covers multiple irregular objects. | Test the approach from north and west; separate only if the current shape blocks visibly empty floor/driveway. |
| L-04 | Hedges `x=15–16, y=15–45`, `x=17–24, y=14–16`, `x=35–42, y=14–16`, `x=40–42, y=14–67` | Long tile rectangles may be mechanically correct but cannot express openings or curved ends. | Confirm every intended passage and end-cap in the representative region before changing collision. |
| L-05 | Tree trunk `x=16–17, y=17–18` | The 2×2 tile block is coarse relative to the visible trunk/canopy base. | Confirm collision and foreground handoff from all four sides. |
| L-06 | Forced browser resize after fullscreen, development UI only | The in-app browser's synthetic `760×360` resize after a fullscreen session briefly rendered the running canvas as a miniature in the upper-left; a fresh `760×360` launch gate rendered correctly. | Recheck the real portrait-exit/fullscreen lifecycle on the target phone before treating this as a runtime defect. |

## Subjective approval items

| ID | Coordinates | Human decision |
| --- | --- | --- |
| S-01 | Charles Jr. parking/asphalt `x=17–23, y=17–43` and east drive lane `x=35–40, y=17–43` | Whether pavement repetition and empty stretches need more native-resolution detail. |
| S-02 | South lawn/sign area `x=17–39, y=39–43` | Whether current grass/detail density is intentional or too sparse at game scale. |
| S-03 | Entire calibration `x=16–43, y=16–43` | Day/night mood, lighting strength, seam visibility, and readability at phone scale. |
| S-04 | Building foreground trigger `x=25–33, y=18–35` | Whether the `0.1` occlusion opacity and trigger activation feel natural while walking behind Charles Jr. |
| S-05 | Charles Jr. entrance `x=28–30, y=36–38` | Final transition approach feel and whether the marker/door alignment reads clearly in motion. |

## Staged actor and quest anchors

These positions preserve the current runtime intent and remain unpublished behind the calibration gate.

| Semantic ID | Tile point | Pixel point | Facing |
| --- | ---: | ---: | --- |
| `npc_anchor_homeless_day` | `47.5,37.5` | `1520,1200` | east |
| `npc_anchor_night_guide` | `71.5,42` | `2288,1344` | west |
| `npc_anchor_bird_hideout` | `23.5,48.5` | `752,1552` | west |
| `quest_anchor_bush_sword_approach` | `68.5,40.5` | `2192,1296` | north |
| `quest_anchor_bird_gang_center` | `87.5,48.5` | `2800,1552` | south |
| `npc_anchor_ambient_robin` | `75.25,44.25` | `2408,1416` | west |
| `npc_anchor_pedestrian_01` | `68,45.75` | `2176,1464` | south |
| `npc_anchor_pedestrian_02` | `75,44.25` | `2400,1416` | west |
| `npc_anchor_pedestrian_03` | `67.5,40` | `2160,1280` | east |
| `npc_anchor_pedestrian_04` | `75.5,40` | `2416,1280` | north |
| `npc_anchor_pedestrian_05` | `19.25,44.75` | `616,1432` | south |
| `npc_anchor_pedestrian_06` | `26.75,44.75` | `856,1432` | west |
| `npc_anchor_pedestrian_07` | `18.5,40` | `592,1280` | east |
| `npc_anchor_pedestrian_08` | `27.5,40` | `880,1280` | north |

## Gate state

- Map Studio validation: pass, with the expected calibration-approval warning.
- Staging: complete for semantic, collision, day visual, night visual, and runtime authority manifest.
- Publication: intentionally not performed.
- Whole-map propagation: intentionally not performed.
