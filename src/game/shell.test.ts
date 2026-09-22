import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("game shell mobile-first UI", () => {
  it("boots through the Lulu's Tale title screen before gameplay", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(html).toContain('id="title-screen"');
    expect(html).toContain('id="title-screen" class="title-screen" aria-label="Lulu\'s Tale title screen" hidden');
    expect(html).toContain('id="title-play-button"');
    expect(html).toContain('/assets/ui/lulus-tale-title-screen.png');
    expect(main).toContain('titlePlayButton.addEventListener("click"');
    expect(main).toContain('await start();');
    expect(main).toContain('const restoredSave = readAutosave();');
    expect(main).not.toContain('start().catch');
    expect(main).toContain("canStartGameplay(getBootEnvironment())");
    expect(main).not.toContain("await tryEnterFullscreen();");
    expect(html).toContain('class="title-art-frame"');
    expect(css).toContain("width: min(100vw, calc(100vh * 16 / 9))");
    expect(css).toContain("aspect-ratio: 16 / 9");
    const titleArtCss = css.match(/\.title-screen-art\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(titleArtCss).toContain("object-fit: contain");
    expect(titleArtCss).not.toContain("object-fit: cover");
  });

  it.each([
    [640, 360, 640],
    [760, 360, 640]
  ])("contains the approved 16:9 title artwork without cropping at %sx%s", (width, height, expectedWidth) => {
    const artwork = readFileSync(resolve(process.cwd(), "public/assets/ui/lulus-tale-title-screen.png"));
    expect(readJpegDimensions(artwork)).toEqual([1536, 864]);
    expect(Math.min(width, height * (16 / 9))).toBe(expectedWidth);
  });

  it("ships the batch-1 menu and quest tracker foundation", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(html).toContain('id="menu-button"');
    expect(html).toContain('id="main-menu"');
    expect(html).toContain('id="menu-close"');
    expect(html).toContain('id="quest-tracker"');
    expect(html).toContain('id="quest-tracker-minimize"');
    expect(html).toContain('id="backup-load-input"');
    expect(html).toContain('id="menu-exit-button"');
    expect(html).not.toContain('data-menu-page="options"');
  });

  it("places development controls in a Debug menu page after Save / Load", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");
    expect(html.indexOf('data-menu-page="debug"')).toBeGreaterThan(html.indexOf('data-menu-page="save"'));
    expect(html).not.toContain('id="debug-toggle"');
    expect(html).not.toContain('id="phase-button"');
    expect(main).toContain('id="debug-overlay-toggle"');
    expect(main).toContain('id="debug-phase-switch"');
    expect(main).toContain('id="debug-reset-day1"');
    expect(main).toContain('id="debug-speed-input"');
    expect(main).toContain("let debugEnabled = false");
    expect(main).toContain("let playerSpeedMultiplier = DEFAULT_PLAYER_SPEED_MULTIPLIER");
    expect(main).toContain("battleState = null");
    expect(main).toContain("primaryBirdPosition = null");
    expect(main).toContain("persistAutosave();");
  });

  it("adds an off-by-default Quest Trail control backed by collision-aware routing", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");
    expect(main).toContain('id="quest-trail-toggle"');
    expect(main).toContain("let questTrailEnabled = DEFAULT_QUEST_TRAIL_ENABLED");
    expect(main).toContain("findQuestTrailPath(activeMap, player.position, target, PLAYER.collider)");
  });

  it("ships the batch-2 context action menu and overhead bubble shell", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(html).toContain('id="world-action-toggle"');
    expect(html).toContain('id="world-action-menu"');
    expect(html).toContain('data-world-action="use"');
    expect(html).toContain('data-world-action="chat"');
    expect(html).not.toContain('data-world-action="interact"');
    expect(html).toContain('data-world-action="pickup"');
    expect(html).toContain('id="objective-marker"');
    expect(html).toContain('data-open-companion');
    expect(html).toContain('id="world-chat-bubble"');
    expect(html).not.toContain("interaction-prompt");
  });

  it("has no dedicated Run control or obsolete touch-run wiring", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");
    const input = readFileSync(resolve(process.cwd(), "src/game/input.ts"), "utf8");
    expect(html).not.toContain('id="run-button"');
    expect(css).not.toContain("#run-button");
    expect(main).not.toContain("runButton");
    expect(input).not.toContain("touchRun");
    expect(input).not.toContain("setTouchRun");
  });

  it("ships the Brutus companion submenu inside the world interaction menu", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");

    expect(html).toContain('id="companion-action-menu"');
    expect(html).toContain("data-companion-back");
    expect(html).toContain('data-companion-action="pet"');
    expect(html).toContain('data-companion-action="feed"');
    expect(html).toContain('data-companion-action="sit"');
    expect(html).toContain('data-companion-action="follow"');
    expect(html).toContain('data-companion-action="lay"');
    expect(html).toContain('data-companion-action="fetch"');
    expect(css).toContain("max-height: calc(100dvh");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("grid-template-columns: 1fr 1fr");
    expect(main).toContain("button.hidden = companionMenuOpen || !target");
    expect(main).toContain('const brutusAvailable = quest.dogFed && phase === "day"');
    expect(main).toContain("brutusActionEntry.hidden = companionMenuOpen || !brutusAvailable");
  });

  it("wires the first-playthrough opening and reusable sleep fade into the existing shell", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");

    expect(html).toContain('id="screen-fade"');
    expect(css).toMatch(/\.screen-fade\s*\{[^}]*transition:\s*opacity 520ms ease-in-out/s);
    expect(main).toContain('text: "BEEP! BEEP! BEEP!"');
    expect(main).toContain("for (const tutorialId of OPENING_TUTORIAL_SEQUENCE)");
    expect(main).toContain("await runSleepWakeTransition");
    expect(main).toContain("input.resetMovementInput();");
  });

  it("keeps the orientation gate above the title and refreshes every mobile viewport source", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");
    expect(css).toMatch(/#orientation-gate\s*\{[^}]*z-index:\s*200/s);
    expect(main).toContain('window.addEventListener("orientationchange", scheduleDisplayRefresh)');
    expect(main).toContain('document.addEventListener("fullscreenchange", scheduleDisplayRefresh)');
    expect(main).toContain('window.visualViewport?.addEventListener("resize", scheduleDisplayRefresh)');
  });

  it("uses the visible objective marker as a phone-friendly interaction control", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");
    expect(html).toContain('id="objective-marker"');
    expect(html).toContain("❕");
    expect(main).toContain('objectiveMarker.addEventListener("click"');
    expect(main).toContain("canActivateObjectiveMarker(player.position, target, INTERACTION_RADIUS)");
    expect(css).toContain("width: 52px");
    expect(css).toContain("height: 52px");
  });
  it("ships the shared-field turn-based battle shell", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");

    expect(html).toContain('id="battle-panel"');
    expect(html).toContain('id="battle-scene"');
    expect(html).toContain('id="battle-player-combatant"');
    expect(html).toContain('id="battle-enemies"');
    expect(html).toContain('id="battle-attack"');
    expect(html).toContain('id="battle-defend"');
    expect(html).toContain('id="battle-item"');
    expect(html).not.toContain("battle-player-card");
    expect(html).not.toContain("battle-enemy-card");
    expect(main).toContain("createBattleBackdrop(activeMap, activeVisual.definition, player.position)");
    expect(main).toContain('battleMenuMode = "targets"');
    expect(main).toContain('data-battle-system="back"');
  });

});

function readJpegDimensions(jpeg: Buffer): readonly [number, number] {
  let offset = 2;
  while (offset < jpeg.length) {
    while (jpeg[offset] !== 0xff && offset < jpeg.length) offset += 1;
    while (jpeg[offset] === 0xff) offset += 1;
    const marker = jpeg[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = jpeg.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return [jpeg.readUInt16BE(offset + 5), jpeg.readUInt16BE(offset + 3)];
    }
    offset += length;
  }
  throw new Error("Title artwork does not contain JPEG dimensions.");
}
