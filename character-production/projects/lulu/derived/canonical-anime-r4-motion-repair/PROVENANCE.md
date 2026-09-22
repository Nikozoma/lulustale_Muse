# Lulu Revision 4 Motion Repair Provenance

## Scope

This revision repairs only the active playable `idle`, `walk`, and `run` actions. Runtime URLs remain unchanged.

The previously published revision-3 sheets, manifest, and project are preserved under `character-production/projects/lulu/history/revision-3-motion-baseline`.

## Image-edit sources

Built-in image editing used the active revision-3 sheets as edit targets. The selected immutable results are:

- `imports/canonical-anime-r4-motion-repair/idle-repaired-source.png`
- `imports/canonical-anime-r4-motion-repair/walk-repaired-source.png`
- `imports/canonical-anime-r4-motion-repair/run-repaired-source.png`

The common identity prompt locked the short asymmetrical black bob, violet eyes, black lace choker and silver pendant, fitted black tunic with dark-crimson roses, opaque black leggings, dark boots, young-adult proportions, and polished anime pixel-art direction.

The common repair prompt required:

- the exact eight-row runtime direction order
- the existing four-frame idle and eight-frame locomotion layouts
- stable skull, torso, hip, and planted-foot registration
- consistent proportions, hair, face, outfit, and palette
- removal of green fringe, debris, halos, stray pixels, and background remnants
- clear front, diagonal, profile, and rear directional readability
- no text, grid, shadow, watermark, props, or extra elements

Idle was constrained to a planted neutral, subtle settle, natural blink, and neutral return with no body bob.

Walk was constrained to left contact, recoil, passing, high point, right contact, recoil, passing, and high point with modest stride and restrained arm swing.

Run was constrained to left contact, compression, passing, modest airborne point, right contact, compression, passing, and modest airborne point with controlled forward lean and no extreme sprint deformation.

The run edit received one background-only follow-up: replace only its black backdrop with flat `#00FF00`, preserving every sprite, pose, scale, position, identity, and grid cell.

## Deterministic processing

`tools/character-studio/scripts/repair-lulu-motion-r4.ts`:

- removes the baked light checker or green key
- despills remaining green-dominant pixels
- identifies the exact connected character component for every authored frame
- groups components into the runtime direction/action order
- applies one fixed scale per action instead of per-frame normalization
- centers the upper body at `x=48`
- grounds contact frames at `y=88`
- limits walk rise to one pixel and run airborne rise to two pixels
- forces binary alpha and clears transparent RGB
- packs deterministic 96×96 runtime cells

Exact input/output SHA-256 hashes, bounds, scale, registration, cleanup counts, grounding, and cadence are recorded in `motion-repair-report.json`.

## Runtime cadence

- Walk: `cycleDistancePx` changed from `72` to `96`.
- Run: `cycleDistancePx` changed from `96` to `160`.
- Gameplay movement speed was not changed.
- Idle timing is `900/700/120/900 ms`.
