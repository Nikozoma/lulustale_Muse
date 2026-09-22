# Current Implemented State

Verified against the active repository on 2026-07-29. This is a baseline summary, not a changelog. Re-check live files before making changes.

## Runtime

- TypeScript/Vite/Canvas 2D mobile-first game with pixel-sharp rendering.
- Installable PWA via `vite-plugin-pwa`, including real icons, auto-updating service worker registration, app-shell/runtime-asset precaching, fullscreen/standalone display modes, and offline navigation fallback.
- Landscape/fullscreen boot lifecycle, portrait pause/gate behavior, responsive logical viewport scaling, touch movement, and silent keyboard development controls.
- Three active maps: Home `28×43`, Charles Jr. `39×33`, and the enlarged Overworld `96×68`, all at `32 px` per tile.
- Runtime map registry: `public/data/maps/visual_companion_config.json`. Active semantic/collision/phase visual data is under `public/data/maps`; native art is under `public/assets/maps/native`.
- Dedicated Day and Night visuals share semantics, collision, transitions, spawns, and foreground geometry. Building and tree foreground depth is active.
- Playable Day 1 flow includes current-objective guidance, interactions/dialogue, fries defense, manual bed-driven Day/Night progression, NPC/bird encounters, inventory/equipment/status, and the nighttime bird-gang sequence.
- The bird-gang encounter uses an implemented turn-based battle slice with attack, defend, fries item use, enemy turns, victory/defeat, retry, and experience reward.
- Schema-v1 local autosave and import/export backup saves are implemented.
- Brutus is a separate daytime companion with follow/stay, pet/feed, sit/lie-down, fetch, synchronized interactions, map-transition recovery, and Home ambient behavior. Nighttime Brutus behavior remains intentionally absent.
- The runtime is still largely composed in `src/main.ts`, with focused systems in `src/game`. Treat older reports describing missing PWA, saves, or turn-based combat as superseded.

## Map Authority and Studio

- Canonical authoring records are `map-projects/<map-id>/map-project.json`.
- Map Studio is the current production/repair tool. It separates authoring from staged and published runtime output, validates source drift and geometry, and creates backups on publication.
- Collision schema v2 is `4 px` occupancy with row RLE. Existing imported collision may still be coarse even though the format supports sub-tile precision.
- Home and Charles Jr. calibration flags are approved in their current project records.
- Overworld calibration is **not approved**. Its representative `x=16–43, y=16–43` region, sub-tile collision feel, and visual/foreground behavior remain human-gated. Staging or validation does not grant publication approval.
- Historical `48×34` Overworld data and legacy root JSON/visual companions are not active runtime authority.

## Character Authority and Studio

- Runtime character index: `public/assets/characters/INDEX.json`; runtime contracts: `public/assets/characters/v2/<id>/MANIFEST.json`.
- Character Studio project authority: `character-production/projects/<id>/project.json`. Publishing is explicit, staged, validated, hashed, and backed up.
- Active Lulu production state is project revision `8`, status `runtime_ready`, with current runtime manifest at `public/assets/characters/v2/lulu/MANIFEST.json`.
- Lulu uses `96×96` cells, six visual directions (`Down`, `Down-Left`, `Up-Left`, `Up`, `Up-Right`, `Down-Right`), root `48,88`, nearest-neighbor rendering, and map-specific render scales. Exact horizontal movement presents the last-context upper or lower diagonal with hysteresis.
- Current locomotion uses four-frame idle, eight-frame walk with `cycleDistancePx: 96`, and eight-frame run with `cycleDistancePx: 192`.
- Lulu's canonical approval is **unapproved** pending user gameplay and target-phone motion review. Current runtime readiness must not be reported as subjective/canonical approval.
- The focused revision-8 work removes pure Left/Right locomotion presentation and mechanically reconstructs the malformed fourth displayed Down-run pose. Other action art and portraits remain outside that repair. No approved portrait library exists.

## Material Gates

- User visual/gameplay/device review is still authoritative for Lulu motion, mobile lifecycle feel, map collision/foreground feel, and Overworld calibration.
- Overworld publication must remain behind its explicit calibration approval.
- Historical implementation reports are useful provenance but may describe systems or blockers that the live repository has since replaced.
