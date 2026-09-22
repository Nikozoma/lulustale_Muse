import "./styles.css";
import {
  directionForVectorWithHysteresis,
  frameIndexFromDistance,
  frameIndexFromElapsed
} from "../../../src/game/characterContract";
import { calculateLogicalViewport } from "../../../src/game/viewport";
import {
  DIRECTION_ORDER,
  type CharacterAction,
  type CharacterProjectV1,
  type DirectionName,
  type FrameReference,
  type ImageInspection,
  type ProductionStatus,
  type StageReport
} from "./types";

type ProjectSummary = Pick<CharacterProjectV1, "id" | "displayName" | "characterClass" | "production" | "updatedAt">;
type CanvasMode = "frame" | "matrix" | "animation" | "motion" | "interaction";
type PixelTool = "pan" | "root" | "erase" | "restore" | "sample" | "component";
type PreviewBackground = "checker" | "black" | "white";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Character Studio app root is missing.");

app.innerHTML = `
  <header class="topbar">
    <div>
      <p class="eyebrow">Lulu's Tale</p>
      <h1>Character Studio</h1>
    </div>
    <div class="top-actions">
      <button id="importSheetBtn">Import Real Sheet</button>
      <button id="undoBtn" disabled>Undo</button>
      <button id="redoBtn" disabled>Redo</button>
      <button id="saveProjectBtn" class="primary">Save Project</button>
      <span id="dirtyState" class="status-pill">No project</span>
    </div>
  </header>
  <main class="workspace">
    <aside class="sidebar left-sidebar">
      <section>
        <label class="field-label" for="projectSelect">Character project</label>
        <select id="projectSelect"></select>
      </section>
      <section class="project-summary" id="projectSummary"></section>
      <section>
        <h2>Actions</h2>
        <div id="actionList" class="nav-list"></div>
      </section>
      <section>
        <h2>Directions</h2>
        <div id="directionList" class="nav-list direction-list"></div>
      </section>
      <section>
        <h2>References & provenance</h2>
        <div id="sourceList" class="source-list"></div>
        <div id="referencePreview" class="reference-preview" hidden>
          <img id="referenceImage" alt="Selected real project reference" />
          <span id="referenceCaption"></span>
        </div>
      </section>
    </aside>

    <section class="center-workspace">
      <nav class="mode-tabs" aria-label="Workspace mode">
        <button data-mode="frame" class="active">Frame Editor</button>
        <button data-mode="matrix">Direction Matrix</button>
        <button data-mode="animation">Animation</button>
        <button data-mode="motion">Game Motion</button>
        <button data-mode="interaction">Interaction Stage</button>
      </nav>
      <div class="canvas-toolbar">
        <div class="tool-group">
          <button data-tool="pan" class="active">Pan</button>
          <button data-tool="root">Root</button>
          <button data-tool="erase">Erase Alpha</button>
          <button data-tool="restore">Restore</button>
          <button data-tool="sample">Sample Matte</button>
          <button data-tool="component">Remove Component</button>
        </div>
        <div class="tool-group">
          <label>Background
            <select id="backgroundSelect">
              <option value="checker">Checker</option>
              <option value="black">Black</option>
              <option value="white">White</option>
            </select>
          </label>
          <label><input id="onionPrevious" type="checkbox" /> Previous onion</label>
          <label><input id="onionNext" type="checkbox" /> Next onion</label>
          <label><input id="fringeOverlay" type="checkbox" /> Edge heatmap</label>
          <label><input id="beforeAfter" type="checkbox" /> Before/after split</label>
        </div>
      </div>
      <div class="canvas-shell">
        <canvas id="editorCanvas"></canvas>
        <div id="canvasHint" class="canvas-hint">Load a migrated character project.</div>
      </div>
      <div class="timeline-panel">
        <div class="timeline-toolbar">
          <button id="playBtn">Play</button>
          <label>Preview speed <input id="previewSpeed" type="range" min="0.25" max="2" step="0.05" value="1" /></label>
          <label>Playback model
            <select id="playbackModel">
              <option value="distance">Proposed distance-driven</option>
              <option value="legacy">Current time-driven comparison</option>
            </select>
          </label>
          <label><input id="blockedMovement" type="checkbox" /> Blocked movement</label>
          <label>Viewport
            <select id="viewportPreset">
              <option value="760,360,4">Project phone 760×360 / DPR 4</option>
              <option value="640,360,3">Core safe view 640×360 / DPR 3</option>
              <option value="883,343,3">Android usable 883×343 / DPR 3</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>CSS W <input id="viewportWidth" type="number" min="1" step="1" value="760" /></label>
          <label>CSS H <input id="viewportHeight" type="number" min="1" step="1" value="360" /></label>
          <label>DPR <input id="viewportDpr" type="number" min="1" max="8" step="0.25" value="4" /></label>
          <label>Render scale <input id="renderScale" type="number" min="0.25" max="8" step="0.25" value="1" /></label>
          <label>Joystick <input id="joystickStrength" type="range" min="0" max="1" step="0.01" value="1" /></label>
          <span id="motionReadout"></span>
        </div>
        <div id="timeline" class="timeline"></div>
      </div>
    </section>

    <aside class="sidebar right-sidebar">
      <section>
        <h2>Project</h2>
        <label>Status
          <select id="productionStatus">
            <option value="reference_only">Reference only</option>
            <option value="in_production">In production</option>
            <option value="runtime_ready">Runtime ready</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </label>
        <label>Canonical approval
          <select id="canonicalApproval">
            <option value="unapproved">Unapproved</option>
            <option value="approved">Approved</option>
          </select>
        </label>
        <label><input id="identityLocked" type="checkbox" /> Lock approved identity</label>
        <label>Collision profile <input id="collisionProfile" type="text" /></label>
        <label>Approved resampling
          <select id="resamplingPolicy">
            <option value="none">None</option>
            <option value="nearest">Nearest-neighbor</option>
            <option value="approved_custom">Approved custom (external)</option>
          </select>
        </label>
        <h3>Portraits / expressions</h3>
        <div id="portraitList" class="anchor-list"></div>
        <button id="importPortraitBtn">Import Real Portrait PNG</button>
      </section>
      <section>
        <h2>Frame geometry</h2>
        <div class="grid-two">
          <label>Root X <input id="rootX" type="number" step="1" /></label>
          <label>Root Y <input id="rootY" type="number" step="1" /></label>
          <label>Offset X <input id="offsetX" type="number" step="1" /></label>
          <label>Offset Y <input id="offsetY" type="number" step="1" /></label>
          <label>Crop X <input id="cropX" type="number" min="0" step="1" /></label>
          <label>Crop Y <input id="cropY" type="number" min="0" step="1" /></label>
          <label>Crop width <input id="cropWidth" type="number" min="1" step="1" /></label>
          <label>Crop height <input id="cropHeight" type="number" min="1" step="1" /></label>
          <label>Body X <input id="bodyX" type="number" step="1" /></label>
          <label>Body Y <input id="bodyY" type="number" step="1" /></label>
          <label>Body width <input id="bodyWidth" type="number" min="0" step="1" /></label>
          <label>Body height <input id="bodyHeight" type="number" min="0" step="1" /></label>
          <label>Duration ms <input id="durationMs" type="number" min="1" step="1" /></label>
          <label>Contact
            <select id="contact">
              <option value="none">None</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="both">Both</option>
            </select>
          </label>
        </div>
        <label><input id="grounded" type="checkbox" /> Grounded</label>
        <label>Brush radius <input id="brushRadius" type="range" min="1" max="16" step="1" value="3" /></label>
        <label>Matte tolerance <input id="matteTolerance" type="range" min="0" max="120" step="1" value="24" /></label>
        <div class="button-row">
          <button id="applyMatteBtn">Remove Sampled Matte</button>
          <button id="resetFrameBtn">Reset Pixels</button>
          <button id="saveFrameBtn">Save Derivative</button>
        </div>
        <div class="button-row">
          <button id="setMirrorBtn">Record Approved Mirror Source</button>
          <button id="clearMirrorBtn">Clear Mirror Provenance</button>
        </div>
      </section>
      <section>
        <h2>Anchors</h2>
        <div id="anchorList" class="anchor-list"></div>
        <div class="button-row">
          <button id="addAnchorBtn">Add Named Anchor</button>
          <button id="deleteAnchorBtn">Remove Selected</button>
        </div>
      </section>
      <section>
        <h2>Authored events</h2>
        <div id="eventList" class="anchor-list"></div>
        <button id="addEventBtn">Add Frame Event</button>
      </section>
      <section>
        <h2>Image inspection</h2>
        <pre id="inspectionPanel">No frame selected.</pre>
      </section>
      <section>
        <h2>Interaction stage</h2>
        <label>Second real project <select id="interactionProject"></select></label>
        <label>Secondary action <select id="interactionAction"></select></label>
        <label>Secondary direction <select id="interactionDirection"></select></label>
        <label><input id="interactionSyncTimeline" type="checkbox" checked /> Sync secondary timeline</label>
        <label>Secondary frame
          <input id="interactionFrame" type="range" min="0" max="0" step="1" value="0" />
          <span id="interactionFrameReadout">1 / 1</span>
        </label>
        <label>Secondary render scale <input id="interactionScale" type="number" min="0.25" max="8" step="0.25" value="1" /></label>
        <div class="grid-two">
          <label>Runtime offset X <input id="interactionOffsetX" type="number" step="1" value="84" /></label>
          <label>Runtime offset Y <input id="interactionOffsetY" type="number" step="1" value="0" /></label>
        </div>
        <label>Real prop image path <input id="propImagePath" type="text" placeholder="Project-relative path" /></label>
      </section>
      <section>
        <h2>Runtime export</h2>
        <button id="validateBtn">Validate Project</button>
        <button id="stageBtn">Stage Export</button>
        <button id="publishBtn" class="danger" disabled>Publish Staged Revision</button>
        <label>Batch class
          <select id="batchClass">
            <option value="humanoid">Humanoids</option>
            <option value="canine">Canines</option>
            <option value="bird">Birds</option>
            <option value="animal">Other animals</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <button id="batchStageBtn">Validate & Stage Runtime-ready Class</button>
        <pre id="validationPanel">No validation run.</pre>
      </section>
    </aside>
  </main>

  <dialog id="importDialog">
    <form method="dialog" id="importForm">
      <h2>Import a real project sheet</h2>
      <p>The source must already exist inside the active Lulu's Tale project. Grid and direction choices are never inferred silently.</p>
      <label>Project ID <input name="id" pattern="[a-z0-9][a-z0-9_-]*" required /></label>
      <label>Display name <input name="displayName" required /></label>
      <label>Character class
        <select name="characterClass">
          <option value="humanoid">Humanoid</option>
          <option value="canine">Canine</option>
          <option value="bird">Bird</option>
          <option value="animal">Animal</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>Source image path <input name="sourcePath" required /></label>
      <label>Action ID <input name="actionId" pattern="[a-z0-9][a-z0-9_-]*" required /></label>
      <label>Action category
        <select name="category">
          <option value="idle">Idle</option>
          <option value="locomotion">Locomotion</option>
          <option value="interaction">Interaction</option>
          <option value="transition">Transition</option>
          <option value="reaction">Reaction</option>
          <option value="battle">Battle</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>Direction topology
        <select name="directionMode">
          <option value="eight">Eight authored directions</option>
          <option value="single">Single authored direction</option>
        </select>
      </label>
      <div class="grid-two">
        <label>Cell width <input name="cellWidth" type="number" min="1" required /></label>
        <label>Cell height <input name="cellHeight" type="number" min="1" required /></label>
      </div>
      <label>Cycle distance px (required for locomotion) <input name="cycleDistancePx" type="number" min="0.01" step="0.01" /></label>
      <label>Collision profile ID <input name="collisionProfileId" value="visual_only" required /></label>
      <menu>
        <button value="cancel">Cancel</button>
        <button id="confirmImportBtn" value="default" class="primary">Import</button>
      </menu>
      <pre id="importResult"></pre>
    </form>
  </dialog>
`;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing Character Studio element ${id}.`);
  return element as T;
}

function requireCanvasContext(
  target: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings
): CanvasRenderingContext2D {
  const context = target.getContext("2d", options);
  if (!context) throw new Error("Character Studio canvas is unavailable.");
  return context;
}

const projectSelect = byId<HTMLSelectElement>("projectSelect");
const actionList = byId<HTMLDivElement>("actionList");
const directionList = byId<HTMLDivElement>("directionList");
const sourceList = byId<HTMLDivElement>("sourceList");
const timeline = byId<HTMLDivElement>("timeline");
const projectSummary = byId<HTMLDivElement>("projectSummary");
const canvas = byId<HTMLCanvasElement>("editorCanvas");
const ctx = requireCanvasContext(canvas, { willReadFrequently: true });
const canvasHint = byId<HTMLDivElement>("canvasHint");
const inspectionPanel = byId<HTMLPreElement>("inspectionPanel");
const validationPanel = byId<HTMLPreElement>("validationPanel");
const dirtyState = byId<HTMLSpanElement>("dirtyState");
const importDialog = byId<HTMLDialogElement>("importDialog");
const importForm = byId<HTMLFormElement>("importForm");
const publishBtn = byId<HTMLButtonElement>("publishBtn");
const frameCanvas = document.createElement("canvas");
const frameCtx = requireCanvasContext(frameCanvas, { willReadFrequently: true });
const originalCanvas = document.createElement("canvas");
const originalCtx = requireCanvasContext(originalCanvas, { willReadFrequently: true });

type HistorySnapshot = {
  project: CharacterProjectV1;
  actionId: string | null;
  direction: DirectionName;
  frameIndex: number;
  pixels: ImageData;
  originalPixels: ImageData;
  dirty: boolean;
  imageDirty: boolean;
};

const undoStack: HistorySnapshot[] = [];
const redoStack: HistorySnapshot[] = [];

const state: {
  projects: ProjectSummary[];
  project: CharacterProjectV1 | null;
  actionId: string | null;
  direction: DirectionName;
  frameIndex: number;
  mode: CanvasMode;
  tool: PixelTool;
  background: PreviewBackground;
  zoom: number;
  pan: { x: number; y: number };
  pointer: { down: boolean; lastX: number; lastY: number };
  dirty: boolean;
  imageDirty: boolean;
  playing: boolean;
  playbackStarted: number;
  sampledMatte: [number, number, number] | null;
  inspection: ImageInspection | null;
  stage: StageReport | null;
  selectedAnchor: number;
  frameLoadToken: number;
  secondaryProject: CharacterProjectV1 | null;
  secondaryActionId: string | null;
  secondaryDirection: DirectionName;
  secondaryFrameIndex: number;
  propImage: HTMLImageElement | null;
} = {
  projects: [],
  project: null,
  actionId: null,
  direction: "Down",
  frameIndex: 0,
  mode: "frame",
  tool: "pan",
  background: "checker",
  zoom: 5,
  pan: { x: 0, y: 0 },
  pointer: { down: false, lastX: 0, lastY: 0 },
  dirty: false,
  imageDirty: false,
  playing: false,
  playbackStarted: performance.now(),
  sampledMatte: null,
  inspection: null,
  stage: null,
  selectedAnchor: -1,
  frameLoadToken: 0,
  secondaryProject: null,
  secondaryActionId: null,
  secondaryDirection: "Down",
  secondaryFrameIndex: 0,
  propImage: null
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) }
  });
  const body = (await response.json()) as { ok: boolean; error?: string } & T;
  if (!response.ok || !body.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body;
}

function imageUrl(path: string): string {
  return `/api/image?path=${encodeURIComponent(path)}`;
}

function currentAction(): CharacterAction | null {
  return state.project && state.actionId ? state.project.actions[state.actionId] ?? null : null;
}

function currentTrack() {
  return currentAction()?.tracks[state.direction] ?? null;
}

function currentFrame(): FrameReference | null {
  return currentTrack()?.frames[state.frameIndex] ?? null;
}

function secondaryAction(): CharacterAction | null {
  return state.secondaryProject && state.secondaryActionId
    ? state.secondaryProject.actions[state.secondaryActionId] ?? null
    : null;
}

function markDirty(): void {
  state.dirty = true;
  state.stage = null;
  publishBtn.disabled = true;
  updateDirtyState();
}

function snapshot(): HistorySnapshot | null {
  if (!state.project || frameCanvas.width === 0 || frameCanvas.height === 0) return null;
  return {
    project: structuredClone(state.project),
    actionId: state.actionId,
    direction: state.direction,
    frameIndex: state.frameIndex,
    pixels: frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height),
    originalPixels: originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height),
    dirty: state.dirty,
    imageDirty: state.imageDirty
  };
}

function captureHistory(): void {
  const current = snapshot();
  if (!current) return;
  undoStack.push(current);
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
  syncHistoryButtons();
}

function restoreHistory(target: HistorySnapshot): void {
  state.project = structuredClone(target.project);
  state.actionId = target.actionId;
  state.direction = target.direction;
  state.frameIndex = target.frameIndex;
  state.dirty = target.dirty;
  state.imageDirty = target.imageDirty;
  frameCanvas.width = target.pixels.width;
  frameCanvas.height = target.pixels.height;
  originalCanvas.width = target.originalPixels.width;
  originalCanvas.height = target.originalPixels.height;
  frameCtx.putImageData(target.pixels, 0, 0);
  originalCtx.putImageData(target.originalPixels, 0, 0);
  renderNavigation();
  syncProjectInspector();
  syncFrameInspector();
  updateDirtyState();
}

function undo(): void {
  const target = undoStack.pop();
  const current = snapshot();
  if (!target || !current) return;
  redoStack.push(current);
  restoreHistory(target);
  syncHistoryButtons();
}

function redo(): void {
  const target = redoStack.pop();
  const current = snapshot();
  if (!target || !current) return;
  undoStack.push(current);
  restoreHistory(target);
  syncHistoryButtons();
}

function syncHistoryButtons(): void {
  byId<HTMLButtonElement>("undoBtn").disabled = undoStack.length === 0;
  byId<HTMLButtonElement>("redoBtn").disabled = redoStack.length === 0;
}

function updateDirtyState(): void {
  dirtyState.textContent = !state.project
    ? "No project"
    : state.imageDirty
      ? "Unsaved pixel derivative"
      : state.dirty
        ? "Unsaved metadata"
        : `Saved r${state.project.production.revision}`;
  dirtyState.className = `status-pill${state.dirty || state.imageDirty ? " warning" : ""}`;
}

async function bootstrap(): Promise<void> {
  const result = await api<{ projects: ProjectSummary[] }>("/api/bootstrap");
  state.projects = result.projects;
  renderProjectOptions();
  syncInteractionControls();
  if (state.projects[0]) await loadProject(state.projects[0].id);
}

function renderProjectOptions(): void {
  const options = state.projects
    .map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.displayName)} — ${escapeHtml(project.production.status)}</option>`)
    .join("");
  projectSelect.innerHTML = options || `<option value="">No migrated projects</option>`;
  byId<HTMLSelectElement>("interactionProject").innerHTML =
    `<option value="">None</option>${options}`;
}

