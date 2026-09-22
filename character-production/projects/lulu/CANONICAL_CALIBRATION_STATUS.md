# Lulu Canonical Calibration Status

Observed 2026-07-28 in Character Studio project revision 7 and the published runtime contract.

## Current authority

- Production status: `runtime_ready`
- Project revision: `7`
- Canonical approval: `unapproved`
- Identity lock: enabled for the user-approved inspiration invariants
- Runtime render scales: Overworld `1`, Home `1.5`, Charles Jr. `1.5`, battle `1.3`
- Cell geometry: `96×96`, RGBA, binary alpha, cleared transparent RGB
- Explicit root: `48,88`
- Target silhouette: approximately `46×68`

## Final focused locomotion repair

The playable identity remains derived from the supplied anime reference preserved at:

`character-production/projects/lulu/imports/canonical-anime-r3/approved-visual-reference.png`

The revision-6 derivative, published through Character Studio as project revision 7, repairs the active idle/walk presentation and run cadence without changing world movement speed or unrelated actions.

Locked design invariants remain:

- short asymmetrical dark bob
- violet eyes
- black lace choker and small silver pendant
- black fitted tunic with dark-crimson rose accents
- opaque black leggings
- dark ankle boots

## Published locomotion contract

| Action | Directions | Frames | Treatment | Runtime sheet |
| --- | ---: | ---: | --- | --- |
| `idle` | 8 | 4 | Stronger neutral exterior-fringe cleanup; silhouettes and timing preserved | `public/assets/characters/generated/lulu/sheets/idle.png` |
| `walk` | 8 | 8 | Left/Right re-authored and phase-ordered; other six silhouettes preserved; `cycleDistancePx: 96` | `public/assets/characters/generated/lulu/sheets/walk.png` |
| `run` | 8 | 8 | Pixels preserved byte-for-byte; cadence changed from `160` to `192` pixels per cycle | `public/assets/characters/generated/lulu/sheets/run.png` |

Runtime direction order:

`Down`, `Down-Left`, `Left`, `Up-Left`, `Up`, `Up-Right`, `Right`, `Down-Right`.

No locomotion direction uses mirror provenance.

## Diagnosis and repair evidence

- Roots were already stable and collision/world movement code did not require changes.
- Revision-5 Left/Right walk mixed oversized contacts, neutral frames, and repeated high-knee poses. The replacement rows use equivalent `contact → recoil → passing → high` phases for both halves of the cycle.
- Left/Right upper-body registration remains within `x=47.5–48.5`.
- Contact/recoil frames remain at `y=88`; high frames rise one pixel to `y=87`.
- Loaded profile poses average at least five pixels wider than passing poses, making weight transfer and leg passage readable.
- Vertical and diagonal walk pose silhouettes are unchanged from revision 5.
- Strong neutral-bright exterior fringe pixels are `0` in both published idle and walk.
- Run remains exactly SHA-256 `023512fe50aec9f743ea7cde5dc6b4aec79009eb433e6aa3b56cec8eae5ee7ec`.
- At default full-strength running, the cadence changes from `1.5` to `1.25` cycles per second and from `12` to `10` frame changes per second. World speed remains `240 px/s`.

## Provenance and preservation

- The complete previously published revision-5 project, manifest, idle, walk, and run are preserved under `history/revision-5-locomotion-baseline`.
- Revision-6 authored profile sources and extracted revision-5 references are preserved under `imports/canonical-anime-r6-locomotion-engineering-repair`.
- Deterministic revision-6 sheets, hashes, phase ordering, registration, cleanup counts, candidate, and published project snapshot are under `derived/canonical-anime-r6-locomotion-engineering-repair`.
- Initial Character Studio save/publish backups: `backup13`, `backup14`.
- Final strict-fringe save/publish backups: `backup15`, `backup16`.
- Final stage: `2026-07-29T06-10-55-847Z-lulu-r7`.

## Remaining gate

Canonical approval remains intentionally `unapproved` until the user reviews the motion in gameplay and on the target phone.

Jump, dash, sit, pet dog, knocked down, hit, feed dog, throw toy, companion command, battle actions, and portraits remain outside this focused repair.
