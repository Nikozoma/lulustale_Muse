export const DISPLAY_REFRESH_EVENTS = ["resize", "orientationchange", "fullscreenchange"] as const;

export type BootEnvironment = {
  portrait: boolean;
  fullscreenSupported: boolean;
  fullscreenActive: boolean;
  fullscreenDisplayMode: boolean;
  fullscreenEntryAccepted: boolean;
  fullscreenFallbackAccepted: boolean;
  gameplayStarted: boolean;
  exitPending: boolean;
};

export type BootView = {
  gate: "portrait" | "fullscreen" | "exit_pending" | null;
  titleVisible: boolean;
  titleInteractive: boolean;
  gameplayPaused: boolean;
};

export function deriveBootView(environment: BootEnvironment): BootView {
  if (environment.exitPending) {
    return { gate: "exit_pending", titleVisible: false, titleInteractive: false, gameplayPaused: true };
  }

  if (environment.portrait) {
    if (environment.gameplayStarted) {
      return { gate: null, titleVisible: false, titleInteractive: false, gameplayPaused: true };
    }
    return { gate: "portrait", titleVisible: false, titleInteractive: false, gameplayPaused: true };
  }

  const fullscreenReady =
    (environment.fullscreenEntryAccepted || environment.fullscreenDisplayMode) &&
    (!environment.fullscreenSupported ||
      environment.fullscreenActive ||
      environment.fullscreenFallbackAccepted);
  if (!fullscreenReady) {
    return { gate: "fullscreen", titleVisible: false, titleInteractive: false, gameplayPaused: true };
  }

  const titleVisible = !environment.gameplayStarted;
  return {
    gate: null,
    titleVisible,
    titleInteractive: titleVisible,
    gameplayPaused: false
  };
}

export function canStartGameplay(environment: BootEnvironment): boolean {
  const view = deriveBootView(environment);
  return view.gate === null && view.titleInteractive && !environment.gameplayStarted;
}

export function getDisplayViewportSize(
  innerWidth: number,
  innerHeight: number,
  visualViewport?: { width: number; height: number } | null
): { width: number; height: number } {
  const width = visualViewport?.width;
  const height = visualViewport?.height;
  return {
    width: Number.isFinite(width) && width! > 0 ? width! : innerWidth,
    height: Number.isFinite(height) && height! > 0 ? height! : innerHeight
  };
}