function syncInteractionControls(): void {
  const project = state.secondaryProject;
  const actionSelect = byId<HTMLSelectElement>("interactionAction");
  const directionSelect = byId<HTMLSelectElement>("interactionDirection");
  const frameInput = byId<HTMLInputElement>("interactionFrame");
  const frameReadout = byId<HTMLSpanElement>("interactionFrameReadout");
  if (!project) {
    actionSelect.innerHTML = '<option value="">No secondary project</option>';
    directionSelect.innerHTML = '<option value="">No direction</option>';
    actionSelect.disabled = true;
    directionSelect.disabled = true;
    frameInput.disabled = true;
    frameInput.max = "0";
    frameInput.value = "0";
    frameReadout.textContent = "1 / 1";
    return;
  }
  actionSelect.disabled = false;
  directionSelect.disabled = false;
  const actions = Object.values(project.actions);
  const action = secondaryAction() ?? actions[0] ?? null;
  state.secondaryActionId = action?.id ?? null;
  actionSelect.innerHTML = actions
    .map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.displayName)}</option>`)
    .join("");
  actionSelect.value = state.secondaryActionId ?? "";
  if (!action) return;
  if (!action.directions.includes(state.secondaryDirection)) {
    state.secondaryDirection = action.directions[0] ?? "Down";
  }
  directionSelect.innerHTML = action.directions
    .map((direction) => `<option value="${direction}">${direction}</option>`)
    .join("");
  directionSelect.value = state.secondaryDirection;
  const frameCount = action.tracks[state.secondaryDirection]?.frames.length ?? 0;
  state.secondaryFrameIndex = Math.max(0, Math.min(state.secondaryFrameIndex, Math.max(0, frameCount - 1)));
  frameInput.disabled = byId<HTMLInputElement>("interactionSyncTimeline").checked;
  frameInput.max = String(Math.max(0, frameCount - 1));
  frameInput.value = String(state.secondaryFrameIndex);
  frameReadout.textContent = `${state.secondaryFrameIndex + 1} / ${Math.max(1, frameCount)}`;
}

async function loadProject(id: string): Promise<void> {
  if (!id) return;
  if ((state.dirty || state.imageDirty) && !window.confirm("Discard unsaved Character Studio changes?")) {
    projectSelect.value = state.project?.id ?? "";
    return;
  }
  const result = await api<{ project: CharacterProjectV1 }>(`/api/project?id=${encodeURIComponent(id)}`);
  state.project = result.project;
  state.actionId = Object.keys(result.project.actions)[0] ?? null;
  state.direction = currentAction()?.directions[0] ?? "Down";
  state.frameIndex = 0;
  state.dirty = false;
  state.imageDirty = false;
  state.stage = null;
  undoStack.length = 0;
  redoStack.length = 0;
  syncHistoryButtons();
  publishBtn.disabled = true;
  projectSelect.value = id;
  syncProjectInspector();
  renderNavigation();
  await loadCurrentFrame();
  updateDirtyState();
}

function syncProjectInspector(): void {
  const project = state.project;
  if (!project) return;
  byId<HTMLSelectElement>("productionStatus").value = project.production.status;
  byId<HTMLSelectElement>("canonicalApproval").value = project.identity.canonicalApproval;
  byId<HTMLInputElement>("identityLocked").checked = project.identity.locked;
  byId<HTMLInputElement>("collisionProfile").value = project.collisionProfileId;
  byId<HTMLSelectElement>("resamplingPolicy").value = project.presentation.resampling;
  renderPortraits();
  projectSummary.innerHTML = `
    <strong>${escapeHtml(project.displayName)}</strong>
    <span>${escapeHtml(project.characterClass)}${project.species ? ` / ${escapeHtml(project.species)}` : ""}</span>
    <span>Revision ${project.production.revision}</span>
    ${project.identity.notes.map((note) => `<span>${escapeHtml(note)}</span>`).join("")}
    ${project.production.warnings.map((warning) => `<span class="warning-text">${escapeHtml(warning)}</span>`).join("")}
  `;
  sourceList.innerHTML = project.sources
    .map(
      (source) => `
        <button class="source-card${source.missing ? " missing" : ""}" data-source="${escapeHtml(source.path)}">
          <strong>${escapeHtml(source.role)}</strong>
          <span>${escapeHtml(source.path)}</span>
          <small>${source.missing ? "MISSING" : source.approval} / ${source.sha256?.slice(0, 12) ?? "checksum unavailable"}</small>
        </button>`
    )
    .join("");
}

function renderPortraits(): void {
  const project = state.project;
  byId<HTMLDivElement>("portraitList").innerHTML = project
    ? project.portraits
        .map(
          (portrait, index) => `
            <div class="event-row">
              <span><strong>${escapeHtml(portrait.expression)}</strong><br />${escapeHtml(portrait.id)} / ${portrait.status}</span>
              ${
                portrait.status === "runtime_ready"
                  ? ""
                  : `<button data-approve-portrait="${index}">Approve Runtime</button>`
              }
            </div>`
        )
        .join("") || "<small>No approved real portrait art imported.</small>"
    : "";
}

function renderNavigation(): void {
  const project = state.project;
  if (!project) return;
  actionList.innerHTML = Object.values(project.actions)
    .map(
      (action) => `
        <button data-action="${escapeHtml(action.id)}" class="${action.id === state.actionId ? "active" : ""}">
          <strong>${escapeHtml(action.displayName)}</strong>
          <span>${escapeHtml(action.category)} / ${trackFrameCount(action)}f</span>
        </button>`
    )
    .join("");
  const action = currentAction();
  directionList.innerHTML = DIRECTION_ORDER.map((direction) => {
    const authored = action?.directions.includes(direction) ?? false;
    return `<button data-direction="${direction}" class="${direction === state.direction ? "active" : ""}" ${authored ? "" : "disabled"}>${direction}${authored ? "" : " — missing"}</button>`;
  }).join("");
  renderTimeline();
}

function trackFrameCount(action: CharacterAction): number {
  return action.tracks[action.directions[0]]?.frames.length ?? 0;
}

function renderTimeline(): void {
  const track = currentTrack();
  timeline.innerHTML = track
    ? track.frames
        .map(
          (frame, index) => `
          <button data-frame="${index}" class="frame-card${index === state.frameIndex ? " active" : ""}">
            <img src="${imageUrl(frame.imagePath)}" style="object-position:-${frame.crop.x}px -${frame.crop.y}px" alt="" />
            <strong>${index + 1}</strong>
            <span>${frame.durationMs} ms</span>
            <small>${frame.contact ?? "none"}${frame.grounded ? " / grounded" : ""}${frame.mirrorSource ? ` / mirror:${frame.mirrorSource.direction}` : ""}${frame.events.length ? ` / ${frame.events.length} event${frame.events.length === 1 ? "" : "s"}` : ""}</small>
          </button>`
        )
        .join("")
    : "";
}

async function loadCurrentFrame(): Promise<void> {
  const action = currentAction();
  const frame = currentFrame();
  if (!action || !frame) {
    canvasHint.hidden = false;
    return;
  }
  const token = ++state.frameLoadToken;
  const image = new Image();
  image.src = imageUrl(frame.imagePath);
  await image.decode();
  if (token !== state.frameLoadToken) return;
  frameCanvas.width = action.cell.width;
  frameCanvas.height = action.cell.height;
  originalCanvas.width = action.cell.width;
  originalCanvas.height = action.cell.height;
  frameCtx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
  frameCtx.imageSmoothingEnabled = false;
  frameCtx.drawImage(
    image,
    frame.crop.x,
    frame.crop.y,
    frame.crop.width,
    frame.crop.height,
    0,
    0,
    action.cell.width,
    action.cell.height
  );
  originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
  originalCtx.drawImage(frameCanvas, 0, 0);
  state.imageDirty = false;
  state.sampledMatte = null;
  state.selectedAnchor = -1;
  state.inspection = (
    await api<{ inspection: ImageInspection }>("/api/image/inspect", {
      method: "POST",
      body: JSON.stringify({ path: frame.imagePath })
    })
  ).inspection;
  renderInspection();
  syncFrameInspector();
  canvasHint.hidden = true;
  fitCanvas();
  updateDirtyState();
}

function renderInspection(): void {
  const inspection = state.inspection;
  inspectionPanel.textContent = inspection
    ? [
        inspection.path,
        `${inspection.width}×${inspection.height} ${inspection.format} / ${inspection.channels} channels`,
        `Alpha: ${inspection.alpha}`,
        `Transparent pixels: ${inspection.transparentPixels}`,
        `Partial alpha: ${inspection.partialAlphaPixels}`,
        `Hidden RGB: ${inspection.hiddenRgbPixels}`,
        `Opaque bounds: ${inspection.opaqueBounds ? `${inspection.opaqueBounds.x},${inspection.opaqueBounds.y} ${inspection.opaqueBounds.width}×${inspection.opaqueBounds.height}` : "none"}`,
        `Dominant opaque palette: ${inspection.palette.map((color) => `${color.hex} (${color.count})`).join(", ") || "none"}`,
        `SHA-256: ${inspection.sha256}`
      ].join("\n")
    : "No inspection.";
}

function syncFrameInspector(): void {
  const frame = currentFrame();
  if (!frame) return;
  byId<HTMLInputElement>("rootX").value = String(frame.root.x);
  byId<HTMLInputElement>("rootY").value = String(frame.root.y);
  byId<HTMLInputElement>("offsetX").value = String(frame.visualOffset.x);
  byId<HTMLInputElement>("offsetY").value = String(frame.visualOffset.y);
  byId<HTMLInputElement>("cropX").value = String(frame.crop.x);
  byId<HTMLInputElement>("cropY").value = String(frame.crop.y);
  byId<HTMLInputElement>("cropWidth").value = String(frame.crop.width);
  byId<HTMLInputElement>("cropHeight").value = String(frame.crop.height);
  byId<HTMLInputElement>("bodyX").value = frame.bodyBounds ? String(frame.bodyBounds.x) : "";
  byId<HTMLInputElement>("bodyY").value = frame.bodyBounds ? String(frame.bodyBounds.y) : "";
  byId<HTMLInputElement>("bodyWidth").value = frame.bodyBounds ? String(frame.bodyBounds.width) : "";
  byId<HTMLInputElement>("bodyHeight").value = frame.bodyBounds ? String(frame.bodyBounds.height) : "";
  byId<HTMLInputElement>("durationMs").value = String(frame.durationMs);
  byId<HTMLInputElement>("grounded").checked = frame.grounded;
  byId<HTMLSelectElement>("contact").value = frame.contact ?? "none";
  renderAnchors();
  renderEvents();
}

function renderAnchors(): void {
  const frame = currentFrame();
  byId<HTMLDivElement>("anchorList").innerHTML = frame
    ? frame.anchors
        .map(
          (anchor, index) => `
            <button data-anchor="${index}" class="${index === state.selectedAnchor ? "active" : ""}">
              <strong>${escapeHtml(anchor.id)}</strong>
              <span>${escapeHtml(anchor.role)} / ${anchor.point.x}, ${anchor.point.y}</span>
            </button>`
        )
        .join("")
    : "";
}

function renderEvents(): void {
  const frame = currentFrame();
  byId<HTMLDivElement>("eventList").innerHTML = frame
    ? frame.events
        .map(
          (event, index) => `
            <div class="event-row">
              <span><strong>${escapeHtml(event.id)}</strong><br />${escapeHtml(event.type)}${event.payload ? ` / ${escapeHtml(event.payload)}` : ""}</span>
              <button data-delete-event="${index}" aria-label="Remove ${escapeHtml(event.id)}">Remove</button>
            </div>`
        )
        .join("")
    : "";
}

function fitCanvas(): void {
  const action = currentAction();
  if (!action) return;
  const bounds = canvas.getBoundingClientRect();
  state.zoom = Math.max(0.25, Math.min(12, Math.floor(Math.min((bounds.width * 0.65) / action.cell.width, (bounds.height * 0.65) / action.cell.height) * 2) / 2));
  state.pan = {
    x: Math.round((bounds.width - action.cell.width * state.zoom) / 2),
    y: Math.round((bounds.height - action.cell.height * state.zoom) / 2)
  };
}

function resizeCanvas(): void {
  const bounds = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(bounds.width * dpr));
  canvas.height = Math.max(1, Math.floor(bounds.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawBackground(width: number, height: number): void {
  if (state.background === "black" || state.background === "white") {
    ctx.fillStyle = state.background;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const size = 16;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      ctx.fillStyle = (x / size + y / size) % 2 === 0 ? "#27303a" : "#151a20";
      ctx.fillRect(x, y, size, size);
    }
  }
}

function draw(): void {
  const bounds = canvas.getBoundingClientRect();
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  drawBackground(bounds.width, bounds.height);
  if (state.project && currentAction() && currentFrame()) {
    if (state.mode === "matrix") drawMatrix(bounds.width, bounds.height);
    else if (state.mode === "animation" || state.mode === "motion") drawPlayback(bounds.width, bounds.height);
    else if (state.mode === "interaction") drawInteraction(bounds.width, bounds.height);
    else drawFrameEditor();
  }
  requestAnimationFrame(draw);
}

function drawFrameEditor(): void {
  const action = currentAction();
  const frame = currentFrame();
  if (!action || !frame) return;
  ctx.save();
  ctx.translate(state.pan.x, state.pan.y);
  ctx.scale(state.zoom, state.zoom);
  ctx.imageSmoothingEnabled = false;
  if (byId<HTMLInputElement>("onionPrevious").checked) drawOnion(-1, "rgba(58,196,255,.32)");
  if (byId<HTMLInputElement>("onionNext").checked) drawOnion(1, "rgba(255,80,156,.32)");
  if (byId<HTMLInputElement>("beforeAfter").checked) {
    ctx.drawImage(originalCanvas, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(action.cell.width / 2, 0, action.cell.width / 2, action.cell.height);
    ctx.clip();
    ctx.drawImage(frameCanvas, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(frameCanvas, 0, 0);
  }
  if (byId<HTMLInputElement>("fringeOverlay").checked) drawEdgeHeatmap();
  drawGeometryOverlay(frame);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1 / state.zoom;
  ctx.strokeRect(0, 0, action.cell.width, action.cell.height);
  ctx.restore();
}

function drawOnion(offset: number, color: string): void {
  const track = currentTrack();
  if (!track) return;
  const target = track.frames[state.frameIndex + offset];
  if (!target || target.imagePath !== currentFrame()?.imagePath) return;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.filter = `drop-shadow(0 0 0 ${color})`;
  const image = document.querySelector<HTMLImageElement>(`.frame-card[data-frame="${state.frameIndex + offset}"] img`);
  if (image?.complete) {
    ctx.drawImage(
      image,
      target.crop.x,
      target.crop.y,
      target.crop.width,
      target.crop.height,
      0,
      0,
      target.crop.width,
      target.crop.height
    );
  }
  ctx.restore();
}

function drawGeometryOverlay(frame: FrameReference): void {
  const action = currentAction();
  if (!action) return;
  const groundY = frame.root.y;
  ctx.save();
  ctx.lineWidth = 1 / state.zoom;
  ctx.setLineDash([4 / state.zoom, 3 / state.zoom]);
  ctx.strokeStyle = "#38e6ff";
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(action.cell.width, groundY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#fff200";
  ctx.beginPath();
  ctx.arc(frame.root.x, frame.root.y, 2.5 / state.zoom + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffdb4d";
  ctx.beginPath();
  ctx.moveTo(frame.root.x - 6, frame.root.y);
  ctx.lineTo(frame.root.x + 6, frame.root.y);
  ctx.moveTo(frame.root.x, frame.root.y - 6);
  ctx.lineTo(frame.root.x, frame.root.y + 6);
  ctx.stroke();
  if (frame.bodyBounds) {
    ctx.fillStyle = "rgba(90,224,130,.12)";
    ctx.strokeStyle = "#5ae082";
    ctx.fillRect(frame.bodyBounds.x, frame.bodyBounds.y, frame.bodyBounds.width, frame.bodyBounds.height);
    ctx.strokeRect(frame.bodyBounds.x, frame.bodyBounds.y, frame.bodyBounds.width, frame.bodyBounds.height);
  }
  drawCollision(frame);
  frame.anchors.forEach((anchor, index) => {
    ctx.fillStyle = index === state.selectedAnchor ? "#fff200" : "#ff6bd6";
    ctx.beginPath();
    ctx.arc(anchor.point.x, anchor.point.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "4px ui-monospace";
    ctx.fillText(anchor.id, anchor.point.x + 3, anchor.point.y - 3);
  });
  ctx.restore();
}

function drawCollision(frame: FrameReference): void {
  const profile = state.project?.collisionProfileId;
  const collision =
    profile === "player"
      ? { width: 20, height: 12, centerOffsetY: -6 }
      : profile === "brutus"
        ? { width: 24, height: 14, centerOffsetY: -7 }
        : null;
  if (!collision) return;
  ctx.fillStyle = "rgba(255,172,40,.16)";
  ctx.strokeStyle = "#ffac28";
  const x = frame.root.x - collision.width / 2;
  const y = frame.root.y + collision.centerOffsetY - collision.height / 2;
  ctx.fillRect(x, y, collision.width, collision.height);
  ctx.strokeRect(x, y, collision.width, collision.height);
}

function drawEdgeHeatmap(): void {
  const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
  const output = ctx.createImageData(frameCanvas.width, frameCanvas.height);
  for (let y = 1; y < frameCanvas.height - 1; y += 1) {
    for (let x = 1; x < frameCanvas.width - 1; x += 1) {
      const index = (y * frameCanvas.width + x) * 4;
      if (imageData.data[index + 3] === 0) continue;
      const neighborAlpha = [
        imageData.data[index - 4 + 3],
        imageData.data[index + 4 + 3],
        imageData.data[index - frameCanvas.width * 4 + 3],
        imageData.data[index + frameCanvas.width * 4 + 3]
      ];
      if (neighborAlpha.some((alpha) => alpha === 0)) {
        output.data[index] = 255;
        output.data[index + 1] = 42;
        output.data[index + 2] = 181;
        output.data[index + 3] = 190;
      }
    }
  }
  const heatmap = document.createElement("canvas");
  heatmap.width = frameCanvas.width;
  heatmap.height = frameCanvas.height;
  heatmap.getContext("2d")?.putImageData(output, 0, 0);
  ctx.drawImage(heatmap, 0, 0);
}

function drawMatrix(width: number, height: number): void {
  const action = currentAction();
  if (!action) return;
  const columns = action.directions.length;
  const cellScale = Math.min((width - 60) / (columns * action.cell.width), (height - 90) / action.cell.height, 3);
  const startX = (width - columns * action.cell.width * cellScale) / 2;
  const startY = (height - action.cell.height * cellScale) / 2;
  action.directions.forEach((direction, index) => {
    const frame = action.tracks[direction]?.frames[Math.min(state.frameIndex, trackFrameCount(action) - 1)];
    if (!frame) return;
    const image = getCachedImage(frame.imagePath);
    if (image?.complete) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        image,
        frame.crop.x,
        frame.crop.y,
        frame.crop.width,
        frame.crop.height,
        startX + index * action.cell.width * cellScale,
        startY,
        action.cell.width * cellScale,
        action.cell.height * cellScale
      );
    }
    ctx.fillStyle = direction === state.direction ? "#fff200" : "#e7edf4";
    ctx.textAlign = "center";
    ctx.font = "12px ui-sans-serif";
    ctx.fillText(direction, startX + (index + 0.5) * action.cell.width * cellScale, startY + action.cell.height * cellScale + 20);
  });
}

const imageCache = new Map<string, HTMLImageElement>();
function getCachedImage(path: string): HTMLImageElement {
  const existing = imageCache.get(path);
  if (existing) return existing;
  const image = new Image();
  image.src = imageUrl(path);
  imageCache.set(path, image);
  return image;
}

function playbackFrame(action: CharacterAction, direction: DirectionName, now: number): number {
  const frames = action.tracks[direction]?.frames ?? [];
  const elapsed = (now - state.playbackStarted) * Number(byId<HTMLInputElement>("previewSpeed").value);
  if (action.category === "locomotion" && action.cycleDistancePx) {
    const model = byId<HTMLSelectElement>("playbackModel").value;
    if (model === "legacy") {
      const legacyFrameMs = action.id.includes("run") ? 100 : 125;
      return Math.floor(elapsed / legacyFrameMs) % Math.max(1, frames.length);
    }
    const strength = Number(byId<HTMLInputElement>("joystickStrength").value);
    const baseSpeed = action.id.includes("run") ? 240 : 144;
    const distance = byId<HTMLInputElement>("blockedMovement").checked ? 0 : (elapsed / 1000) * baseSpeed * strength;
    return frameIndexFromDistance(distance, action.cycleDistancePx, frames.length, action.entryFrame);
  }
  return frameIndexFromElapsed(elapsed, frames, action.playback, [action.loop.start, action.loop.end], action.entryFrame).frameIndex;
}

function drawPlayback(width: number, height: number): void {
  const action = currentAction();
  if (!action) return;
  const viewport = selectedViewport();
  const fit = Math.min((width - 28) / viewport.width, (height - 28) / viewport.height);
  const viewportX = (width - viewport.width * fit) / 2;
  const viewportY = (height - viewport.height * fit) / 2;
  const now = state.playing ? performance.now() : state.playbackStarted;
  const index = playbackFrame(action, state.direction, now);
  const frame = action.tracks[state.direction]?.frames[index];
  if (!frame) return;
  ctx.save();
  ctx.translate(viewportX, viewportY);
  ctx.scale(fit, fit);
  ctx.beginPath();
  ctx.rect(0, 0, viewport.width, viewport.height);
  ctx.clip();
  ctx.strokeStyle = "#647487";
  ctx.lineWidth = 1 / fit;
  ctx.strokeRect(0, 0, viewport.width, viewport.height);
  const image = getCachedImage(frame.imagePath);
  const scale = Number(byId<HTMLInputElement>("renderScale").value);
  const elapsed = Math.max(0, now - state.playbackStarted) * Number(byId<HTMLInputElement>("previewSpeed").value);
  const strength = Number(byId<HTMLInputElement>("joystickStrength").value);
  const speed = action.id.includes("run") ? 240 : 144;
  const blocked = byId<HTMLInputElement>("blockedMovement").checked;
  const distance =
    state.mode === "motion" && action.category === "locomotion" && !blocked
      ? (elapsed / 1000) * speed * strength
      : 0;
  const legacyFrame =
    action.category === "locomotion"
      ? Math.floor(elapsed / (action.id.includes("run") ? 100 : 125)) %
        Math.max(1, action.tracks[state.direction]?.frames.length ?? 1)
      : index;
  const distanceFrame =
    action.category === "locomotion" && action.cycleDistancePx
      ? frameIndexFromDistance(distance, action.cycleDistancePx, action.tracks[state.direction]?.frames.length ?? 1, action.entryFrame)
      : index;
  const root = {
    x: state.mode === "motion" ? 70 + (distance % Math.max(1, viewport.width - 140)) : viewport.width / 2,
    y: viewport.height * 0.68
  };
  if (image.complete) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      image,
      frame.crop.x,
      frame.crop.y,
      frame.crop.width,
      frame.crop.height,
      Math.round(root.x - frame.root.x * scale + frame.visualOffset.x * scale),
      Math.round(root.y - frame.root.y * scale + frame.visualOffset.y * scale),
      action.cell.width * scale,
      action.cell.height * scale
    );
  }
  ctx.strokeStyle = "#38e6ff";
  ctx.beginPath();
  ctx.moveTo(30, root.y);
  ctx.lineTo(viewport.width - 30, root.y);
  ctx.stroke();
  ctx.fillStyle = "#f5f8fb";
  ctx.font = "13px ui-monospace";
  ctx.fillText(
    `${action.id} / ${state.direction} / frame ${index + 1} / distance ${distance.toFixed(1)}px / ${strength.toFixed(2)} strength`,
    20,
    28
  );
  ctx.restore();
  byId<HTMLSpanElement>("motionReadout").textContent =
    `Shown ${index + 1} · distance ${distanceFrame + 1} · legacy ${legacyFrame + 1} · ${distance.toFixed(1)} px` +
    (action.cycleDistancePx ? ` / ${action.cycleDistancePx}px cycle` : "") +
    ` · logical ${viewport.width}×${viewport.height} @ ${viewport.outputScale}x` +
    (viewport.compatibilityFallback ? " · fractional fallback" : "") +
    (blocked ? " · blocked" : "");
}

function selectedViewport() {
  return calculateLogicalViewport(
    Number(byId<HTMLInputElement>("viewportWidth").value),
    Number(byId<HTMLInputElement>("viewportHeight").value),
    Number(byId<HTMLInputElement>("viewportDpr").value)
  );
}

function drawInteraction(width: number, height: number): void {
  drawPlayback(width, height);
  const action = secondaryAction();
  if (!action) return;
  const direction = state.secondaryDirection;
  const now = state.playing ? performance.now() : state.playbackStarted;
  const synced = byId<HTMLInputElement>("interactionSyncTimeline").checked;
  const frameIndex = synced
    ? playbackFrame(action, direction, now)
    : state.secondaryFrameIndex;
  const frame = action.tracks[direction]?.frames[frameIndex];
  if (!frame) return;
  const image = getCachedImage(frame.imagePath);
  const viewport = selectedViewport();
  const fit = Math.min((width - 28) / viewport.width, (height - 28) / viewport.height);
  const viewportX = (width - viewport.width * fit) / 2;
  const viewportY = (height - viewport.height * fit) / 2;
  const scale = Number(byId<HTMLInputElement>("interactionScale").value);
  const offsetX = Number(byId<HTMLInputElement>("interactionOffsetX").value);
  const offsetY = Number(byId<HTMLInputElement>("interactionOffsetY").value);
  const logicalRoot = { x: viewport.width / 2 + offsetX, y: viewport.height * 0.68 + offsetY };
  const root = { x: viewportX + logicalRoot.x * fit, y: viewportY + logicalRoot.y * fit };
  if (image.complete) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      image,
      frame.crop.x,
      frame.crop.y,
      frame.crop.width,
      frame.crop.height,
      Math.round(root.x - (frame.root.x - frame.visualOffset.x) * scale * fit),
      Math.round(root.y - (frame.root.y - frame.visualOffset.y) * scale * fit),
      action.cell.width * scale * fit,
      action.cell.height * scale * fit
    );
  }
  if (state.propImage?.complete) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      state.propImage,
      Math.round(viewportX + (viewport.width / 2 + 28) * fit),
      Math.round(viewportY + (viewport.height * 0.68 - 20) * fit)
    );
  }
  byId<HTMLSpanElement>("interactionFrameReadout").textContent =
    `${frameIndex + 1} / ${action.tracks[direction]?.frames.length ?? 1}`;
}

function pointerToFrame(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((event.clientX - rect.left - state.pan.x) / state.zoom),
    y: Math.floor((event.clientY - rect.top - state.pan.y) / state.zoom)
  };
}

function mutatePixels(event: PointerEvent): void {
  if (state.mode !== "frame") return;
  const point = pointerToFrame(event);
  if (point.x < 0 || point.y < 0 || point.x >= frameCanvas.width || point.y >= frameCanvas.height) return;
  const radius = Number(byId<HTMLInputElement>("brushRadius").value);
  if (state.tool === "root") {
    const frame = currentFrame();
    if (!frame) return;
    if (state.selectedAnchor >= 0 && frame.anchors[state.selectedAnchor]) {
      frame.anchors[state.selectedAnchor].point = point;
    } else {
      frame.root = point;
    }
    markDirty();
    syncFrameInspector();
    return;
  }
  if (state.tool === "sample") {
    const pixel = frameCtx.getImageData(point.x, point.y, 1, 1).data;
    state.sampledMatte = [pixel[0], pixel[1], pixel[2]];
    validationPanel.textContent = `Sampled matte RGB ${state.sampledMatte.join(", ")}. Review tolerance, then apply.`;
    state.pointer.down = false;
    return;
  }
  if (state.tool === "component") {
    removeConnectedComponent(point.x, point.y);
    state.pointer.down = false;
    return;
  }
  if (state.tool !== "erase" && state.tool !== "restore") return;
  const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
  const original = originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
  for (let y = Math.max(0, point.y - radius); y <= Math.min(frameCanvas.height - 1, point.y + radius); y += 1) {
    for (let x = Math.max(0, point.x - radius); x <= Math.min(frameCanvas.width - 1, point.x + radius); x += 1) {
      if (Math.hypot(x - point.x, y - point.y) > radius) continue;
      const index = (y * frameCanvas.width + x) * 4;
      if (state.tool === "erase") {
        imageData.data[index] = 0;
        imageData.data[index + 1] = 0;
        imageData.data[index + 2] = 0;
        imageData.data[index + 3] = 0;
      } else {
        imageData.data.set(original.data.slice(index, index + 4), index);
      }
    }
  }
  frameCtx.putImageData(imageData, 0, 0);
  state.imageDirty = true;
  updateDirtyState();
}

function removeConnectedComponent(startX: number, startY: number): void {
  const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
  const startIndex = (startY * frameCanvas.width + startX) * 4;
  if (imageData.data[startIndex + 3] === 0) return;
  const target = [
    imageData.data[startIndex],
    imageData.data[startIndex + 1],
    imageData.data[startIndex + 2],
    imageData.data[startIndex + 3]
  ];
  const tolerance = Number(byId<HTMLInputElement>("matteTolerance").value);
  const queue: Array<[number, number]> = [[startX, startY]];
  const visited = new Uint8Array(frameCanvas.width * frameCanvas.height);
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    const pixelIndex = y * frameCanvas.width + x;
    if (visited[pixelIndex]) continue;
    visited[pixelIndex] = 1;
    const index = pixelIndex * 4;
    const distance = Math.hypot(
      imageData.data[index] - target[0],
      imageData.data[index + 1] - target[1],
      imageData.data[index + 2] - target[2],
      imageData.data[index + 3] - target[3]
    );
    if (distance > tolerance) continue;
    imageData.data[index] = 0;
    imageData.data[index + 1] = 0;
    imageData.data[index + 2] = 0;
    imageData.data[index + 3] = 0;
    if (x > 0) queue.push([x - 1, y]);
    if (x < frameCanvas.width - 1) queue.push([x + 1, y]);
    if (y > 0) queue.push([x, y - 1]);
    if (y < frameCanvas.height - 1) queue.push([x, y + 1]);
  }
  frameCtx.putImageData(imageData, 0, 0);
  state.imageDirty = true;
  updateDirtyState();
}

function removeSampledMatte(): void {
  if (!state.sampledMatte) {
    validationPanel.textContent = "Sample a real matte/background color from the selected frame first.";
    return;
  }
  const tolerance = Number(byId<HTMLInputElement>("matteTolerance").value);
  const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const distance = Math.hypot(
      imageData.data[index] - state.sampledMatte[0],
      imageData.data[index + 1] - state.sampledMatte[1],
      imageData.data[index + 2] - state.sampledMatte[2]
    );
    if (distance <= tolerance) {
      imageData.data[index] = 0;
      imageData.data[index + 1] = 0;
      imageData.data[index + 2] = 0;
      imageData.data[index + 3] = 0;
    }
  }
  frameCtx.putImageData(imageData, 0, 0);
  state.imageDirty = true;
  updateDirtyState();
}

async function saveFrameDerivative(): Promise<void> {
  const project = state.project;
  const action = currentAction();
  const frame = currentFrame();
  if (!project || !action || !frame) return;
  const result = await api<{ project: CharacterProjectV1 }>("/api/frame/save", {
    method: "POST",
    body: JSON.stringify({
      projectId: project.id,
      actionId: action.id,
      direction: state.direction,
      frameId: frame.id,
      png: frameCanvas.toDataURL("image/png")
    })
  });
  state.project = result.project;
  state.dirty = false;
  state.imageDirty = false;
  renderNavigation();
  syncProjectInspector();
  await loadCurrentFrame();
}

function updateFrameMetadata(): void {
  const frame = currentFrame();
  if (!frame) return;
  captureHistory();
  frame.root.x = Number(byId<HTMLInputElement>("rootX").value);
  frame.root.y = Number(byId<HTMLInputElement>("rootY").value);
  frame.visualOffset.x = Number(byId<HTMLInputElement>("offsetX").value);
  frame.visualOffset.y = Number(byId<HTMLInputElement>("offsetY").value);
  frame.crop.x = Number(byId<HTMLInputElement>("cropX").value);
  frame.crop.y = Number(byId<HTMLInputElement>("cropY").value);
  frame.crop.width = Number(byId<HTMLInputElement>("cropWidth").value);
  frame.crop.height = Number(byId<HTMLInputElement>("cropHeight").value);
  const bodyValues = ["bodyX", "bodyY", "bodyWidth", "bodyHeight"].map((id) => byId<HTMLInputElement>(id).value);
  frame.bodyBounds = bodyValues.every((value) => value !== "" && Number.isFinite(Number(value)))
    ? {
        x: Number(bodyValues[0]),
        y: Number(bodyValues[1]),
        width: Number(bodyValues[2]),
        height: Number(bodyValues[3])
      }
    : undefined;
  frame.durationMs = Number(byId<HTMLInputElement>("durationMs").value);
  frame.grounded = byId<HTMLInputElement>("grounded").checked;
  frame.contact = byId<HTMLSelectElement>("contact").value as FrameReference["contact"];
  markDirty();
}

async function saveProject(): Promise<void> {
  if (!state.project) return;
  if (state.imageDirty) throw new Error("Save or reset the edited pixel derivative before saving metadata.");
  state.project.production.status = byId<HTMLSelectElement>("productionStatus").value as ProductionStatus;
  state.project.identity.canonicalApproval = byId<HTMLSelectElement>("canonicalApproval").value as "unapproved" | "approved";
  state.project.identity.locked = byId<HTMLInputElement>("identityLocked").checked;
  state.project.collisionProfileId = byId<HTMLInputElement>("collisionProfile").value.trim();
  state.project.presentation.resampling = byId<HTMLSelectElement>("resamplingPolicy").value as CharacterProjectV1["presentation"]["resampling"];
  const result = await api<{ project: CharacterProjectV1 }>("/api/project/save", {
    method: "POST",
    body: JSON.stringify({ project: state.project })
  });
  state.project = result.project;
  state.dirty = false;
  state.stage = null;
  syncProjectInspector();
  updateDirtyState();
}

async function validateProject(): Promise<void> {
  if (!state.project) return;
  try {
    if (state.imageDirty) throw new Error("Save or reset the edited pixel derivative before validation.");
    if (state.dirty) await saveProject();
    const result = await api<{ validation: { ok: boolean; errors: string[]; warnings: string[] } }>(
      "/api/project/validate",
      {
        method: "POST",
        body: JSON.stringify({ projectId: state.project.id })
      }
    );
    if (!result.validation.ok) throw new Error(result.validation.errors.join("\n"));
    validationPanel.textContent = [
      "PASS — schema, provenance, PNG, geometry, and production contract",
      ...result.validation.warnings.map((warning) => `WARNING — ${warning}`)
    ].join("\n");
  } catch (error) {
    validationPanel.textContent = `FAIL — ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function stageExport(): Promise<void> {
  if (!state.project) return;
  if (state.dirty || state.imageDirty) await saveProject();
  const result = await api<{ report: StageReport }>("/api/export/stage", {
    method: "POST",
    body: JSON.stringify({ projectId: state.project.id })
  });
  state.stage = result.report;
  publishBtn.disabled = false;
  validationPanel.textContent = [
    `STAGED ${result.report.stageId}`,
    ...result.report.validation.warnings.map((warning) => `WARNING — ${warning}`),
    ...result.report.files.map((file) => `${file.change.toUpperCase()} ${file.publishPath}\n  ${file.sha256}`)
  ].join("\n");
}

