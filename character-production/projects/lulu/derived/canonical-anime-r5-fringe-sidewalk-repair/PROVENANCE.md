# Lulu Revision 5 Targeted Repair Provenance

## Scope

Revision 5 is a narrow repair of the active revision-4 playable baseline:

- clean bright/neutral exterior fringe from idle and walk
- re-author only the Left and Right walk rows for clearer planted stepping and weight transfer
- preserve all other walk pose silhouettes
- preserve run byte-for-byte
- preserve walk/run playback contracts and world movement speed

## Immutable inputs

- Revision-4 project and runtime baseline: `character-production/projects/lulu/history/revision-4-targeted-repair-baseline`
- Left profile reference strip: `character-production/projects/lulu/imports/canonical-anime-r5-fringe-sidewalk-repair/left-walk-r4-reference.png`
- Right profile reference strip: `character-production/projects/lulu/imports/canonical-anime-r5-fringe-sidewalk-repair/right-walk-r4-reference.png`

The revision-4 baseline was copied before repair and was not edited.

## Authored profile sources

The built-in image-generation workflow edited the two real revision-4 profile reference strips independently. Each request required:

- the same eight-frame `4×2` contact/transfer/reach/high sequence
- a readable profile gait with planted feet and body-weight transfer
- the locked short dark bob, violet eye, choker, black outfit, and crimson rose accents
- fixed identity and proportions
- no mirroring, redesign, added props, substitute assets, or invented character variant
- a flat green extraction background for deterministic removal

Selected outputs:

- Left: `character-production/projects/lulu/imports/canonical-anime-r5-fringe-sidewalk-repair/left-walk-repaired-source.png`
- Right: `character-production/projects/lulu/imports/canonical-anime-r5-fringe-sidewalk-repair/right-walk-repaired-source.png`

The generated sources are preserved as production inputs; the browser canvas was not used as PNG authority.

## Deterministic processing

`tools/character-studio/scripts/repair-lulu-r5-fringe-sidewalk.ts` uses `sharp` to:

- recolor neutral bright exterior pixels from nearby opaque sprite colors without changing alpha
- remove the authored green extraction background and despill boundary pixels
- require exactly eight connected source components per profile direction
- pack all frames into fixed `96×96` cells
- register upper bodies at approximately `x=48`
- retain explicit root `48,88`
- place contact frames on `y=88` and authored high frames on `y=87`
- replace only walk rows 2 and 6

Outputs:

- `sheets/Lulu_idle.png`
- `sheets/Lulu_walk.png`
- `targeted-repair-report.json`

## Integrity evidence

- Idle output SHA-256: `a452fe1c63db84a936e8da83f97b4f563f99404d9bcafb3044e8937879649293`
- Walk output SHA-256: `a8cd8ed9b2dba2111df48aa59b21a0f4979fdc8da6694b36468dd1ec3f4499db`
- Preserved run SHA-256: `023512fe50aec9f743ea7cde5dc6b4aec79009eb433e6aa3b56cec8eae5ee7ec`
- Walk `cycleDistancePx`: `96` (unchanged)
- Run `cycleDistancePx`: `160` (unchanged)
- World movement speed changed: `false`

## Publication

- Stage: `2026-07-27T15-40-44-385Z-lulu-r5`
- Save backup: `character-production/backups/backup11`
- Publish backup: `character-production/backups/backup12`
- Published runtime files: idle sheet, walk sheet, and Lulu `CharacterManifestV2`
- Run sheet: stage-unchanged and not published

Canonical approval remains `unapproved`; visual gameplay and target-phone motion review remain human gates.
