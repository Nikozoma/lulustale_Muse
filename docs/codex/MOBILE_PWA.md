# Mobile and PWA

## Settled Product Rules

- Mobile-phone-first and landscape-first.
- Touch is the primary player input; keyboard movement may remain silent for development.
- Normal player-facing UI must not present desktop-control instructions.
- Use large touch targets and safe-area-aware layout.
- World rendering remains pixel-sharp with responsive viewport scaling.
- The current-objective `!` is the interaction tap target; Lulu must be in range.
- No permanent Interact button or floating `Press E`/tap prompt.

## Current PWA Architecture

- Vite with `vite-plugin-pwa`.
- Real `192×192` and `512×512` standard/maskable icons under `public/pwa`.
- Manifest display is fullscreen with standalone fallback.
- Manifest orientation is `any` intentionally; the application lifecycle owns portrait gating and attempts landscape lock after user interaction where supported.
- Service worker registration auto-updates.
- The app shell and active map/character/runtime dependencies are collected from live registries/manifests and precached.
- Navigation falls back to `index.html`; outdated caches are cleaned.

Do not replace the current runtime-asset enumeration with hard-coded incomplete lists. Do not claim Android/native behavior from browser/PWA evidence; there is no current native implementation authority in this document.

## Display Lifecycle

- Before play, portrait orientation shows a blocking gate.
- Landscape entry requests fullscreen when supported and attempts `screen.orientation.lock("landscape")`.
- Unsupported or rejected fullscreen/orientation APIs degrade through the existing browser-managed fallback.
- Portrait changes during gameplay pause interaction/movement rather than continuing unseen input.
- Exit releases orientation/fullscreen where supported and clears transient movement state.
- Refresh display state on resize, orientation, fullscreen, and visual-viewport changes.

Preserve the existing boot/title/gameplay separation and do not add competing lifecycle state.

## Viewport and Input

- The logical camera height is fixed at `360`; width expands with the available landscape aspect ratio while preserving the core safe view.
- Backing resolution uses integer output scaling where possible, with a compatibility fallback for smaller displays.
- Canvas CSS size fits the available viewport without stretching the logical aspect ratio.
- Touch movement originates on the left half of the canvas, uses pointer capture, a deadzone, analog strength, and cancellation/reset handling.
- UI overlays, battle, dialogue, menus, and objective interaction block movement as appropriate.

## Validation Boundary

Use focused code/DOM checks for lifecycle state, touch routing, manifest configuration, and viewport math when they can affect the implementation.

Physical-phone review remains required for fullscreen transitions, browser chrome, orientation changes, safe areas, touch comfort, readability, performance, and resume behavior. Do not substitute synthetic browser resizing or automated navigation for that approval.
