# Lulu’s Tale Day 1 Demo — Chat Mode Implementation Report

## Status summary

The Day 1 demo quest flow and completed NPC/bird overworld assets have been integrated into the rebuilt playable foundation using normal Chat mode tooling during the temporary Work/Codex credit outage.

### Fully implemented in this pass

- Production NPC overworld assets copied into the runtime asset tree and loaded through a reusable world-actor asset registry.
- Production bird overworld assets copied into the runtime asset tree and loaded through the same actor architecture.
- Day 1 quest state machine wired into the current playable foundation.
- Objective text and one active `!` quest marker.
- Refrigerator interaction and dog-food pickup.
- Brutus feeding as a required quest step, while preserving the existing daytime companion subsystem.
- Charles Jr. service-counter interaction and fries acquisition.
- Fries-thief bird ambush using the approved Steller’s jay asset.
- Small directional “Secure the Bag” fry-defense minigame with convergent success/partial/failure outcomes.
- Daytime bird investigation and black-feather quest progression.
- Bed-controlled Day/Night quest progression.
- Daytime homeless-man cryptic warning encounter.
- Night wizard/guide encounter using the approved nighttime form.
- Sword pickup from an existing real Overworld bush rather than an invented placeholder prop.
- Night bird-gang encounter using approved lookout, fries-thief, and peck-captain bird assets.
- Temporary final battle resolution as an explicit automatic win, as authorized by the user, without pretending a full turn-based combat system exists.
- Return-home, sleep, and Day 2 teaser completion flow.
- Charles Jr. employee presence.
- Eight approved pedestrian variants placed as ambient daytime NPC visuals.
- Ambient robin presence.
- Existing map, Lulu, Brutus, camera, transition, collision, foreground, and responsive rendering foundations preserved.

### Intentionally partial / deferred

- Full turn-based battle system remains deferred. The current night battle is deliberately auto-resolved.
- Ambient pedestrians are currently rendered as idle actors; autonomous pedestrian walking routines are not implemented in this pass.
- Charles Jr. employee serve animation is available in the integrated assets but is not yet dynamically triggered.
- Full save/load is not implemented.
- Brutus fetch remains deferred because no authoritative standalone toy prop is available.
- Nighttime Brutus behavior remains deferred.

## Authoritative runtime baseline

Starting point:

- `Lulus_Tale_Playable_Foundation_v1.zip`

Preserved baseline systems include:

- authoritative 96×68 Overworld, Home, and Charles Jr. map integration;
- semantic collision and transition system;
- foreground occlusion;
- approved Lulu manifest-driven animation system;
- shared responsive camera/world scale;
- daytime Brutus companion behavior and synchronized interactions.

## Authoritative character inputs added

### NPCs

Source:

- `NPC_Overworld_Batch_v1.zip`

Integrated production groups include:

- homeless man — daytime;
- wizard — nighttime;
- Charles Jr. employee;
- eight pedestrian variants.

Runtime copies are under:

- `public/assets/characters/npcs/**`

### Birds

Source:

- `Bird_Overworld_Assets_Full_v1.zip`

Integrated story/ambient roles include:

- primary fries thief / Steller’s jay;
- peck captain / crow;
- bird lookout / junco;
- ambient robin.

Runtime copies are under:

- `public/assets/characters/birds/**`

No replacement or invented character artwork was generated.

## Quest implementation

Primary story reference:

- `Lulus_Tale_DEMO_QUESTLINE_ENHANCED_DRAFT.txt`

The implemented Day 1 state flow is represented in `src/game/demoQuest.ts` and covers:

1. Check the refrigerator.
2. Obtain dog food.
3. Feed Brutus.
4. Travel to Charles Jr.
5. Order fries.
6. Leave with fries.
7. Trigger the fries-thief bird encounter.
8. Play the short fry-defense minigame.
9. Investigate the bird and obtain the black-feather progression flag.
10. Return Home.
11. Use the bed and choose whether to stay up or sleep.
12. Enter Night Mode through the quest flow.
13. Leave Home at night.
14. Meet the wizard/guide.
15. Find the sword at an existing real bush.
16. Confront the nighttime bird gang.
17. Resolve the temporary battle as an explicit automatic win.
18. Return Home.
19. Sleep.
20. Advance to the Day 2 teaser state.

The player may sleep instead of immediately staying up; the nighttime quest thread remains pending so it can still be entered later rather than being lost.

## Day/Night behavior

- The game still begins in Day Mode.
- Quest progression now uses the bed for the intended Day/Night choice flow.
- Dedicated Day and Night artwork continues to be selected by the existing foundation runtime.
- The previous manual phase-switch test control remains debug-only rather than replacing the quest-facing bed flow.
- Brutus remains hidden/inactive during Night Mode; nighttime companion behavior was not invented.

