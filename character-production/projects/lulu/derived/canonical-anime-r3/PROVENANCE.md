# Canonical Anime Revision 3 Provenance

## Inputs

- Approved visual inspiration: `../../imports/canonical-anime-r3/approved-visual-reference.png`
- Generation path: built-in image generation
- Production authority: deterministic `sharp` processing in `tools/character-studio/scripts/produce-canonical-lulu.ts`
- Project application: `tools/character-studio/scripts/apply-canonical-lulu-revision.ts`

The supplied image was used as inspiration for identity and styling. It was not treated as an editable sprite source, and its watermark was not reproduced.

## Final generation prompt set

Every directional source used the same production constraints:

> Create the same polished young adult female protagonist as crisp, hand-authored 2D pixel art for a top-down/three-quarter mobile RPG. Preserve the short asymmetrical tousled black bob, violet eyes where visible, black lace choker with small silver pendant, fitted black tunic with dark-crimson rose accents, opaque black leggings, and dark ankle boots. Use a perfectly flat `#00FF00` chroma background with no shadow, floor, grid, labels, text, watermark, logo, props, weapons, extra characters, cropped parts, or ponytail. Keep scale, ground line, proportions, physical hair part, and garment layout consistent. Do not mirror the authored character identity.

Action-specific prompts:

- `idle`: exactly four horizontally arranged frames—neutral inhale, gentle settle, natural blink or rear-view hair/shoulder motion, return to neutral—with planted feet and fixed root.
- `walk`: exactly eight horizontally arranged frames—first-foot contact, recoil, passing, high point, opposite-foot contact, recoil, passing, high point—with clear opposite arm swing, planted contacts, and no idle-looking or duplicate pose.
- `run`: exactly eight horizontally arranged frames—first-foot contact, compression, passing, airborne/high, opposite-foot contact, compression, passing, airborne/high—with forward lean, stronger arm drive, longer stride, and a clear distinction from walk.

Each action prompt was issued independently for:

`Down`, `Down-Left`, `Left`, `Up-Left`, `Up`, `Up-Right`, `Right`, `Down-Right`.

The generated source strips are immutable and remain `unreviewed` as source art. The selected deterministic derivative sheets are technically approved for runtime staging, while the overall canonical character approval remains pending user gameplay/device review.

## Deterministic processing

- chroma removal by green dominance and distance from `#00FF00`
- fringe despill near the key color
- nearest-neighbor reduction into a `96×96` authored cell
- binary alpha thresholding
- cleared RGB in fully transparent pixels
- horizontal centering
- explicit root at `48,88`
- authored walk vertical arc and run airborne placement
- row packing in the runtime eight-direction order

Exact input/output SHA-256 hashes, source bounds, packed body bounds, alpha counts, and sheet dimensions are recorded in `production-report.json`.