async function publishStage(): Promise<void> {
  if (!state.stage) return;
  if (!window.confirm(`Publish staged revision ${state.stage.stageId} to the game? Existing files will be backed up first.`)) return;
  const result = await api<{ published: string[]; backup: { directory: string } | null }>("/api/export/publish", {
    method: "POST",
    body: JSON.stringify({ stageId: state.stage.stageId })
  });
  validationPanel.textContent = `PUBLISHED\n${result.published.join("\n")}\nBackup: ${result.backup?.directory ?? "none required"}`;
  publishBtn.disabled = true;
}

async function batchStage(): Promise<void> {
  const characterClass = byId<HTMLSelectElement>("batchClass").value;
  if (!window.confirm(`Validate and stage every runtime-ready ${characterClass} project? No live assets will be published.`)) return;
  const result = await api<{ reports: StageReport[] }>("/api/export/batch-stage", {
    method: "POST",
    body: JSON.stringify({ characterClass })
  });
  state.stage = null;
  publishBtn.disabled = true;
  validationPanel.textContent = [
    `BATCH STAGED ${result.reports.length} ${characterClass} PROJECTS`,
    ...result.reports.map((report) => `${report.projectId} — ${report.stageId} — ${report.files.filter((file) => file.change !== "unchanged").length} changed/new`)
  ].join("\n");
}

