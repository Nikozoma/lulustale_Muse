# Lulu Locomotion Engineering Repair Provenance

## Scope

This is one focused repair batch for the active playable Lulu:

- remove remaining neutral bright exterior fringe from idle and walk
- replace only the structurally defective Left/Right walk rows
- preserve vertical and diagonal walk silhouettes
- preserve run pixels while correcting overcranked runtime cadence
- preserve `96×96` cells, root `48,88`, eight authored directions, identity, world speed, and unrelated actions

## Authority and source gap

The active revision-5 project, runtime manifest, and published PNG bytes were treated as authority and preserved before work.

The requested note titled `Lulu’s Tale — Canonical Character Animation Engineering Principles` was not present in the active project or attachment directory. The explicit mechanical principles restated in the task—stable roots, eight authored directions, equivalent gait phases, temporal consistency, grounded weight transfer, and distance-synchronized cadence—were applied directly. No missing guidance was invented.

## Immutable inputs

- Revision-5 baseline: `character-production/projects/lulu/history/revision-5-locomotion-baseline`
- Extracted Left profile reference: `character-production/projects/lulu/imports/canonical-anime-r6-locomotion-engineering-repair/left-walk-r5-reference.png`
- Extracted Right profile reference: `character-production/projects/lulu/imports/canonical-anime-r6-locomotion-engineering-repair/right-walk-r5-reference.png`

## Built-in image-editing prompt set

The built-in image-editing workflow edited the real Left and Right revision-5 reference strips independently. Both prompts required:

- exactly eight full-body frames in a strict `4×2` grid
- `contact → recoil → passing → modest high` phases for each half-cycle
- clearly planted feet, visible weight transfer, subtle opposing arm swing, and distinguishable near/far legs
- fixed torso/head scale and horizontal registration with only subtle vertical bob
- the locked short dark bob, violet eye, choker, black outfit, and crimson rose accents
- the original facing in all frames; no mirroring
- the same pixel-art density and character scale
- flat `#00ff00` extraction background
- no high-knee marching, skating, body morphing, halo, debris, shadow, text, or watermark

Selected real production sources:

- `left-walk-r6-authored-source.png`
- `right-walk-r6-authored-source.png`

## Deterministic processing

`tools/character-studio/scripts/repair-lulu-r6-locomotion.ts`:

- extracts the active revision-5 profile rows as immutable references
- removes the flat green source background and despills edges
- requires exactly eight connected sprite components per direction
- orders frames into equivalent contact/recoil/passing/high phases
- packs to fixed `96×96` cells using nearest-neighbor resampling
- registers upper bodies at approximately `x=48`
- keeps contact/recoil/passing frames on `y=88` and high frames on `y=87`
- replaces only rows 2 and 6
- preserves all other walk alpha silhouettes
- replaces exterior neutral highlights only with non-neutral inward sprite colors or a dark bounded fallback
- leaves run PNG bytes unchanged

`tools/character-studio/scripts/apply-lulu-r6-locomotion.ts` authors the project metadata, profile bounds, grounded/contact phases, and run cycle distance.

## Final integrity

- Idle SHA-256: `b84346a39b1c1bb98b73f1e5ca50ae8b0cdfa745c4b06c85e3fd5a3844a0e378`
- Walk SHA-256: `1479783aa2ebf63ec68bcfe8cc8a104b03aa36920df176881e70f7886613e60c`
- Run SHA-256: `023512fe50aec9f743ea7cde5dc6b4aec79009eb433e6aa3b56cec8eae5ee7ec`
- Walk cycle distance: `96 px` (unchanged)
- Run cycle distance: `192 px` (previously `160 px`)
- World movement speed changed: `false`
- Strong neutral-bright exterior pixels in idle/walk: `0 / 0`
- Run pixel change: none

## Publication

- Final project revision: `7`
- Final stage: `2026-07-29T06-10-55-847Z-lulu-r7`
- Changed runtime bytes/contracts: idle sheet, walk sheet, Lulu runtime manifest
- Final save backup: `character-production/backups/backup15`
- Final publish backup: `character-production/backups/backup16`

Canonical approval remains `unapproved`; gameplay and target-phone motion review remain human gates.
