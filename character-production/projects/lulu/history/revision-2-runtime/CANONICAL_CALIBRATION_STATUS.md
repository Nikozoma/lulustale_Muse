# Lulu Canonical Calibration Status

Observed 2026-07-25 in the current Character Studio revision 2 and development runtime.

## Current authority

- Status: `runtime_ready`
- Canonical approval: `unapproved`
- Current live identity: preserved demo baseline, explicitly not the future Lucy-based canonical Lulu
- Runtime render scales: Overworld `1`, Home `1.5`, Charles Jr. `1.5`, battle `1.3`
- Cell geometry: `96×96`, true RGBA

## Exact current visual weakness

Character Studio validation passes schema, provenance, PNG, geometry, and production contracts, but reports 91 warnings:

- 1 unavailable historical source package: `Lulu_Overworld_Full_v1.zip`
- 90 exact duplicate-frame warnings

| Action | Exact duplicate warnings | Consequence |
| --- | ---: | --- |
| `idle` | 16 | Frames 3/4 repeat frames 1/2 in all eight directions. |
| `walk` | 8 | Frame 3 repeats frame 1 in every direction, leaving only three distinct poses in the four-frame cycle. |
| `pet_dog` | 10 | Multiple repeated interaction poses, including two repeated frames in some cardinal directions. |
| `jump` | 8 | Frame 4 repeats frame 1 in every direction. |
| `dash` | 8 | Frame 4 repeats frame 1 in every direction. |
| `knocked_down` | 8 | Frame 2 repeats frame 1 in every direction. |
| `hit` | 8 | Frame 3 repeats frame 1 in every direction. |
| `feed_dog` | 8 | Frame 4 repeats frame 1 in every direction. |
| `throw_toy` | 8 | Frame 4 repeats frame 1 in every direction. |
| `companion_command` | 8 | Frame 4 repeats frame 1 in every direction. |

The walk Direction Matrix is directionally coherent, but the repeated third pose makes the current locomotion read as a short, staccato three-pose loop. Game Motion confirms that distance-driven playback is functioning; this is an art/pose-coherence limitation, not evidence for a runtime animation-clock rewrite.

## Studio controls exercised

- Frame Editor, Direction Matrix, Animation, and Game Motion
- Overworld render scale `1` and battle render scale `1.3`
- Interaction Stage with Lulu `pet_dog` and Brutus `being_petted`
- Secondary action, direction, synchronized/fixed frame, render scale, and runtime X/Y offset controls
- Preview-only controls were restored to their loaded defaults after inspection

## Authored contracts confirmed

- Lulu throw anchor: `lulu_throw_origin_local`, `effect_origin`, local `48,47`
- Throw release event: `throw_toy_throw_release_frame`
- Feed spawn event: `feed_dog_food_spawn_frame`
- Feed contact event: `feed_dog_mouth_contact_frame`
- Brutus mouth anchor: `brutus_mouth_anchor_local`, local `48,59`
- Brutus pet contact anchor: `brutus_pet_contact_local`, local `48,56`

## Approved canonical-source search

No approved production-ready future canonical Lulu/Lucy sprite source exists in the active project.

- `Lulu_Overworld_Full_v1.zip` is absent and belongs to the current historical baseline contract, not a verified future canonical identity.
- The active approved Lulu PNGs are the current demo sheets already represented by Character Studio revision 2.
- The files under `public/assets/character-assets/references/not_runtime_ready/` are explicitly not runtime-ready and are not canonical production sources.
- No `.psd`, `.aseprite`, `.kra`, replacement `.zip`, or separately approved Lucy/Lulu production sheet was found.

## Gate state

- No art was generated, imported, substituted, edited, staged, or published.
- Canonical production remains blocked until an art owner supplies and approves a real production sprite source.
- The next human decision is identity and representative down/side/up idle-walk-run motion at the four real runtime scales. Only after that gate should the complete coherent action set be produced and published.