async function importPortrait(): Promise<void> {
  if (!state.project) return;
  if (state.dirty || state.imageDirty) throw new Error("Save or reset current edits before importing portrait art.");
  const imagePath = window.prompt("Project-relative path to the real approved portrait PNG:")?.trim();
  if (!imagePath) return;
  const portraitId = window.prompt("Stable portrait ID:")?.trim();
  if (!portraitId) return;
  const expression = window.prompt("Expression ID/name:")?.trim();
  if (!expression) return;
  const result = await api<{ project: CharacterProjectV1 }>("/api/project/import-portrait", {
    method: "POST",
    body: JSON.stringify({ projectId: state.project.id, imagePath, portraitId, expression })
  });
  state.project = result.project;
  state.dirty = false;
  state.stage = null;
  syncProjectInspector();
  updateDirtyState();
  validationPanel.textContent = `Imported ${portraitId} from ${imagePath} as in-production. Runtime export remains blocked until explicit approval.`;
}

function approvePortrait(index: number): void {
  const project = state.project;
  const portrait = project?.portraits[index];
  if (!project || !portrait) return;
  if (project.identity.canonicalApproval !== "approved" || !project.identity.locked) {
    throw new Error("Canonical identity must be approved and locked before a portrait can become runtime-ready.");
  }
  const source = project.sources.find((candidate) => candidate.path === portrait.imagePath && candidate.role === "portrait");
  if (!source || source.missing) throw new Error("Portrait approval requires its real imported source.");
  captureHistory();
  source.approval = "approved";
  portrait.status = "runtime_ready";
  markDirty();
  renderPortraits();
}

