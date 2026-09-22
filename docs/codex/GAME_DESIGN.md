# Game Design and System Direction

This document records only durable, developer-relevant direction. The active implementation wins when older design files disagree.

## Demo Focus

- Stabilize and polish the current Home → Charles Jr. → fries/bird → manual Night → bird-gang vertical slice before expanding locations or major systems.
- Preserve real content, current maps, and the playable flow while improving systems incrementally.
- New content should be data-driven where practical, but content data must select registered behavior rather than execute arbitrary code.

## Interaction

- Mobile-first guidance uses one active current-objective `!` marker.
- The marker itself is tapped and only works while Lulu is in range.
- Do not show inactive-object marker spam, a permanent Interact button, or desktop prompts in normal play.

## Day and Night

- Day/Night is manual, not real-time.
- Exploration has no phase timer.
- The bed is the normal phase-advance hub; explicit story events may also change phase.
- Dedicated Day/Night visuals share map semantics and geometry.
- Current quest state carries day/phase progression; do not introduce a real-time clock.

## Combat

- Combat direction is turn-based, event/quest-triggered, and non-random.
- The current bird-gang vertical slice implements player attack, defend, item use, enemy turns, victory/defeat, retry, and experience reward.
- Extend the current turn-based contract coherently when requested. Do not reintroduce action-combat as the product direction.
- Party management, random encounters, and a broad combat content framework are deferred unless explicitly requested.

## Brutus

- Brutus is a core companion, separate runtime entity, story dependency, and important emotional/gameplay presence.
- Preserve synchronized Lulu/Brutus interactions, daytime follow/stay behavior, collision-safe recovery, and existing real interaction assets.
- Nighttime Brutus behavior is currently absent by design; do not invent it without an explicit decision and real authoritative assets/behavior.

## Platform and Scope

- Browser/PWA is the active runtime and delivery role.
- The game is mobile-first, landscape-first, touch-first, responsive, and pixel-sharp.
- An Android wrapper is not current runtime authority and should not be assumed when changing web behavior.
- Defer party management, crafting, procedural maps, random encounters, a large economy, relationship simulation, and additional large locations until explicitly prioritized.

## Human Authority

Human play and visual review decide pacing, readability, motion feel, collision feel, mobile ergonomics, art quality, and whether a vertical slice is ready. Automated checks establish structural confidence only.
