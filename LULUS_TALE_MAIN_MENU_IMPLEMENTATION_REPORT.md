# Lulu's Tale — Main Menu / Play Gate Implementation Report

## Summary

Implemented a dedicated title/main-menu boot screen for the Day 1 demo using the supplied Lulu's Tale title artwork.

The game no longer drops directly into gameplay on page load. Browser/PWA autosave restoration is deferred until the player explicitly presses the visible PLAY button on the title screen.

## Behavior

- Initial load shows the supplied Lulu's Tale title artwork full-screen.
- The artwork's visible PLAY button is used as the interaction target through an accessible overlay hit area.
- Pressing PLAY:
  1. requests fullscreen/orientation lock on a best-effort basis from the user gesture;
  2. initializes the runtime;
  3. reads and restores the existing browser/PWA autosave state;
  4. loads the appropriate map, phase, player, Brutus, inventory, equipment, status, quest, and flags;
  5. hides the title screen and enters gameplay.
- If no autosave exists, the existing new-game Day 1 defaults are used.
- If the device is portrait after PLAY, the existing landscape orientation gate remains active until rotation; the player is not asked to press PLAY a second time.
- Existing exported `.lulusave` backup save/load behavior is unchanged.

## Supplied asset used

- `public/assets/ui/lulus-tale-title-screen.png`
- Source: user-supplied title-screen artwork (`76408.png`)

No replacement or placeholder artwork was created.

## Changed files

Modified:

- `index.html`
- `src/main.ts`
- `src/styles.css`
- `src/game/shell.test.ts`

Added:

- `public/assets/ui/lulus-tale-title-screen.png`
- `LULUS_TALE_MAIN_MENU_IMPLEMENTATION_REPORT.md`

## Implementation details

### Boot sequencing

The previous module-level `start()` invocation was removed. Runtime initialization is now invoked only from the title-screen PLAY button click handler.

Because `readAutosave()` remains inside `start()`, persistent browser/PWA state is not restored until PLAY is pressed.

### Title interaction

The supplied artwork already contains its own rendered PLAY button. The implementation therefore uses a transparent, accessible HTML button positioned over that visual control instead of drawing a duplicate button on top of the artwork.

### Existing systems preserved

No changes were made to:

- Day 1 quest flow
- NPC dialogue/actions
- inventory/equipment
- autosave schema or backup save files
- turn-based combat
- map data or collision
- Lulu or Brutus assets/runtime
- Day/Night progression
- camera/world scale

## Commands run

- `npm ci --cache /mnt/data/npm-cache-mainmenu`
- `npm test`
- `npm run build`

## Tests / builds / checks

- `npm ci`: PASS
- Test suite: PASS — 26 test files, 119 tests
- Production build: PASS
- Title-screen production asset copied into `dist/assets/ui/`: PASS

A new shell regression test verifies:

- title-screen shell exists;
- PLAY control exists;
- supplied title artwork is referenced;
- gameplay starts from the PLAY click path;
- autosave restoration remains inside runtime startup;
- the old automatic module-level startup call is absent.

## Known issues

- The supplied title artwork has a 3:2 source aspect ratio while many target phones are wider. It is displayed with `object-fit: cover`, which can crop outer portions of the artwork on ultrawide displays. The PLAY hit target is deliberately broad enough to remain usable across landscape aspect ratios.
- Final visual framing on the target Galaxy Note 10+ still requires human device review.

## Blockers

None.

## Assumptions

- The supplied title-screen image is the approved title/main-menu artwork.
- The requested PLAY behavior means resume the current browser/PWA autosave when one exists, otherwise start the normal Day 1 default state.

## Suggested next step

Perform a real browser/phone launch test to confirm title-screen framing and PLAY hit-area feel, then continue with the full Day 1 walkthrough gate.

## Git status

The project is not a Git repository.

## Placeholder confirmation

No placeholders, fake assets, fake data, mocks, stub content, or temporary stand-ins were added.