function addAnchor(): void {
  const frame = currentFrame();
  if (!frame) return;
  const id = window.prompt("Anchor ID (for example hand_main, mouth, effect_origin):")?.trim();
  if (!id || !/^[a-z0-9][a-z0-9_-]*$/i.test(id)) return;
  const role = window.prompt("Anchor role: hand, mouth, interaction, effect_origin, foot, or custom", "custom")?.trim();
  const allowed = ["root", "foot", "hand", "mouth", "interaction", "effect_origin", "custom"];
  if (!role || !allowed.includes(role)) return;
  captureHistory();
  frame.anchors.push({ id, role: role as FrameReference["anchors"][number]["role"], point: { ...frame.root }, drawOrder: "front" });
  state.selectedAnchor = frame.anchors.length - 1;
  markDirty();
  renderAnchors();
}

function deleteAnchor(): void {
  const frame = currentFrame();
  if (!frame || state.selectedAnchor < 0) return;
  captureHistory();
  frame.anchors.splice(state.selectedAnchor, 1);
  state.selectedAnchor = -1;
  markDirty();
  renderAnchors();
}

function addFrameEvent(): void {
  const frame = currentFrame();
  if (!frame) return;
  const id = window.prompt("Stable event ID:")?.trim();
  if (!id || !/^[a-z0-9][a-z0-9_-]*$/i.test(id) || frame.events.some((event) => event.id === id)) return;
  const type = window.prompt("Event type: contact, release, spawn, cue, or custom", "cue")?.trim();
  if (!type || !["contact", "release", "spawn", "cue", "custom"].includes(type)) return;
  const payload = window.prompt("Optional real event payload (leave blank for none):", "")?.trim();
  captureHistory();
  frame.events.push({
    id,
    type: type as FrameReference["events"][number]["type"],
    payload: payload || undefined
  });
  markDirty();
  renderEvents();
  renderTimeline();
}

