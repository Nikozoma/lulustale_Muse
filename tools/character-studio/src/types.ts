export const DIRECTION_ORDER = [
  "Down",
  "Down-Left",
  "Left",
  "Up-Left",
  "Up",
  "Up-Right",
  "Right",
  "Down-Right"
] as const;

export type DirectionName = (typeof DIRECTION_ORDER)[number];
export type ProductionStatus = "reference_only" | "in_production" | "runtime_ready" | "deprecated";
export type CharacterClass = "humanoid" | "canine" | "bird" | "animal" | "custom";
export type ActionCategory =
  | "idle"
  | "locomotion"
  | "interaction"
  | "transition"
  | "battle"
  | "reaction"
  | "custom";
export type PlaybackMode = "loop" | "once" | "hold" | "transition";
export type DirectionMode = "eight" | "explicit" | "single";
export type StopPolicy = "idle_entry" | "finish_to_contact" | "transition";

export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };

export type SourceAsset = {
  id: string;
  role: "reference" | "canonical" | "sheet" | "frame" | "portrait" | "metadata";
  path: string;
  sha256: string | null;
  immutable: true;
  approval: "unreviewed" | "approved" | "rejected";
  notes?: string;
  missing?: boolean;
};

export type FrameAnchor = {
  id: string;
  role: "root" | "foot" | "hand" | "mouth" | "interaction" | "effect_origin" | "custom";
  point: Point;
  rotationDeg?: number;
  scale?: number;
  drawOrder?: "behind" | "body" | "front";
};

export type FrameEvent = {
  id: string;
  type: "contact" | "release" | "spawn" | "cue" | "custom";
  payload?: string;
};

export type FrameReference = {
  id: string;
  imagePath: string;
  crop: Rect;
  durationMs: number;
  root: Point;
  visualOffset: Point;
  bodyBounds?: Rect;
  grounded: boolean;
  contact?: "left" | "right" | "both" | "none";
  anchors: FrameAnchor[];
  events: FrameEvent[];
  sourceFrame?: { direction: DirectionName; index: number };
  mirrorSource?: { direction: DirectionName; approved: true };
};

export type DirectionTrack = {
  direction: DirectionName;
  frames: FrameReference[];
};

export type CharacterAction = {
  id: string;
  displayName: string;
  category: ActionCategory;
  playback: PlaybackMode;
  directionMode: DirectionMode;
  directions: DirectionName[];
  cell: { width: number; height: number };
  loop: { start: number; end: number };
  entryFrame: number;
  stopPolicy: StopPolicy;
  transitionActionId?: string;
  cycleDistancePx?: number;
  runtimeSheet?: string;
  runtimeHref?: string;
  tracks: Partial<Record<DirectionName, DirectionTrack>>;
};

export type PortraitDefinition = {
  id: string;
  expression: string;
  imagePath: string;
  crop: Rect;
  alphaRequired: boolean;
  status: ProductionStatus;
};

export type CharacterProjectV1 = {
  schema: "lulus-character-project";
  version: 1;
  id: string;
  displayName: string;
  characterClass: CharacterClass;
  species?: string;
  identity: {
    canonicalApproval: "unapproved" | "approved";
    locked: boolean;
    notes: string[];
    paletteReferences: string[];
  };
  production: {
    status: ProductionStatus;
    revision: number;
    parentProjectId?: string;
    templateId?: string;
    deprecationTarget?: string;
    warnings: string[];
  };
  presentation: {
    nativeCell: { width: number; height: number };
    targetSilhouette?: { width: number; height: number };
    renderScales: Record<string, number>;
    resampling: "none" | "nearest" | "approved_custom";
  };
  collisionProfileId: string;
  sources: SourceAsset[];
  actions: Record<string, CharacterAction>;
  portraits: PortraitDefinition[];
  runtime: {
    manifestPath: string;
    generatedAssetDirectory: string;
    legacyPackage?: string;
  };
  updatedAt: string;
};

export type RuntimeFrameV2 = {
  durationMs: number;
  root: [number, number];
  visualOffset: [number, number];
  grounded: boolean;
  contact?: FrameReference["contact"];
  anchors: Array<{
    id: string;
    role: FrameAnchor["role"];
    point: [number, number];
    rotationDeg?: number;
    scale?: number;
    drawOrder?: FrameAnchor["drawOrder"];
  }>;
  events: FrameEvent[];
};

export type RuntimeActionV2 = {
  id: string;
  category: ActionCategory;
  playback: PlaybackMode;
  directionMode: DirectionMode;
  sheet: string;
  cell: [number, number];
  directions: DirectionName[];
  framesPerDirection: number;
  loop: [number, number];
  entryFrame: number;
  stopPolicy: StopPolicy;
  transitionActionId?: string;
  cycleDistancePx?: number;
  tracks: Partial<Record<DirectionName, RuntimeFrameV2[]>>;
};

export type CharacterManifestV2 = {
  schema: "lulus-character-runtime";
  version: 2;
  id: string;
  displayName: string;
  characterClass: CharacterClass;
  species?: string;
  status: ProductionStatus;
  collisionProfileId: string;
  renderScales: Record<string, number>;
  actions: Record<string, RuntimeActionV2>;
  portraits?: Array<{
    id: string;
    expression: string;
    image: string;
    crop: [number, number, number, number];
    alphaRequired: boolean;
  }>;
  sourceProject: { path: string; revision: number };
};

export type CharacterIndexV1 = {
  schema: "lulus-character-index";
  version: 1;
  characters: Array<{
    id: string;
    displayName: string;
    characterClass: CharacterClass;
    status: ProductionStatus;
    manifest: string;
  }>;
};

export type ImageInspection = {
  path: string;
  width: number;
  height: number;
  format: string;
  channels: number;
  alpha: "none" | "binary" | "partial";
  transparentPixels: number;
  partialAlphaPixels: number;
  hiddenRgbPixels: number;
  opaqueBounds: Rect | null;
  palette: Array<{ hex: string; count: number }>;
  sha256: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type StageReport = {
  stageId: string;
  projectId: string;
  revision: number;
  createdAt: string;
  stageDirectory: string;
  manifestPath: string;
  files: Array<{
    stagedPath: string;
    publishPath: string;
    sha256: string;
    existingSha256?: string;
    change: "new" | "changed" | "unchanged";
  }>;
  validation: ValidationResult;
};
