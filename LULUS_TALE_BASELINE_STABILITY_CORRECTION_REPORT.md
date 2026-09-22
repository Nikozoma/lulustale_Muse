# Lulu's Tale Baseline Stability Correction

Date: 2026-07-21

## Current Status

The Day 1 demo remains a coherent mobile-first, landscape-first baseline. This maintenance batch changes persistence, interaction routing, active visual metadata, and title-screen framing without adding story content, maps, actors, quests, encounters, or gameplay systems.

## Brutus Command-Pose Persistence

- Autosaves and backup saves retain `commandPose`.
- Save normalization preserves `stay/sit` and `stay/lay`, clears poses while following, and converts invalid or missing stay poses to Sit / Stay for backward compatibility.
- Startup restores Follow, Sit / Stay, and Lie Down into their correct runtime modes and visible actions.

## Objective-Marker Interaction

- The visible `❕` objective marker is now the direct tap/click target with a 52x52 logical-pixel hit area.
- Activation is accepted only while Lulu is within the 58-pixel interaction radius.
- `E` activates an in-range marked objective; contextual Use, Chat, Pick Up, and named Brutus actions remain in the Actions menu.
- The redundant generic Interact entry has been removed.

## Active Map Metadata Authority

- `RUNTIME_AUTHORITY_MANIFEST.json` remains authoritative for selected map artwork packages and asset SHA-256 values.
- All six active `visual_day.json` / `visual_night.json` files identify that manifest as authority and now match the selected Overworld HD v1 and interior Full v1_1 packages.
- Automated validation checks every active base and foreground descriptor against both the referenced PNG bytes and the authority manifest.
- No image pixels, layer placement, semantic geometry, transitions, collision, or coordinates changed.

## Current Bird Battle

The nighttime Bird Gang encounter remains the current turn-based implementation. Lulu can Attack, Defend, or use Fries; enemies resolve their turn; victory awards experience and advances the quest. No action-combat or sword-combat runtime was introduced.

## Ultrawide Title Behavior

- The checked-in approved title artwork is 1536x864 (16:9), despite an earlier 3:2 description; it is contained inside a centered 16:9 frame without stretching or crop.
- Extra width is letterboxed with the existing title background on 16:9 and ultrawide displays.
- PLAY remains positioned relative to the artwork and retains the existing 260x90 minimum hit area.
- Layout checks cover 640x360 and 760x360 logical views; both display the complete artwork at 640x360, centered in any extra ultrawide width.

## Validation

- `npm test`: passed, 26 files and 136 tests.
- `npm run build`: passed, including TypeScript and Vite production build.
- Automated gameplay navigation was not performed; PC and Galaxy Note 10+ manual gameplay checks remain required.