## NPC and bird placement decisions

Placement uses existing authoritative map anchors and collision-safe runtime placement rather than arbitrary new semantic coordinates where possible.

Examples:

- daytime homeless-man encounter is derived from the actual Home/Charles Jr. route and collision-safe placement;
- nighttime wizard uses the established apartment-courtyard anchor;
- Charles Jr. employee uses the existing restaurant anchor structure;
- bird-gang placement is mapped into the established eastern parking/event context and resolved to collision-safe runtime positions;
- the sword interaction uses an existing real bush east of the Home transition.

The fenced lower event region was not forced into use merely because an old design draft referenced it.

## Changed source files

Modified:

- `index.html`
- `src/main.ts`
- `src/styles.css`
- `src/game/renderer.ts`

Added:

- `src/game/demoQuest.ts`
- `src/game/demoQuest.test.ts`
- `src/game/worldActors.ts`
- `src/game/worldActorsRuntime.test.ts`
- `public/assets/characters/npcs/**`
- `public/assets/characters/birds/**`
- `LULUS_TALE_DAY1_DEMO_CHAT_IMPLEMENTATION_REPORT.md`

Existing authoritative Lulu and Brutus runtime assets remain in place.

## Runtime/UI architecture decisions

- NPCs and birds use a generic world-actor render state rather than one-off renderer branches per character.
- Actors are depth-sorted with Lulu and Brutus using their world/root positions.
- Foreground occlusion includes world actors where appropriate.
- Only the active quest objective receives a pulsing `!` marker.
- Dialogue and choice UI use dedicated overlays.
- The fries-defense sequence uses a small directional input panel rather than a fake fixed outcome.
- The final battle explicitly identifies itself as a temporary auto-resolution rather than simulating a nonexistent combat system.

## Automated validation

### Dependency installation

- `npm ci`: PASS

### Tests

- `npm test`: PASS
- 21 test files
- 97 tests
- 0 failures

New targeted coverage includes:

- complete Day -> Night quest route;
- sleeping first while preserving the pending night quest;
- temporary auto-win bird-gang resolution and Day 2 progression;
- selected production NPC/bird runtime-sheet existence and geometry.

### Production build

- `npm run build`: PASS

### NPC production validator

- PASS
- 27 production sheets
- 0 failures

### Bird production validator

- PASS
- 26 production sheets
- 0 failures

## Development server

The development server was launched successfully in the Chat execution environment.

Observed internal addresses:

- `http://localhost:5173/`
- container-network address: `http://172.26.36.26:5173/`

The container-network address is not expected to be reachable from the user’s physical phone. After extracting locally, run:

`npm run dev -- --host 0.0.0.0`

and use the LAN URL printed by Vite for phone testing.

## Manual testing required

No automated gameplay navigation was used as a substitute for human testing.

The user should manually verify on PC and phone:

- Day 1 objective progression from Home through completion;
- refrigerator and Brutus feeding interactions;
- Charles Jr. transition and service-counter interaction;
- fries-thief encounter trigger;
- fry-defense directional minigame;
- bird-investigation progression;
- return-home flow;
- bed choices and Day/Night transition;
- daytime homeless-man warning placement;
- nighttime wizard encounter;
- sword/bush interaction;
- bird-gang encounter and temporary auto-win resolution;
- final return-home and Day 2 teaser;
- NPC and bird visual scale, grounding, direction, and depth;
- Lulu and Brutus systems for regressions;
- collision, transitions, foregrounds, and camera behavior;
- touch interaction and landscape phone layout.

## Known issues / risks

1. The complete Day 1 flow has automated state-machine coverage but has not yet received a real human end-to-end gameplay pass.
2. The final bird battle is intentionally an auto-win placeholder *behavior* authorized by the user; it is not a placeholder asset and does not claim to be the finished battle system.
3. Ambient pedestrians currently provide populated-world visuals but do not yet walk routes.
4. No full save/load exists, so refreshing the page resets the current demo run.
5. Quest marker placement and interaction feel may need small calibration after physical-phone testing.
6. The existing Home spawn safety fallback from the playable-foundation baseline remains in effect.

## Placeholder confirmation

No fake character art, invented NPC/bird replacements, placeholder maps, fake semantic coordinates, or temporary stock assets were added.

The only deliberately temporary gameplay behavior is the user-authorized automatic resolution of the final nighttime bird battle while the real turn-based combat system remains deferred.

## Suggested next step

Perform one full manual Day 1 walkthrough on PC and one on the target phone. Report concrete blockers or visual/gameplay defects, then make one focused correction pass rather than expanding scope before the demo route is proven.

## Git status

The supplied playable project is not a Git repository. No commits, branches, tags, pushes, or pull requests were created.