function deleteFrameEvent(index: number): void {
  const frame = currentFrame();
  if (!frame?.events[index]) return;
  captureHistory();
  frame.events.splice(index, 1);
  markDirty();
  renderEvents();
  renderTimeline();
}

function setMirrorProvenance(): void {
  const frame = currentFrame();
  const action = currentAction();
  if (!frame || !action) return;
  const direction = window.prompt(
    `Approved mirror source direction (${action.directions.filter((candidate) => candidate !== state.direction).join(", ")}):`
  ) as DirectionName | null;
  if (!direction || direction === state.direction || !action.directions.includes(direction)) return;
  captureHistory();
  frame.mirrorSource = { direction, approved: true };
  markDirty();
  renderTimeline();
  validationPanel.textContent = `Recorded explicit approved mirror provenance from ${direction}. Pixels were not changed.`;
}

function clearMirrorProvenance(): void {
  const frame = currentFrame();
  if (!frame?.mirrorSource) return;
  captureHistory();
  delete frame.mirrorSource;
  markDirty();
  renderTimeline();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

projectSelect.addEventListener("change", () => void loadProject(projectSelect.value));
sourceList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-source]");
  const path = button?.dataset.source;
  const source = state.project?.sources.find((candidate) => candidate.path === path);
  if (!path || !source) return;
  if (source.missing) {
    validationPanel.textContent = `SOURCE UNAVAILABLE — ${source.path}\n${source.notes ?? "No additional provenance note."}`;
    return;
  }
  if (!/\.(png|jpe?g|webp)$/i.test(path)) {
    validationPanel.textContent = `METADATA SOURCE — ${source.path}\n${source.notes ?? ""}`;
    return;
  }
  const preview = byId<HTMLDivElement>("referencePreview");
  byId<HTMLImageElement>("referenceImage").src = imageUrl(path);
  byId<HTMLSpanElement>("referenceCaption").textContent = `${source.role} — ${source.path}`;
  preview.hidden = false;
  void api<{ inspection: ImageInspection }>("/api/image/inspect", {
    method: "POST",
    body: JSON.stringify({ path })
  })
    .then((result) => {
      state.inspection = result.inspection;
      renderInspection();
    })
    .catch(showError);
});
actionList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
  if (!button || state.imageDirty) return;
  state.actionId = button.dataset.action ?? null;
  state.direction = currentAction()?.directions[0] ?? "Down";
  state.frameIndex = 0;
  renderNavigation();
  void loadCurrentFrame();
});
directionList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-direction]");
  if (!button || button.disabled || state.imageDirty) return;
  state.direction = button.dataset.direction as DirectionName;
  state.frameIndex = 0;
  renderNavigation();
  void loadCurrentFrame();
});
timeline.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-frame]");
  if (!button || state.imageDirty) return;
  state.frameIndex = Number(button.dataset.frame);
  renderTimeline();
  void loadCurrentFrame();
});
document.querySelector(".mode-tabs")?.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-mode]");
  if (!button) return;
  state.mode = button.dataset.mode as CanvasMode;
  document.querySelectorAll(".mode-tabs button").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  state.playbackStarted = performance.now();
});
document.querySelector(".canvas-toolbar")?.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tool]");
  if (!button) return;
  state.tool = button.dataset.tool as PixelTool;
  document.querySelectorAll("[data-tool]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
});
byId<HTMLSelectElement>("backgroundSelect").addEventListener("change", (event) => {
  state.background = (event.target as HTMLSelectElement).value as PreviewBackground;
});
byId<HTMLSelectElement>("viewportPreset").addEventListener("change", (event) => {
  const value = (event.target as HTMLSelectElement).value;
  if (value === "custom") return;
  const [width, height, dpr] = value.split(",");
  byId<HTMLInputElement>("viewportWidth").value = width;
  byId<HTMLInputElement>("viewportHeight").value = height;
  byId<HTMLInputElement>("viewportDpr").value = dpr;
});
canvas.addEventListener("pointerdown", (event) => {
  state.pointer.down = true;
  state.pointer.lastX = event.clientX;
  state.pointer.lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  if (state.tool !== "pan" && state.tool !== "sample") captureHistory();
  if (state.tool !== "pan") mutatePixels(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (!state.pointer.down) return;
  if (state.tool === "pan") {
    state.pan.x += event.clientX - state.pointer.lastX;
    state.pan.y += event.clientY - state.pointer.lastY;
    state.pointer.lastX = event.clientX;
    state.pointer.lastY = event.clientY;
  } else if (state.tool === "erase" || state.tool === "restore" || state.tool === "root") {
    mutatePixels(event);
  }
});
const stopPointer = () => {
  state.pointer.down = false;
};
canvas.addEventListener("pointerup", stopPointer);
canvas.addEventListener("pointercancel", stopPointer);
canvas.addEventListener(
  "wheel",
  (event) => {
    if (state.mode !== "frame") return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const before = { x: (x - state.pan.x) / state.zoom, y: (y - state.pan.y) / state.zoom };
    state.zoom = Math.max(0.25, Math.min(24, state.zoom * (event.deltaY < 0 ? 1.15 : 0.87)));
    state.pan.x = x - before.x * state.zoom;
    state.pan.y = y - before.y * state.zoom;
  },
  { passive: false }
);
["rootX", "rootY", "offsetX", "offsetY", "cropX", "cropY", "cropWidth", "cropHeight", "bodyX", "bodyY", "bodyWidth", "bodyHeight", "durationMs", "grounded", "contact"].forEach((id) =>
  byId<HTMLInputElement | HTMLSelectElement>(id).addEventListener("change", () => {
    updateFrameMetadata();
    if (id.startsWith("crop")) void loadCurrentFrame().catch(showError);
  })
);
["productionStatus", "canonicalApproval", "identityLocked", "collisionProfile", "resamplingPolicy"].forEach((id) =>
  byId<HTMLInputElement | HTMLSelectElement>(id).addEventListener("change", markDirty)
);
byId<HTMLButtonElement>("resetFrameBtn").addEventListener("click", () => {
  captureHistory();
  frameCtx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
  frameCtx.drawImage(originalCanvas, 0, 0);
  state.imageDirty = false;
  updateDirtyState();
});
byId<HTMLButtonElement>("setMirrorBtn").addEventListener("click", setMirrorProvenance);
byId<HTMLButtonElement>("clearMirrorBtn").addEventListener("click", clearMirrorProvenance);
byId<HTMLButtonElement>("applyMatteBtn").addEventListener("click", () => {
  captureHistory();
  removeSampledMatte();
});
byId<HTMLButtonElement>("undoBtn").addEventListener("click", undo);
byId<HTMLButtonElement>("redoBtn").addEventListener("click", redo);
byId<HTMLButtonElement>("saveFrameBtn").addEventListener("click", () => void saveFrameDerivative().catch(showError));
byId<HTMLButtonElement>("saveProjectBtn").addEventListener("click", () => void saveProject().catch(showError));
byId<HTMLButtonElement>("validateBtn").addEventListener("click", () => void validateProject());
byId<HTMLButtonElement>("stageBtn").addEventListener("click", () => void stageExport().catch(showError));
byId<HTMLButtonElement>("batchStageBtn").addEventListener("click", () => void batchStage().catch(showError));
byId<HTMLButtonElement>("importPortraitBtn").addEventListener("click", () => void importPortrait().catch(showError));
byId<HTMLDivElement>("portraitList").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-approve-portrait]");
  if (!button) return;
  try {
    approvePortrait(Number(button.dataset.approvePortrait));
  } catch (error) {
    showError(error);
  }
});
publishBtn.addEventListener("click", () => void publishStage().catch(showError));
byId<HTMLButtonElement>("addAnchorBtn").addEventListener("click", addAnchor);
byId<HTMLButtonElement>("deleteAnchorBtn").addEventListener("click", deleteAnchor);
byId<HTMLButtonElement>("addEventBtn").addEventListener("click", addFrameEvent);
byId<HTMLDivElement>("eventList").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-delete-event]");
  if (button) deleteFrameEvent(Number(button.dataset.deleteEvent));
});
byId<HTMLDivElement>("anchorList").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-anchor]");
  if (!button) return;
  state.selectedAnchor = Number(button.dataset.anchor);
  state.tool = "root";
  renderAnchors();
});
byId<HTMLButtonElement>("playBtn").addEventListener("click", (event) => {
  state.playing = !state.playing;
  state.playbackStarted = performance.now();
  (event.currentTarget as HTMLButtonElement).textContent = state.playing ? "Pause" : "Play";
});
byId<HTMLSelectElement>("interactionProject").addEventListener("change", async (event) => {
  const id = (event.target as HTMLSelectElement).value;
  state.secondaryProject = id ? (await api<{ project: CharacterProjectV1 }>(`/api/project?id=${encodeURIComponent(id)}`)).project : null;
  state.secondaryActionId = state.secondaryProject ? Object.keys(state.secondaryProject.actions)[0] ?? null : null;
  state.secondaryDirection = secondaryAction()?.directions[0] ?? "Down";
  state.secondaryFrameIndex = 0;
  if (state.secondaryProject) {
    const projectScale =
      state.secondaryProject.presentation.renderScales.overworld ??
      Object.values(state.secondaryProject.presentation.renderScales)[0] ??
      1;
    byId<HTMLInputElement>("interactionScale").value = String(projectScale);
  }
  syncInteractionControls();
});
byId<HTMLSelectElement>("interactionAction").addEventListener("change", (event) => {
  state.secondaryActionId = (event.target as HTMLSelectElement).value || null;
  state.secondaryDirection = secondaryAction()?.directions[0] ?? "Down";
  state.secondaryFrameIndex = 0;
  state.playbackStarted = performance.now();
  syncInteractionControls();
});
byId<HTMLSelectElement>("interactionDirection").addEventListener("change", (event) => {
  state.secondaryDirection = (event.target as HTMLSelectElement).value as DirectionName;
  state.secondaryFrameIndex = 0;
  state.playbackStarted = performance.now();
  syncInteractionControls();
});
byId<HTMLInputElement>("interactionFrame").addEventListener("input", (event) => {
  state.secondaryFrameIndex = Number((event.target as HTMLInputElement).value);
  syncInteractionControls();
});
byId<HTMLInputElement>("interactionSyncTimeline").addEventListener("change", () => {
  state.playbackStarted = performance.now();
  syncInteractionControls();
});
byId<HTMLInputElement>("propImagePath").addEventListener("change", async (event) => {
  const path = (event.target as HTMLInputElement).value.trim();
  if (!path) {
    state.propImage = null;
    return;
  }
  try {
    await api("/api/image/inspect", { method: "POST", body: JSON.stringify({ path }) });
    const image = new Image();
    image.src = imageUrl(path);
    await image.decode();
    state.propImage = image;
  } catch (error) {
    showError(error);
  }
});
byId<HTMLButtonElement>("importSheetBtn").addEventListener("click", () => importDialog.showModal());
importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(importForm);
  const body = Object.fromEntries(formData.entries());
  try {
    const result = await api<{ project: CharacterProjectV1 }>("/api/project/import-sheet", {
      method: "POST",
      body: JSON.stringify(body)
    });
    byId<HTMLPreElement>("importResult").textContent = `Imported ${result.project.displayName}.`;
    importDialog.close();
    await bootstrap();
    await loadProject(result.project.id);
  } catch (error) {
    byId<HTMLPreElement>("importResult").textContent = error instanceof Error ? error.message : String(error);
  }
});
window.addEventListener("resize", resizeCanvas);

function showError(error: unknown): void {
  validationPanel.textContent = `FAIL — ${error instanceof Error ? error.message : String(error)}`;
}

resizeCanvas();
requestAnimationFrame(draw);
void bootstrap().catch(showError);

// Keep the shared direction function exercised in the production UI contract.
void directionForVectorWithHysteresis({ x: 0, y: 1 }, "Down", 10);
