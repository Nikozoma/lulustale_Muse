import { describe, expect, it } from "vitest";
import {
  DISPLAY_REFRESH_EVENTS,
  canStartGameplay,
  deriveBootView,
  getDisplayViewportSize,
  type BootEnvironment
} from "./bootFlow";

const landscapeReady: BootEnvironment = {
  portrait: false,
  fullscreenSupported: true,
  fullscreenActive: true,
  fullscreenDisplayMode: false,
  fullscreenEntryAccepted: true,
  fullscreenFallbackAccepted: false,
  gameplayStarted: false,
  exitPending: false
};

describe("mobile boot and display flow", () => {
  it("gives the portrait gate priority over the title and blocks PLAY", () => {
    const environment = { ...landscapeReady, portrait: true };
    expect(deriveBootView(environment)).toEqual({
      gate: "portrait",
      titleVisible: false,
      titleInteractive: false,
      gameplayPaused: true
    });
    expect(canStartGameplay(environment)).toBe(false);
  });

  it("requires the landscape fullscreen gesture before exposing the title", () => {
    const needsFullscreen = { ...landscapeReady, fullscreenActive: false, fullscreenEntryAccepted: false };
    expect(deriveBootView(needsFullscreen).gate).toBe("fullscreen");
    expect(canStartGameplay(needsFullscreen)).toBe(false);
    expect(deriveBootView(landscapeReady)).toMatchObject({ gate: null, titleVisible: true, titleInteractive: true });
    expect(canStartGameplay(landscapeReady)).toBe(true);
  });

  it("accepts an installed fullscreen display mode without a redundant Fullscreen API gesture", () => {
    const installedFullscreen = {
      ...landscapeReady,
      fullscreenDisplayMode: true,
      fullscreenEntryAccepted: false
    };
    expect(deriveBootView(installedFullscreen)).toMatchObject({ gate: null, titleVisible: true, titleInteractive: true });
    expect(canStartGameplay(installedFullscreen)).toBe(true);
  });

  it("keeps a standalone installed-app fallback on the fullscreen-entry screen", () => {
    const installedStandalone = {
      ...landscapeReady,
      fullscreenActive: false,
      fullscreenDisplayMode: false,
      fullscreenEntryAccepted: false
    };
    expect(deriveBootView(installedStandalone)).toMatchObject({ gate: "fullscreen", gameplayPaused: true });
  });

  it("permits a documented platform fallback only after a fullscreen attempt", () => {
    const fallback = { ...landscapeReady, fullscreenActive: false, fullscreenFallbackAccepted: true };
    expect(deriveBootView(fallback).gate).toBeNull();
    expect(canStartGameplay(fallback)).toBe(true);
  });

  it("pauses gameplay without treating an ordinary portrait tilt as an exit", () => {
    expect(deriveBootView({ ...landscapeReady, gameplayStarted: true })).toMatchObject({ gate: null, titleVisible: false });
    expect(deriveBootView({ ...landscapeReady, gameplayStarted: true, portrait: true })).toMatchObject({
      gate: null,
      titleVisible: false,
      gameplayPaused: true
    });
  });

  it("routes unexpected fullscreen loss back through fullscreen entry", () => {
    expect(deriveBootView({ ...landscapeReady, gameplayStarted: true, fullscreenActive: false })).toMatchObject({
      gate: "fullscreen",
      titleVisible: false,
      gameplayPaused: true
    });
  });

  it("gives the explicit exit-pending screen priority until portrait completion", () => {
    expect(deriveBootView({ ...landscapeReady, gameplayStarted: true, exitPending: true })).toEqual({
      gate: "exit_pending",
      titleVisible: false,
      titleInteractive: false,
      gameplayPaused: true
    });
  });

  it("uses the current visual viewport and listens for every display transition", () => {
    expect(getDisplayViewportSize(360, 760, { width: 760, height: 360 })).toEqual({ width: 760, height: 360 });
    expect(getDisplayViewportSize(760, 360, null)).toEqual({ width: 760, height: 360 });
    expect(DISPLAY_REFRESH_EVENTS).toEqual(["resize", "orientationchange", "fullscreenchange"]);
  });
});
