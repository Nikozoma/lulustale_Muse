import { api, assetHref, jsonPost, listAssets, listProjects, loadImage, loadProject } from "./api.js";
import { StudioHistory } from "./history.js";
import {
  COLLECTION_COLORS,
  COLLECTION_LABELS,
  SEMANTIC_COLLECTIONS,
  compileCollisionPreview,
  componentTriggerContains,
  normalizeRecordGeometry,
  recordBounds,
  recordContains,
  snapPoint
} from "./model.js";
import type {
  AlphaComponent,
  ArtLayer,
  AssetInfo,
  CollisionPreview,
  ForegroundLayer,
  HistorySnapshot,
  LoadedProject,
  Phase,
  Point,
  Polygon,
  RasterLayerState,
  Rect,
  RepairAnnotation,
  SelectedRecord,
  SemanticCollection,
  SemanticMap,
  SemanticRecord,
  ToolMode,
  ViewState,
  VisualMap
} from "./types.js";

const canvas = element<HTMLCanvasElement>("mapCanvas");
const context = requiredContext(canvas);
const assetPreview = element<HTMLCanvasElement>("assetPreview");
const assetPreviewContext = requiredContext(assetPreview);
const history = new StudioHistory();

let project: LoadedProject | null = null;
let collision: CollisionPreview | null = null;
let assets: AssetInfo[] = [];
let selectedRecord: SelectedRecord | null = null;
let selectedArtLayerId = "base";
let selectedForegroundLayerId = "";
let selectedForegroundComponentId = "";
let selectedAsset: AssetInfo | null = null;
let selectedAssetImage: HTMLImageElement | null = null;
let rasterLayers = new Map<string, RasterLayerState>();
let luluImage: HTMLImageElement | null = null;
let luluPoint: Point = { x: 208, y: 624 };
let dirtyModel = false;
let dirtyRaster = false;
let tool: ToolMode = "select";
let polygonDraft: Point[] = [];
let rasterSelection: Rect | null = null;
let rasterPolygonDraft: Point[] = [];
let rasterSelectionPolygon: Point[] | null = null;
let cloneSource: Point | null = null;
let pointer: PointerState = emptyPointer();
let rasterAction: RasterAction | null = null;
let rasterUndo: RasterAction[] = [];
let rasterRedo: RasterAction[] = [];
let lastModelEdit = 0;
let lastRasterEdit = 0;
let blinkPhase: Phase = "day";
let statusTimer = 0;

const view: ViewState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  phase: "day",
  compareMode: "single",
  comparePosition: 0.5,
  snap: 4,
  showGrid: true,
  showCollision: false,
  showSemantics: true,
  showForegroundTriggers: false,
  showRepairs: true,
  showLulu: false
};

void initialize();

async function initialize(): Promise<void> {
  wireUi();
  resizeCanvas();
  setStatus("Inspecting active runtime map projects…");
  try {
    await api("/api/health");
    let summaries = await listProjects();
    if (summaries.length === 0) {
      for (const mapId of ["home", "charles_jr", "overworld"]) {
        await jsonPost("/api/project/import", { mapId });
      }
      summaries = await listProjects();
    }
    populateProjects(summaries);
    assets = await listAssets();
    renderAssetOptions();
    const first = summaries.find((summary) => !summary.error);
    if (first) {
      element<HTMLSelectElement>("projectSelect").value = first.mapId;
      await loadSelectedProject();
    } else {
      setStatus("No valid active runtime map project is available.", true);
    }
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
  requestAnimationFrame(drawLoop);
}

function wireUi(): void {
  element("projectSelect").addEventListener("change", () => void loadSelectedProject());
  element("reloadProject").addEventListener("click", () => void loadSelectedProject());
  element("newProject").addEventListener("click", () => element<HTMLDialogElement>("newProjectDialog").showModal());
  element("saveProject").addEventListener("click", () => void saveAllDrafts());
  element("validateProject").addEventListener("click", () => void validateCurrentProject());
  element("stageProject").addEventListener("click", () => void stageCurrentProject());
  element("publishProject").addEventListener("click", () => void preparePublish());
  element("undoButton").addEventListener("click", undo);
  element("redoButton").addEventListener("click", redo);
  element("phaseSelect").addEventListener("change", () => {
    view.phase = element<HTMLSelectElement>("phaseSelect").value as Phase;
    renderArtLayers();
    renderForegroundControls();
  });
  element("compareMode").addEventListener("change", () => {
    view.compareMode = element<HTMLSelectElement>("compareMode").value as ViewState["compareMode"];
    updateCompareVisibility();
  });
  element("comparePosition").addEventListener("input", () => {
    view.comparePosition = Number(element<HTMLInputElement>("comparePosition").value);
  });
  element("snapSelect").addEventListener("change", () => {
    view.snap = Number(element<HTMLSelectElement>("snapSelect").value);
  });
  element("oneToOne").addEventListener("click", () => {
    view.zoom = 1;
    view.panX = 24;
    view.panY = 24;
    updateHud();
  });
  element("fitMap").addEventListener("click", fitMap);

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.addEventListener("click", () => setTool(button.dataset.tool as ToolMode));
  }
  for (const [id, property] of [
    ["showGrid", "showGrid"],
    ["showCollision", "showCollision"],
    ["showSemantics", "showSemantics"],
    ["showForegroundTriggers", "showForegroundTriggers"],
    ["showRepairs", "showRepairs"],
    ["showLulu", "showLulu"]
  ] as const) {
    element<HTMLInputElement>(id).addEventListener("change", async () => {
      view[property] = element<HTMLInputElement>(id).checked;
      if (property === "showLulu" && view.showLulu && !luluImage) await loadRealLulu();
    });
  }

  element("semanticCollection").addEventListener("change", () => {
    selectedRecord = null;
    renderRecordList();
    renderInspector();
  });
  element("recordSearch").addEventListener("input", renderRecordList);
  element("newRecordId").addEventListener("click", () => {
    element<HTMLInputElement>("recordId").value = nextRecordId(activeCollection());
  });
  element("applyRecord").addEventListener("click", applyInspectorRecord);
  element("duplicateRecord").addEventListener("click", duplicateSelectedRecord);
  element("deleteRecord").addEventListener("click", deleteSelectedRecord);

  element("saveRaster").addEventListener("click", () => void saveRasterDrafts());
  element("addArtLayer").addEventListener("click", () => element<HTMLDialogElement>("artLayerDialog").showModal());
  element("discardRaster").addEventListener("click", () => void reloadRasterDrafts());
  element("linkExternalImage").addEventListener("click", () => void linkExternalImage());
  element("assetSearch").addEventListener("input", renderAssetOptions);
  element("assetSelect").addEventListener("change", () => void selectStampAsset());
  for (const id of ["assetCropX", "assetCropY", "assetCropW", "assetCropH"]) {
    element(id).addEventListener("input", renderAssetPreview);
  }

  element("foregroundLayer").addEventListener("change", () => {
    selectedForegroundLayerId = element<HTMLSelectElement>("foregroundLayer").value;
    selectedForegroundComponentId = "";
    renderForegroundControls();
  });
  element("foregroundComponent").addEventListener("change", () => {
    selectedForegroundComponentId = element<HTMLSelectElement>("foregroundComponent").value;
    renderForegroundInspector();
  });
  element("applyForeground").addEventListener("click", applyForegroundInspector);
  element("bboxFromSelection").addEventListener("click", deriveForegroundBoundsFromSelection);
  element("addForegroundComponent").addEventListener("click", addForegroundComponent);
  element("deleteForegroundComponent").addEventListener("click", deleteForegroundComponent);
  element("transformRasterSelection").addEventListener("click", transformRasterSelection);

  element("addRepair").addEventListener("click", addRepairAnnotation);
  element<HTMLInputElement>("calibrationApproved").addEventListener("change", () => {
    if (!project) return;
    project.manifest.approval ||= {};
    project.manifest.approval.calibrationAreaApproved = element<HTMLInputElement>("calibrationApproved").checked;
    project.manifest.approval.approvedAt = element<HTMLInputElement>("calibrationApproved").checked
      ? new Date().toISOString()
      : null;
    setModelDirty("Calibration approval changed");
  });

  element("clearStatus").addEventListener("click", () => setStatus(""));
  element("cancelPublish").addEventListener("click", () => element<HTMLDialogElement>("publishDialog").close());
  element("confirmPublish").addEventListener("click", () => void confirmPublish());
  element("cancelNewProject").addEventListener("click", () => element<HTMLDialogElement>("newProjectDialog").close());
  element("confirmNewProject").addEventListener("click", () => void createNewProject());
  element("cancelArtLayer").addEventListener("click", () => element<HTMLDialogElement>("artLayerDialog").close());
  element("confirmArtLayer").addEventListener("click", () => void addRealArtLayer());

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("dblclick", doubleClick);
  canvas.addEventListener("wheel", wheel, { passive: false });
  assetPreview.addEventListener("click", assetPreviewClick);
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", keyboard);
  setInterval(() => {
    blinkPhase = blinkPhase === "day" ? "night" : "day";
  }, 650);

  const collectionSelect = element<HTMLSelectElement>("semanticCollection");
  for (const collection of SEMANTIC_COLLECTIONS) {
    const option = document.createElement("option");
    option.value = collection;
    option.textContent = COLLECTION_LABELS[collection];
    collectionSelect.append(option);
  }
  updateCompareVisibility();
}

async function createNewProject(): Promise<void> {
  const mapId = element<HTMLInputElement>("newMapId").value.trim();
  const displayName = element<HTMLInputElement>("newMapName").value.trim();
  const dayAsset = element<HTMLInputElement>("newDayAsset").value.trim();
  const nightAsset = element<HTMLInputElement>("newNightAsset").value.trim();
  const semanticPath = element<HTMLInputElement>("newSemanticPath").value.trim();
  if (!mapId || !displayName || !dayAsset || !nightAsset || !semanticPath) {
    setStatus("New map creation requires a map ID, display name, real Day/Night PNGs, and real semantic JSON.", true);
    return;
  }
  try {
    await jsonPost("/api/project/create", { mapId, displayName, dayAsset, nightAsset, semanticPath });
    const summaries = await listProjects();
    populateProjects(summaries);
    element<HTMLSelectElement>("projectSelect").value = mapId;
    element<HTMLDialogElement>("newProjectDialog").close();
    await loadSelectedProject();
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

async function addRealArtLayer(): Promise<void> {
  if (!project) return;
  const id = element<HTMLInputElement>("newLayerId").value.trim();
  const kind = element<HTMLSelectElement>("newLayerKind").value;
  const daySource = element<HTMLInputElement>("newLayerDay").value.trim();
  const nightSource = element<HTMLInputElement>("newLayerNight").value.trim();
  const zIndex = Number(element<HTMLInputElement>("newLayerZ").value);
  const occlusionOpacity = Number(element<HTMLInputElement>("newLayerOpacity").value);
  if (!id || !daySource || !Number.isFinite(zIndex)) {
    setStatus("Art layer ID, real Day PNG, and explicit z-index are required.", true);
    return;
  }
  try {
    await jsonPost("/api/project/layer", {
      mapId: project.manifest.mapId,
      id,
      kind,
      daySource,
      nightSource,
      zIndex,
      occlusionOpacity
    });
    element<HTMLDialogElement>("artLayerDialog").close();
    await loadSelectedProject();
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

async function loadSelectedProject(): Promise<void> {
  const mapId = element<HTMLSelectElement>("projectSelect").value;
  if (!mapId) return;
  if ((dirtyModel || dirtyRaster) && !confirm("Discard unsaved Map Studio draft changes and reload?")) return;
  try {
    setStatus(`Loading ${mapId} from active runtime authority…`);
    project = await loadProject(mapId);
    collision = compileCollisionPreview(project.semantic, 4);
    selectedRecord = null;
    selectedArtLayerId = "base";
    selectedForegroundLayerId = project.visuals[view.phase].foreground_layers[0]?.id || "";
    selectedForegroundComponentId = "";
    polygonDraft = [];
    rasterSelection = null;
    rasterPolygonDraft = [];
    rasterSelectionPolygon = null;
    luluPoint = defaultLuluPoint(project.semantic);
    dirtyModel = false;
    dirtyRaster = false;
    history.clear();
    rasterUndo = [];
    rasterRedo = [];
    await loadRasterLayers();
    renderAuditCategories();
    renderAllPanels();
    fitMap();
    setStatus(
      project.drift.length
        ? `Loaded ${project.manifest.displayName}. Runtime source drift blocks publication:\n${project.drift.map((entry) => entry.path).join("\n")}`
        : `Loaded ${project.manifest.displayName} from active runtime data.`
    );
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

function renderAuditCategories(): void {
  const select = element<HTMLSelectElement>("repairCategory");
  const previous = select.value;
  const categories = project?.audits.flatMap((audit) => audit.map_repair_categories || []) || [];
  if (!categories.length) return;
  select.replaceChildren();
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.label;
    option.title = category.status.join(", ");
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

async function loadRasterLayers(): Promise<void> {
  rasterLayers = new Map();
  if (!project) return;
  const jobs: Promise<void>[] = [];
  for (const phase of ["day", "night"] as const) {
    for (const layer of project.manifest.art[phase].layers) {
      jobs.push((async () => {
        const source = layer.sourcePath || layer.path;
        const image = await loadImage(source);
        if (
          image.naturalWidth !== project?.manifest.dimensions.widthPx ||
          image.naturalHeight !== project?.manifest.dimensions.heightPx
        ) {
          throw new Error(`${source} does not match full map dimensions.`);
        }
        const layerCanvas = document.createElement("canvas");
        layerCanvas.width = image.naturalWidth;
        layerCanvas.height = image.naturalHeight;
        const layerContext = requiredContext(layerCanvas);
        layerContext.imageSmoothingEnabled = false;
        layerContext.drawImage(image, 0, 0);
        rasterLayers.set(rasterKey(phase, layer.id), {
          key: rasterKey(phase, layer.id),
          phase,
          layer,
          image,
          canvas: layerCanvas,
          context: layerContext,
          dirty: false
        });
      })());
    }
  }
  await Promise.all(jobs);
}

function renderAllPanels(): void {
  renderRecordList();
  renderArtLayers();
  renderForegroundControls();
  renderRepairList();
  renderInspector();
  const isOverworld = project?.manifest.mapId === "overworld";
  element<HTMLElement>("calibrationPanel").hidden = !isOverworld;
  element<HTMLInputElement>("calibrationApproved").checked = Boolean(project?.manifest.approval?.calibrationAreaApproved);
  updateDirtyState();
}

function drawLoop(): void {
  draw();
  requestAnimationFrame(drawLoop);
}

function draw(): void {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.fillStyle = "#05080d";
  context.fillRect(0, 0, rect.width, rect.height);
  if (!project) return;

  context.save();
  context.translate(view.panX, view.panY);
  context.scale(view.zoom, view.zoom);
  context.imageSmoothingEnabled = false;
  drawComparedPhases();
  if (view.showCollision && collision) drawCollisionOverlay(collision);
  if (view.showSemantics) drawSemanticOverlay();
  if (view.showForegroundTriggers) drawForegroundTriggers();
  if (view.showRepairs) drawRepairAnnotations();
  drawDraftGeometry();
  drawSelectedRecord();
  drawRasterSelection();
  drawMapBoundary();
  context.restore();
  updateHud();
}

function drawComparedPhases(): void {
  if (!project) return;
  const width = project.manifest.dimensions.widthPx;
  const height = project.manifest.dimensions.heightPx;
  switch (view.compareMode) {
    case "single":
      drawRuntimePhase(view.phase);
      break;
    case "blink":
      drawRuntimePhase(blinkPhase);
      break;
    case "difference":
      drawRuntimePhase("day");
      context.save();
      context.globalCompositeOperation = "difference";
      drawRuntimePhase("night");
      context.restore();
      break;
    case "split": {
      const split = width * view.comparePosition;
      context.save();
      context.beginPath();
      context.rect(0, 0, split, height);
      context.clip();
      drawRuntimePhase("day");
      context.restore();
      context.save();
      context.beginPath();
      context.rect(split, 0, width - split, height);
      context.clip();
      drawRuntimePhase("night");
      context.restore();
      drawCompareLine(split, height);
      break;
    }
    case "wipe": {
      drawRuntimePhase("day");
      const wipe = width * view.comparePosition;
      context.save();
      context.beginPath();
      context.rect(wipe, 0, width - wipe, height);
      context.clip();
      drawRuntimePhase("night");
      context.restore();
      drawCompareLine(wipe, height);
      break;
    }
  }
}

function drawRuntimePhase(phase: Phase): void {
  if (!project) return;
  const art = project.manifest.art[phase].layers
    .filter((layer) => layer.visible !== false)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  for (const layer of art) {
    if (layer.kind === "foreground") continue;
    const raster = rasterLayers.get(rasterKey(phase, layer.id));
    if (raster) context.drawImage(raster.canvas, 0, 0);
  }
  if (view.showLulu && luluImage) drawLulu();
  if (!view.showLulu) return;
  const visual = project.visuals[phase];
  for (const layer of [...visual.foreground_layers].sort((a, b) => a.z_index - b.z_index)) {
    const raster = rasterLayers.get(rasterKey(phase, layer.id));
    if (!raster) continue;
    for (const component of layer.alpha_components) {
      if (!componentTriggerContains(component, luluPoint)) continue;
      const box = component.pixel_bbox;
      context.save();
      context.globalAlpha = layer.occlusion_opacity ?? 1;
      context.drawImage(raster.canvas, box.x, box.y, box.width, box.height, box.x, box.y, box.width, box.height);
      context.restore();
    }
  }
}

function drawLulu(): void {
  if (!luluImage) return;
  context.drawImage(luluImage, 0, 0, 96, 96, Math.round(luluPoint.x - 48), Math.round(luluPoint.y - 88), 96, 96);
  context.save();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 1 / view.zoom;
  context.beginPath();
  context.moveTo(luluPoint.x - 5, luluPoint.y);
  context.lineTo(luluPoint.x + 5, luluPoint.y);
  context.moveTo(luluPoint.x, luluPoint.y - 5);
  context.lineTo(luluPoint.x, luluPoint.y + 5);
  context.stroke();
  context.restore();
}

function drawCollisionOverlay(field: CollisionPreview): void {
  if (!project) return;
  context.save();
  context.globalAlpha = 0.22;
  const visible = visibleWorldBounds();
  const startX = clamp(Math.floor(visible.x / field.cellSize), 0, field.width);
  const startY = clamp(Math.floor(visible.y / field.cellSize), 0, field.height);
  const endX = clamp(Math.ceil((visible.x + visible.width) / field.cellSize), 0, field.width);
  const endY = clamp(Math.ceil((visible.y + visible.height) / field.cellSize), 0, field.height);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      context.fillStyle = field.cells[y * field.width + x] === 1 ? "#22c55e" : "#ef4444";
      context.fillRect(x * field.cellSize, y * field.cellSize, field.cellSize, field.cellSize);
    }
  }
  context.restore();
}

function drawSemanticOverlay(): void {
  if (!project) return;
  context.save();
  for (const collection of SEMANTIC_COLLECTIONS) {
    const records = project.semantic[collection] as SemanticRecord[];
    for (const record of records) drawRecordGeometry(record, COLLECTION_COLORS[collection], 0.17, false);
  }
  context.restore();
}

function drawForegroundTriggers(): void {
  if (!project) return;
  const visual = project.visuals[view.phase];
  context.save();
  context.lineWidth = 2 / view.zoom;
  context.setLineDash([8 / view.zoom, 5 / view.zoom]);
  for (const layer of visual.foreground_layers) {
    for (const component of layer.alpha_components) {
      context.strokeStyle = component.id === selectedForegroundComponentId && layer.id === selectedForegroundLayerId
        ? "#ffffff"
        : "#f97316";
      if (component.trigger_pixel_polygon) strokePolygon(component.trigger_pixel_polygon.points);
      else {
        const rect = component.trigger_pixel_rect || (component.trigger_tile_rect && {
          x: component.trigger_tile_rect.x * 32,
          y: component.trigger_tile_rect.y * 32,
          width: component.trigger_tile_rect.width * 32,
          height: component.trigger_tile_rect.height * 32
        });
        if (rect) context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
      context.strokeStyle = "#fde047";
      const box = component.pixel_bbox;
      context.strokeRect(box.x, box.y, box.width, box.height);
    }
  }
  context.restore();
}

function drawRepairAnnotations(): void {
  if (!project) return;
  context.save();
  context.lineWidth = 3 / view.zoom;
  context.setLineDash([10 / view.zoom, 6 / view.zoom]);
  for (const repair of project.manifest.repairAnnotations) {
    context.strokeStyle = repair.status === "approved" ? "#22c55e" : repair.status === "ready_for_review" ? "#38bdf8" : "#f43f5e";
    const geometry = repair.geometry;
    if ("width" in geometry) context.strokeRect(geometry.x, geometry.y, geometry.width, geometry.height);
    else if ("points" in geometry) strokePolygon(geometry.points);
    else {
      context.beginPath();
      context.arc(geometry.x, geometry.y, 10, 0, Math.PI * 2);
      context.stroke();
    }
  }
  context.restore();
}

function drawSelectedRecord(): void {
  const record = getSelectedRecord();
  if (!record) return;
  drawRecordGeometry(record, "#ffffff", 0.12, true);
}

function drawRecordGeometry(record: SemanticRecord, color: string, alpha: number, selected: boolean): void {
  context.save();
  context.fillStyle = color;
  context.strokeStyle = color;
  context.globalAlpha = alpha;
  context.lineWidth = (selected ? 3 : 1.5) / view.zoom;
  if (record.pixel_rect) {
    context.fillRect(record.pixel_rect.x, record.pixel_rect.y, record.pixel_rect.width, record.pixel_rect.height);
    context.globalAlpha = selected ? 1 : 0.65;
    context.strokeRect(record.pixel_rect.x, record.pixel_rect.y, record.pixel_rect.width, record.pixel_rect.height);
  } else if (record.pixel_polygon) {
    fillPolygon(record.pixel_polygon.points);
    context.globalAlpha = selected ? 1 : 0.65;
    strokePolygon(record.pixel_polygon.points);
    if (selected) {
      context.globalAlpha = 1;
      for (const point of record.pixel_polygon.points) {
        context.fillStyle = "#ffffff";
        context.fillRect(point.x - 4 / view.zoom, point.y - 4 / view.zoom, 8 / view.zoom, 8 / view.zoom);
      }
    }
  } else if (record.pixel_point) {
    context.globalAlpha = selected ? 1 : 0.85;
    context.beginPath();
    context.arc(record.pixel_point.x, record.pixel_point.y, selected ? 10 : 7, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#07111d";
    context.lineWidth = 2 / view.zoom;
    context.stroke();
  }
  context.restore();
}

function drawDraftGeometry(): void {
  if (polygonDraft.length || rasterPolygonDraft.length) {
    const points = polygonDraft.length ? polygonDraft : rasterPolygonDraft;
    context.save();
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#ffffff";
    context.lineWidth = 2 / view.zoom;
    context.beginPath();
    context.moveTo(points[0]?.x || 0, points[0]?.y || 0);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
    for (const point of points) {
      context.beginPath();
      context.arc(point.x, point.y, 4 / view.zoom, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
  if (pointer.previewRect) {
    context.save();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2 / view.zoom;
    context.setLineDash([6 / view.zoom, 4 / view.zoom]);
    context.strokeRect(pointer.previewRect.x, pointer.previewRect.y, pointer.previewRect.width, pointer.previewRect.height);
    context.restore();
  }
}

function drawRasterSelection(): void {
  if (!rasterSelection) return;
  context.save();
  context.strokeStyle = "#f8fafc";
  context.lineWidth = 1 / view.zoom;
  context.setLineDash([5 / view.zoom, 4 / view.zoom]);
  if (rasterSelectionPolygon) {
    strokePolygon(rasterSelectionPolygon);
  } else {
    context.strokeRect(rasterSelection.x, rasterSelection.y, rasterSelection.width, rasterSelection.height);
  }
  context.restore();
}

function drawMapBoundary(): void {
  if (!project) return;
  const { widthPx, heightPx } = project.manifest.dimensions;
  context.save();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2 / view.zoom;
  context.strokeRect(0, 0, widthPx, heightPx);
  if (view.showGrid && view.zoom >= 0.3) {
    context.strokeStyle = "rgb(255 255 255 / .23)";
    context.lineWidth = 1 / view.zoom;
    for (let x = 0; x <= widthPx; x += 32) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, heightPx);
      context.stroke();
    }
    for (let y = 0; y <= heightPx; y += 32) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(widthPx, y);
      context.stroke();
    }
  }
  context.restore();
}

function drawCompareLine(x: number, height: number): void {
  context.save();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2 / view.zoom;
  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, height);
  context.stroke();
  context.restore();
}

function pointerDown(event: PointerEvent): void {
  if (!project) return;
  canvas.setPointerCapture(event.pointerId);
  const world = eventToWorld(event);
  pointer = {
    down: true,
    pointerId: event.pointerId,
    button: event.button,
    startScreen: { x: event.clientX, y: event.clientY },
    lastScreen: { x: event.clientX, y: event.clientY },
    startWorld: world,
    lastWorld: world,
    previewRect: null,
    panning: event.button === 1 || event.shiftKey || tool === "pan",
    movingRecord: null,
    movingVertex: null,
    draggingLulu: false,
    collisionRecord: null
  };
  if (pointer.panning) return;
  if (view.showLulu && Math.hypot(world.x - luluPoint.x, world.y - luluPoint.y) < 32) {
    pointer.draggingLulu = true;
    return;
  }
  if (tool === "select") {
    const record = hitRecord(world);
    if (record) {
      selectRecord(activeCollection(), record.id);
      const vertexIndex = record.pixel_polygon?.points.findIndex(
        (point) => Math.hypot(point.x - world.x, point.y - world.y) <= 9 / view.zoom
      ) ?? -1;
      if (vertexIndex >= 0) {
        captureModelHistory("Move semantic polygon vertex");
        pointer.movingVertex = { record, index: vertexIndex };
      } else {
        captureModelHistory("Move semantic geometry");
        pointer.movingRecord = {
          record,
          original: structuredClone(record),
          start: world
        };
      }
    } else {
      selectedRecord = null;
      renderInspector();
      renderRecordList();
    }
    return;
  }
  if (tool === "polygon") {
    polygonDraft.push(snapPoint(world, view.snap));
    return;
  }
  if (tool === "raster-polygon") {
    rasterPolygonDraft.push(snapPoint(world, view.snap));
    return;
  }
  if (tool === "point") {
    createPointRecord(snapPoint(world, view.snap));
    return;
  }
  if (tool === "rect" || tool === "raster-select") {
    pointer.previewRect = normalizeRect(world, world);
    return;
  }
  if (tool === "collision-open" || tool === "collision-blocked") {
    beginCollisionStroke(world);
    return;
  }
  if (isRasterTool(tool)) {
    beginRasterAction(tool);
    applyRasterTool(world, event);
  }
}

function pointerMove(event: PointerEvent): void {
  const world = eventToWorld(event);
  updateCoordinateHud(world);
  if (!pointer.down || event.pointerId !== pointer.pointerId) return;
  if (pointer.panning) {
    view.panX += event.clientX - pointer.lastScreen.x;
    view.panY += event.clientY - pointer.lastScreen.y;
  } else if (pointer.draggingLulu) {
    luluPoint = clampPoint(world);
  } else if (pointer.movingVertex?.record.pixel_polygon) {
    pointer.movingVertex.record.pixel_polygon.points[pointer.movingVertex.index] =
      clampPoint(snapPoint(world, view.snap));
    setModelDirty("Semantic polygon vertex moved", false);
    renderInspector();
  } else if (pointer.movingRecord) {
    const delta = snapPoint({
      x: world.x - pointer.movingRecord.start.x,
      y: world.y - pointer.movingRecord.start.y
    }, view.snap);
    moveRecordFromOriginal(pointer.movingRecord.record, pointer.movingRecord.original, delta);
    normalizeRecordGeometry(pointer.movingRecord.record);
    setModelDirty("Semantic geometry moved", false);
    renderInspector();
  } else if (pointer.previewRect) {
    pointer.previewRect = normalizeRect(pointer.startWorld, snapPoint(world, view.snap));
  } else if (pointer.collisionRecord) {
    extendCollisionStroke(world);
  } else if (isRasterTool(tool)) {
    applyRasterTool(world, event);
  }
  pointer.lastScreen = { x: event.clientX, y: event.clientY };
  pointer.lastWorld = world;
}

function pointerUp(event: PointerEvent): void {
  if (!pointer.down || event.pointerId !== pointer.pointerId) return;
  if (tool === "rect" && pointer.previewRect && pointer.previewRect.width > 0 && pointer.previewRect.height > 0) {
    createRectRecord(pointer.previewRect);
  } else if (tool === "raster-select" && pointer.previewRect) {
    rasterSelection = clampRectToMap(pointer.previewRect);
    rasterSelectionPolygon = null;
  }
  if (pointer.collisionRecord) {
    normalizeRecordGeometry(pointer.collisionRecord);
    collision = project ? compileCollisionPreview(project.semantic, 4) : null;
    setModelDirty("Collision refined", false);
    renderRecordList();
  }
  if (pointer.movingVertex) {
    normalizeRecordGeometry(pointer.movingVertex.record);
    collision = project ? compileCollisionPreview(project.semantic, 4) : null;
    renderInspector();
  }
  finishRasterAction();
  pointer = emptyPointer();
}

function doubleClick(): void {
  if (tool === "polygon") finishPolygonRecord();
  if (tool === "raster-polygon") finishRasterPolygonSelection();
}

function wheel(event: WheelEvent): void {
  event.preventDefault();
  const bounds = canvas.getBoundingClientRect();
  const mouse = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  const before = { x: (mouse.x - view.panX) / view.zoom, y: (mouse.y - view.panY) / view.zoom };
  view.zoom = clamp(view.zoom * (event.deltaY < 0 ? 1.12 : 0.89), 0.04, 32);
  view.panX = mouse.x - before.x * view.zoom;
  view.panY = mouse.y - before.y * view.zoom;
}

function keyboard(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void saveAllDrafts();
  } else if (event.key === "Enter" && (tool === "polygon" || tool === "raster-polygon")) {
    if (tool === "polygon") finishPolygonRecord();
    else finishRasterPolygonSelection();
  } else if (event.key === "Escape") {
    polygonDraft = [];
    rasterPolygonDraft = [];
    pointer = emptyPointer();
  } else if ((event.key === "Delete" || event.key === "Backspace") && selectedRecord) {
    deleteSelectedRecord();
  }
}

function createRectRecord(rect: Rect): void {
  if (!project) return;
  const collection = activeCollection();
  if (collection === "spawns" || collection === "npc_spawn_markers") {
    setStatus(`${COLLECTION_LABELS[collection]} requires the Point tool.`, true);
    return;
  }
  captureModelHistory(`Add ${COLLECTION_LABELS[collection]} rectangle`);
  const record: SemanticRecord = {
    id: nextRecordId(collection),
    shape: "rect",
    pixel_rect: clampRectToMap(rect)
  };
  normalizeRecordGeometry(record);
  project.semantic[collection].push(record);
  selectedRecord = { collection, id: record.id };
  collision = compileCollisionPreview(project.semantic, 4);
  setModelDirty("Semantic rectangle added", false);
  renderRecordList();
  renderInspector();
}

function createPointRecord(point: Point): void {
  if (!project) return;
  const collection = activeCollection();
  if (collection !== "spawns" && collection !== "npc_spawn_markers") {
    setStatus("Point authoring is available for spawns and NPC anchors. Use a region tool for this collection.", true);
    return;
  }
  captureModelHistory(`Add ${COLLECTION_LABELS[collection]} point`);
  const record: SemanticRecord = {
    id: nextRecordId(collection),
    pixel_point: clampPoint(point),
    facing: "south"
  };
  normalizeRecordGeometry(record);
  project.semantic[collection].push(record);
  selectedRecord = { collection, id: record.id };
  setModelDirty("Semantic point added", false);
  renderRecordList();
  renderInspector();
}

function finishPolygonRecord(): void {
  if (!project || polygonDraft.length < 3) return;
  const collection = activeCollection();
  if (collection === "spawns" || collection === "npc_spawn_markers") {
    setStatus(`${COLLECTION_LABELS[collection]} requires the Point tool.`, true);
    polygonDraft = [];
    return;
  }
  captureModelHistory(`Add ${COLLECTION_LABELS[collection]} polygon`);
  const record: SemanticRecord = {
    id: nextRecordId(collection),
    shape: "polygon",
    pixel_polygon: { points: polygonDraft.map(clampPoint) }
  };
  project.semantic[collection].push(record);
  polygonDraft = [];
  selectedRecord = { collection, id: record.id };
  collision = compileCollisionPreview(project.semantic, 4);
  setModelDirty("Semantic polygon added", false);
  renderRecordList();
  renderInspector();
}

function finishRasterPolygonSelection(): void {
  if (rasterPolygonDraft.length < 3) return;
  rasterSelectionPolygon = rasterPolygonDraft.map(clampPoint);
  rasterSelection = polygonBounds(rasterSelectionPolygon);
  rasterPolygonDraft = [];
  setStatus("Raster polygon selection ready. Transforms preserve its authored polygon boundary.");
}

function beginCollisionStroke(point: Point): void {
  if (!project) return;
  const collection: SemanticCollection = tool === "collision-open" ? "passable_overrides" : "blocked_regions";
  captureModelHistory(tool === "collision-open" ? "Open collision" : "Block collision");
  const size = Math.max(4, Number(element<HTMLInputElement>("brushSize").value));
  const snapped = snapPoint(point, 4);
  const rect = clampRectToMap({
    x: snapped.x - size / 2,
    y: snapped.y - size / 2,
    width: size,
    height: size
  });
  const record: SemanticRecord = {
    id: nextRecordId(collection, tool === "collision-open" ? "collision_open" : "collision_blocked"),
    shape: "rect",
    pixel_rect: rect,
    purpose: "map_studio_collision_refinement"
  };
  project.semantic[collection].push(record);
  pointer.collisionRecord = record;
  selectedRecord = { collection, id: record.id };
}

function extendCollisionStroke(point: Point): void {
  const record = pointer.collisionRecord;
  if (!record?.pixel_rect) return;
  const size = Math.max(4, Number(element<HTMLInputElement>("brushSize").value));
  const snapped = snapPoint(point, 4);
  record.pixel_rect = unionRect(record.pixel_rect, {
    x: snapped.x - size / 2,
    y: snapped.y - size / 2,
    width: size,
    height: size
  });
  record.pixel_rect = clampRectToMap(record.pixel_rect);
}

function beginRasterAction(label: string): void {
  rasterAction = { label, patches: [] };
}

function applyRasterTool(point: Point, event: PointerEvent): void {
  const current = currentRasterLayer();
  if (!current || current.layer.locked) {
    setStatus(current ? `${current.layer.id} is locked.` : "Select a real art layer first.", true);
    return;
  }
  if (!pointInsideMap(point)) return;
  if (tool === "eyedropper") {
    const pixel = current.context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
    element<HTMLInputElement>("brushColor").value = rgbHex(pixel[0] || 0, pixel[1] || 0, pixel[2] || 0);
    element<HTMLInputElement>("brushAlpha").value = String((pixel[3] || 0) / 255);
    setStatus(`Sampled ${element<HTMLInputElement>("brushColor").value} at alpha ${element<HTMLInputElement>("brushAlpha").value}.`);
    return;
  }
  if (tool === "clone" && event.altKey) {
    cloneSource = { x: Math.floor(point.x), y: Math.floor(point.y) };
    setStatus(`Clone source set at ${cloneSource.x},${cloneSource.y}.`);
    return;
  }
  if (tool === "asset-stamp") {
    stampRealAsset(current, point);
    return;
  }
  if (tool === "mask-add" || tool === "mask-remove") {
    applyLinkedMaskBrush(current.layer.id, point, tool === "mask-add");
    return;
  }
  const size = Math.max(1, Number(element<HTMLInputElement>("brushSize").value));
  const bounds = clipPatchBounds({
    x: Math.floor(point.x - size / 2 - 2),
    y: Math.floor(point.y - size / 2 - 2),
    width: Math.ceil(size + 4),
    height: Math.ceil(size + 4)
  });
  if (!bounds) return;
  const before = current.context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  if (tool === "raster-brush") {
    current.context.save();
    current.context.globalAlpha = Number(element<HTMLInputElement>("brushAlpha").value);
    current.context.fillStyle = element<HTMLInputElement>("brushColor").value;
    current.context.beginPath();
    current.context.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    current.context.fill();
    current.context.restore();
  } else if (tool === "raster-eraser") {
    current.context.save();
    current.context.globalCompositeOperation = "destination-out";
    current.context.beginPath();
    current.context.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    current.context.fill();
    current.context.restore();
  } else if (tool === "clone") {
    if (!cloneSource) {
      setStatus("Alt-click a real source pixel before clone painting.", true);
      return;
    }
    const sourceX = cloneSource.x + (point.x - pointer.startWorld.x) - size / 2;
    const sourceY = cloneSource.y + (point.y - pointer.startWorld.y) - size / 2;
    const temporary = document.createElement("canvas");
    temporary.width = Math.ceil(size);
    temporary.height = Math.ceil(size);
    const tempContext = requiredContext(temporary);
    tempContext.drawImage(current.canvas, sourceX, sourceY, size, size, 0, 0, size, size);
    current.context.save();
    current.context.beginPath();
    current.context.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    current.context.clip();
    current.context.drawImage(temporary, point.x - size / 2, point.y - size / 2);
    current.context.restore();
  }
  const after = current.context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  appendRasterPatch(current, bounds, before, after);
}

function applyLinkedMaskBrush(layerId: string, point: Point, add: boolean): void {
  const size = Math.max(1, Number(element<HTMLInputElement>("brushSize").value));
  const alpha = clamp(Number(element<HTMLInputElement>("brushAlpha").value), 0, 1);
  for (const phase of ["day", "night"] as const) {
    const layer = rasterLayers.get(rasterKey(phase, layerId));
    if (!layer || layer.layer.kind !== "foreground") continue;
    const bounds = clipPatchBounds({
      x: Math.floor(point.x - size / 2),
      y: Math.floor(point.y - size / 2),
      width: Math.ceil(size),
      height: Math.ceil(size)
    });
    if (!bounds) continue;
    const before = layer.context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
    const edited = new ImageData(new Uint8ClampedArray(before.data), before.width, before.height);
    let blockedPixelCount = 0;
    for (let y = 0; y < bounds.height; y += 1) {
      for (let x = 0; x < bounds.width; x += 1) {
        const worldX = bounds.x + x;
        const worldY = bounds.y + y;
        if (Math.hypot(worldX - point.x, worldY - point.y) > size / 2) continue;
        const index = (y * bounds.width + x) * 4;
        if (add && edited.data[index] === 0 && edited.data[index + 1] === 0 && edited.data[index + 2] === 0) {
          blockedPixelCount += 1;
          continue;
        }
        const target = Math.round(alpha * 255);
        edited.data[index + 3] = add
          ? Math.max(edited.data[index + 3] || 0, target)
          : Math.min(edited.data[index + 3] || 0, 255 - target);
      }
    }
    if (blockedPixelCount > 0) {
      setStatus("Mask Add skipped transparent pixels with no real RGB artwork; paint or stamp real foreground pixels first.", true);
    }
    layer.context.putImageData(edited, bounds.x, bounds.y);
    const after = layer.context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
    appendRasterPatch(layer, bounds, before, after);
  }
}

function stampRealAsset(current: RasterLayerState, point: Point): void {
  if (!selectedAsset || !selectedAssetImage) {
    setStatus("Select a real project asset before stamping.", true);
    return;
  }
  const crop = assetCrop();
  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x + crop.width > selectedAssetImage.naturalWidth ||
    crop.y + crop.height > selectedAssetImage.naturalHeight
  ) {
    setStatus("Asset crop is outside the selected real image.", true);
    return;
  }
  const destination = clipPatchBounds({
    x: Math.round(point.x - crop.width / 2),
    y: Math.round(point.y - crop.height / 2),
    width: crop.width,
    height: crop.height
  });
  if (!destination) return;
  const before = current.context.getImageData(destination.x, destination.y, destination.width, destination.height);
  const sourceOffsetX = crop.x + (destination.x - Math.round(point.x - crop.width / 2));
  const sourceOffsetY = crop.y + (destination.y - Math.round(point.y - crop.height / 2));
  current.context.drawImage(
    selectedAssetImage,
    sourceOffsetX,
    sourceOffsetY,
    destination.width,
    destination.height,
    destination.x,
    destination.y,
    destination.width,
    destination.height
  );
  const after = current.context.getImageData(destination.x, destination.y, destination.width, destination.height);
  appendRasterPatch(current, destination, before, after);
}

function appendRasterPatch(
  layer: RasterLayerState,
  bounds: Rect,
  before: ImageData,
  after: ImageData
): void {
  if (!rasterAction) rasterAction = { label: tool, patches: [] };
  rasterAction.patches.push({ key: layer.key, bounds, before, after });
  layer.dirty = true;
  dirtyRaster = true;
  lastRasterEdit = Date.now();
  updateDirtyState();
}

function finishRasterAction(): void {
  if (!rasterAction?.patches.length) {
    rasterAction = null;
    return;
  }
  rasterUndo.push(rasterAction);
  if (rasterUndo.length > 80) rasterUndo.shift();
  rasterRedo = [];
  rasterAction = null;
}

function transformRasterSelection(): void {
  const layer = currentRasterLayer();
  if (!layer || !rasterSelection) {
    setStatus("Select a raster layer and a real pixel region first.", true);
    return;
  }
  if (layer.layer.locked) {
    setStatus(`${layer.layer.id} is locked.`, true);
    return;
  }
  const dx = Number(element<HTMLInputElement>("rasterDeltaX").value);
  const dy = Number(element<HTMLInputElement>("rasterDeltaY").value);
  const scaleX = Number(element<HTMLInputElement>("rasterScaleX").value);
  const scaleY = Number(element<HTMLInputElement>("rasterScaleY").value);
  if (![dx, dy, scaleX, scaleY].every(Number.isFinite) || scaleX <= 0 || scaleY <= 0) {
    setStatus("Raster transform values are invalid.", true);
    return;
  }
  const source = clampRectToMap(rasterSelection);
  const destination = clampRectToMap({
    x: source.x + dx,
    y: source.y + dy,
    width: source.width * scaleX,
    height: source.height * scaleY
  });
  const union = clipPatchBounds(unionRect(source, destination));
  if (!union) return;
  const before = layer.context.getImageData(union.x, union.y, union.width, union.height);
  const temporary = document.createElement("canvas");
  temporary.width = Math.max(1, Math.round(source.width));
  temporary.height = Math.max(1, Math.round(source.height));
  const tempContext = requiredContext(temporary);
  tempContext.imageSmoothingEnabled = false;
  const selectionPolygon = rasterSelectionPolygon;
  if (selectionPolygon) {
    tempContext.save();
    tempContext.beginPath();
    tempContext.moveTo(selectionPolygon[0]!.x - source.x, selectionPolygon[0]!.y - source.y);
    for (const point of selectionPolygon.slice(1)) tempContext.lineTo(point.x - source.x, point.y - source.y);
    tempContext.closePath();
    tempContext.clip();
    tempContext.drawImage(layer.canvas, -source.x, -source.y);
    tempContext.restore();
    layer.context.save();
    layer.context.globalCompositeOperation = "destination-out";
    layer.context.beginPath();
    layer.context.moveTo(selectionPolygon[0]!.x, selectionPolygon[0]!.y);
    for (const point of selectionPolygon.slice(1)) layer.context.lineTo(point.x, point.y);
    layer.context.closePath();
    layer.context.fill();
    layer.context.restore();
  } else {
    tempContext.drawImage(layer.canvas, source.x, source.y, source.width, source.height, 0, 0, temporary.width, temporary.height);
    layer.context.clearRect(source.x, source.y, source.width, source.height);
  }
  layer.context.imageSmoothingEnabled = false;
  layer.context.drawImage(temporary, destination.x, destination.y, destination.width, destination.height);
  const after = layer.context.getImageData(union.x, union.y, union.width, union.height);
  rasterAction = { label: "Move / transform raster selection", patches: [] };
  appendRasterPatch(layer, union, before, after);
  finishRasterAction();
  if (selectionPolygon) {
    rasterSelectionPolygon = selectionPolygon.map((point) => ({
      x: destination.x + ((point.x - source.x) / source.width) * destination.width,
      y: destination.y + ((point.y - source.y) / source.height) * destination.height
    }));
  }
  rasterSelection = destination;
}

function undo(): void {
  if (!project) return;
  if (lastRasterEdit >= lastModelEdit && rasterUndo.length) {
    const action = rasterUndo.pop();
    if (!action) return;
    for (const patch of [...action.patches].reverse()) {
      const layer = rasterLayers.get(patch.key);
      if (layer) layer.context.putImageData(patch.before, patch.bounds.x, patch.bounds.y);
    }
    rasterRedo.push(action);
    dirtyRaster = true;
    lastRasterEdit = Date.now();
    updateDirtyState();
    return;
  }
  const snapshot = history.undo(currentHistorySnapshot("undo"));
  if (snapshot) applyHistorySnapshot(snapshot);
}

function redo(): void {
  if (!project) return;
  if (lastRasterEdit >= lastModelEdit && rasterRedo.length) {
    const action = rasterRedo.pop();
    if (!action) return;
    for (const patch of action.patches) {
      const layer = rasterLayers.get(patch.key);
      if (layer) layer.context.putImageData(patch.after, patch.bounds.x, patch.bounds.y);
    }
    rasterUndo.push(action);
    dirtyRaster = true;
    lastRasterEdit = Date.now();
    updateDirtyState();
    return;
  }
  const snapshot = history.redo(currentHistorySnapshot("redo"));
  if (snapshot) applyHistorySnapshot(snapshot);
}

function captureModelHistory(label: string): void {
  if (!project) return;
  history.capture(
    label,
    project.semantic,
    project.visuals,
    project.manifest.repairAnnotations,
    project.manifest.art,
    project.manifest.approval
  );
  lastModelEdit = Date.now();
}

function currentHistorySnapshot(label: string): HistorySnapshot {
  if (!project) throw new Error("No project loaded.");
  return {
    label,
    semantic: structuredClone(project.semantic),
    visuals: structuredClone(project.visuals),
    repairs: structuredClone(project.manifest.repairAnnotations),
    art: structuredClone(project.manifest.art),
    approval: structuredClone(project.manifest.approval)
  };
}

function applyHistorySnapshot(snapshot: HistorySnapshot): void {
  if (!project) return;
  project.semantic = snapshot.semantic;
  project.visuals = snapshot.visuals;
  project.manifest.art = snapshot.art;
  project.manifest.repairAnnotations = snapshot.repairs;
  project.manifest.approval = snapshot.approval;
  for (const raster of rasterLayers.values()) {
    const restored = project.manifest.art[raster.phase].layers.find(
      (layer) => layer.id === raster.layer.id
    );
    if (restored) raster.layer = restored;
  }
  collision = compileCollisionPreview(project.semantic, 4);
  selectedRecord = null;
  setModelDirty(`History: ${snapshot.label}`, false);
  renderAllPanels();
}

async function saveAllDrafts(): Promise<void> {
  if (!project) return;
  try {
    if (dirtyRaster) await saveRasterDrafts();
    await jsonPost("/api/project/save", {
      mapId: project.manifest.mapId,
      semantic: project.semantic,
      visuals: project.visuals,
      art: project.manifest.art,
      repairAnnotations: project.manifest.repairAnnotations,
      approval: project.manifest.approval
    });
    dirtyModel = false;
    updateDirtyState();
    setStatus("Canonical map project saved. Active runtime files were not changed.");
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

async function saveRasterDrafts(): Promise<void> {
  if (!project) return;
  const dirty = [...rasterLayers.values()].filter((layer) => layer.dirty);
  if (!dirty.length) {
    setStatus("No raster draft changes to save.");
    return;
  }
  for (const layer of dirty) {
    const blob = await canvasBlob(layer.canvas);
    const saved = await api<{ ok: boolean; sourcePath: string; sha256: string }>(
      `/api/project/image?mapId=${encodeURIComponent(project.manifest.mapId)}&phase=${layer.phase}&layerId=${encodeURIComponent(layer.layer.id)}`,
      { method: "PUT", headers: { "Content-Type": "image/png" }, body: blob }
    );
    layer.layer.sourcePath = saved.sourcePath;
    layer.layer.editedSha256 = saved.sha256;
    layer.dirty = false;
  }
  dirtyRaster = false;
  updateDirtyState();
  setStatus(`Saved ${dirty.length} full-resolution raster draft${dirty.length === 1 ? "" : "s"} without publishing runtime assets.`);
}

async function reloadRasterDrafts(): Promise<void> {
  if (!project) return;
  if (dirtyRaster && !confirm("Discard unsaved raster edits?")) return;
  try {
    await loadRasterLayers();
    dirtyRaster = false;
    rasterUndo = [];
    rasterRedo = [];
    updateDirtyState();
    setStatus("Raster layers reloaded from real project sources.");
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

async function validateCurrentProject(): Promise<void> {
  if (!project) return;
  await saveAllDrafts();
  try {
    const result = await jsonPost<{ ok: boolean; errors: string[]; warnings: string[] }>("/api/project/validate", {
      mapId: project.manifest.mapId
    });
    setStatus(
      result.ok
        ? `Validation passed.${result.warnings.length ? `\nWarnings:\n${result.warnings.join("\n")}` : ""}`
        : `Validation failed:\n${result.errors.join("\n")}`,
      !result.ok
    );
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

async function stageCurrentProject(): Promise<unknown> {
  if (!project) return null;
  await saveAllDrafts();
  try {
    const report = await jsonPost<StageReport>("/api/project/stage", { mapId: project.manifest.mapId });
    setStatus(
      `Staged ${report.files.length} runtime files. Collision migration equivalent: ${String(report.collisionMigrationEquivalent)}.\n` +
      report.files.map((file) => file.path).join("\n")
    );
    return report;
  } catch (error) {
    setStatus(errorMessage(error), true);
    return null;
  }
}

async function preparePublish(): Promise<void> {
  const report = await stageCurrentProject() as StageReport | null;
  if (!report) return;
  element("publishSummary").textContent = [
    `Map: ${report.mapId}`,
    `Files: ${report.files.length}`,
    `Collision migration equivalent: ${String(report.collisionMigrationEquivalent)}`,
    "",
    ...report.files.map((file) => `${file.sha256.slice(0, 12)}  ${file.path}`)
  ].join("\n");
  element<HTMLDialogElement>("publishDialog").showModal();
}

async function confirmPublish(): Promise<void> {
  if (!project) return;
  element<HTMLDialogElement>("publishDialog").close();
  try {
    const result = await jsonPost<{
      ok: boolean;
      backupFolder: string;
      files: Array<{ path: string }>;
      collisionMigrationEquivalent: boolean | null;
    }>("/api/project/publish", { mapId: project.manifest.mapId });
    setStatus(
      `Published ${result.files.length} active runtime files atomically.\nBackup: ${result.backupFolder}\n` +
      `Collision migration equivalent: ${String(result.collisionMigrationEquivalent)}`
    );
    await loadSelectedProject();
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

async function linkExternalImage(): Promise<void> {
  if (!project) return;
  const path = element<HTMLInputElement>("externalImagePath").value.trim();
  if (!path) {
    setStatus("Enter a project-relative path to a real full-resolution PNG.", true);
    return;
  }
  try {
    await jsonPost("/api/project/image/link", {
      mapId: project.manifest.mapId,
      phase: view.phase,
      layerId: selectedArtLayerId,
      sourcePath: path
    });
    project = await loadProject(project.manifest.mapId);
    await loadRasterLayers();
    renderArtLayers();
    setStatus(`Linked ${path}. Runtime files remain unchanged until explicit publication.`);
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

function renderRecordList(): void {
  const container = element("recordList");
  container.replaceChildren();
  if (!project) return;
  const collection = activeCollection();
  const query = element<HTMLInputElement>("recordSearch").value.toLowerCase();
  for (const record of project.semantic[collection].filter((candidate) => candidate.id.toLowerCase().includes(query))) {
    const row = document.createElement("div");
    row.className = `record-row${selectedRecord?.collection === collection && selectedRecord.id === record.id ? " selected" : ""}`;
    row.innerHTML = `<span>${escapeHtml(record.id)}</span>`;
    row.addEventListener("click", () => selectRecord(collection, record.id));
    container.append(row);
  }
}

function renderArtLayers(): void {
  const container = element("artLayerList");
  container.replaceChildren();
  if (!project) return;
  for (const layer of project.manifest.art[view.phase].layers.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))) {
    const row = document.createElement("div");
    row.className = `layer-row${selectedArtLayerId === layer.id ? " selected" : ""}`;
    const visible = document.createElement("input");
    visible.type = "checkbox";
    visible.checked = layer.visible !== false;
    visible.title = "Visible";
    visible.addEventListener("change", (event) => {
      event.stopPropagation();
      captureModelHistory("Art layer visibility");
      layer.visible = visible.checked;
      setModelDirty("Art layer visibility changed", false);
    });
    const locked = document.createElement("input");
    locked.type = "checkbox";
    locked.checked = layer.locked;
    locked.title = "Locked";
    locked.addEventListener("change", (event) => {
      event.stopPropagation();
      captureModelHistory("Art layer lock");
      layer.locked = locked.checked;
      setModelDirty("Art layer lock changed", false);
    });
    const label = document.createElement("span");
    label.textContent = `${layer.id}${layer.sourcePath ? " *draft*" : ""}`;
    const kind = document.createElement("span");
    kind.className = "layer-kind";
    kind.textContent = layer.kind;
    row.append(visible, locked, label, kind);
    row.addEventListener("click", () => {
      selectedArtLayerId = layer.id;
      renderArtLayers();
    });
    container.append(row);
  }
}

function renderInspector(): void {
  const record = getSelectedRecord();
  element<HTMLInputElement>("recordId").value = record?.id || "";
  element<HTMLTextAreaElement>("recordJson").value = record ? JSON.stringify(record, null, 2) : "";
  const bounds = record ? recordBounds(record) : null;
  element<HTMLInputElement>("geometryX").value = bounds ? String(bounds.x) : "";
  element<HTMLInputElement>("geometryY").value = bounds ? String(bounds.y) : "";
  element<HTMLInputElement>("geometryW").value = bounds ? String(bounds.width) : "";
  element<HTMLInputElement>("geometryH").value = bounds ? String(bounds.height) : "";
  element("selectionHud").textContent = record
    ? `${selectedRecord?.collection}: ${record.id}`
    : rasterSelection
      ? `Raster selection ${Math.round(rasterSelection.width)}×${Math.round(rasterSelection.height)}`
      : "No selection";
}

function applyInspectorRecord(): void {
  if (!project || !selectedRecord) return;
  const records = project.semantic[selectedRecord.collection];
  const index = records.findIndex((record) => record.id === selectedRecord?.id);
  if (index < 0) return;
  try {
    const parsed = JSON.parse(element<HTMLTextAreaElement>("recordJson").value) as SemanticRecord;
    const newId = element<HTMLInputElement>("recordId").value.trim();
    if (!newId || !/^[a-zA-Z][a-zA-Z0-9_:.-]*$/.test(newId)) throw new Error("Record ID is invalid.");
    if (records.some((record, candidateIndex) => candidateIndex !== index && record.id === newId)) {
      throw new Error(`ID ${newId} already exists in ${selectedRecord.collection}.`);
    }
    parsed.id = newId;
    const x = Number(element<HTMLInputElement>("geometryX").value);
    const y = Number(element<HTMLInputElement>("geometryY").value);
    const width = Number(element<HTMLInputElement>("geometryW").value);
    const height = Number(element<HTMLInputElement>("geometryH").value);
    if (parsed.pixel_rect && [x, y, width, height].every(Number.isFinite)) {
      parsed.pixel_rect = clampRectToMap({ x, y, width, height });
    } else if (parsed.pixel_point && [x, y].every(Number.isFinite)) {
      parsed.pixel_point = clampPoint({ x, y });
    }
    normalizeRecordGeometry(parsed);
    captureModelHistory("Edit semantic record");
    records[index] = parsed;
    selectedRecord.id = parsed.id;
    collision = compileCollisionPreview(project.semantic, 4);
    setModelDirty("Semantic record applied", false);
    renderRecordList();
    renderInspector();
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

function duplicateSelectedRecord(): void {
  if (!project || !selectedRecord) return;
  const record = getSelectedRecord();
  if (!record) return;
  captureModelHistory("Duplicate semantic record");
  const duplicate = structuredClone(record);
  duplicate.id = nextRecordId(selectedRecord.collection, `${record.id}_copy`);
  moveRecordFromOriginal(duplicate, duplicate, { x: view.snap || 4, y: view.snap || 4 });
  normalizeRecordGeometry(duplicate);
  project.semantic[selectedRecord.collection].push(duplicate);
  selectedRecord.id = duplicate.id;
  collision = compileCollisionPreview(project.semantic, 4);
  setModelDirty("Semantic record duplicated", false);
  renderRecordList();
  renderInspector();
}

function deleteSelectedRecord(): void {
  if (!project || !selectedRecord) return;
  const collection = selectedRecord.collection;
  const record = getSelectedRecord();
  if (!record || !confirm(`Delete semantic record ${record.id} from the authoring project?`)) return;
  captureModelHistory("Delete semantic record");
  project.semantic[collection] = project.semantic[collection].filter((candidate) => candidate.id !== record.id) as never;
  selectedRecord = null;
  collision = compileCollisionPreview(project.semantic, 4);
  setModelDirty("Semantic record deleted", false);
  renderRecordList();
  renderInspector();
}

function renderForegroundControls(): void {
  const layerSelect = element<HTMLSelectElement>("foregroundLayer");
  const componentSelect = element<HTMLSelectElement>("foregroundComponent");
  layerSelect.replaceChildren();
  componentSelect.replaceChildren();
  if (!project) return;
  const layers = project.visuals[view.phase].foreground_layers;
  if (!layers.some((layer) => layer.id === selectedForegroundLayerId)) selectedForegroundLayerId = layers[0]?.id || "";
  for (const layer of layers) {
    const option = document.createElement("option");
    option.value = layer.id;
    option.textContent = layer.id;
    option.selected = layer.id === selectedForegroundLayerId;
    layerSelect.append(option);
  }
  const selectedLayer = layers.find((layer) => layer.id === selectedForegroundLayerId);
  if (!selectedLayer?.alpha_components.some((component) => component.id === selectedForegroundComponentId)) {
    selectedForegroundComponentId = selectedLayer?.alpha_components[0]?.id || "";
  }
  for (const component of selectedLayer?.alpha_components || []) {
    const option = document.createElement("option");
    option.value = component.id;
    option.textContent = component.id;
    option.selected = component.id === selectedForegroundComponentId;
    componentSelect.append(option);
  }
  renderForegroundInspector();
}

function renderForegroundInspector(): void {
  const layer = getSelectedForegroundLayer();
  const component = getSelectedForegroundComponent();
  element<HTMLInputElement>("foregroundOpacity").value = layer ? String(layer.occlusion_opacity ?? 1) : "";
  element<HTMLTextAreaElement>("foregroundJson").value = component ? JSON.stringify(component, null, 2) : "";
}

function applyForegroundInspector(): void {
  if (!project) return;
  const dayLayer = project.visuals.day.foreground_layers.find((layer) => layer.id === selectedForegroundLayerId);
  const nightLayer = project.visuals.night.foreground_layers.find((layer) => layer.id === selectedForegroundLayerId);
  if (!dayLayer || !nightLayer) {
    setStatus("The selected foreground is not present in both Day and Night.", true);
    return;
  }
  try {
    const parsed = JSON.parse(element<HTMLTextAreaElement>("foregroundJson").value) as AlphaComponent;
    const existing = dayLayer.alpha_components.find((component) => component.id === selectedForegroundComponentId);
    if (!existing) throw new Error(`Foreground component ${selectedForegroundComponentId} is missing.`);
    if (!parsed.id || (!parsed.trigger_pixel_rect && !parsed.trigger_pixel_polygon && !parsed.trigger_tile_rect)) {
      throw new Error("Foreground component requires an id and authored trigger geometry.");
    }
    parsed.pixel_bbox = structuredClone(existing.pixel_bbox);
    parsed.area_px = existing.area_px;
    const opacity = Number(element<HTMLInputElement>("foregroundOpacity").value);
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error("Occlusion opacity must be 0–1.");
    captureModelHistory("Edit foreground component");
    for (const layer of [dayLayer, nightLayer]) {
      const index = layer.alpha_components.findIndex((component) => component.id === selectedForegroundComponentId);
      if (index < 0) throw new Error(`${layer.id} is missing component ${selectedForegroundComponentId}.`);
      layer.alpha_components[index] = structuredClone(parsed);
      layer.occlusion_opacity = opacity;
    }
    selectedForegroundComponentId = parsed.id;
    setModelDirty("Foreground component synchronized across Day/Night", false);
    renderForegroundControls();
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

function deriveForegroundBoundsFromSelection(): void {
  if (!project || !rasterSelection) {
    setStatus("Create a raster selection around the real foreground component first.", true);
    return;
  }
  const component = getSelectedForegroundComponent();
  const dayRaster = rasterLayers.get(rasterKey("day", selectedForegroundLayerId));
  const nightRaster = rasterLayers.get(rasterKey("night", selectedForegroundLayerId));
  if (!component || !dayRaster || !nightRaster) {
    setStatus("Select a foreground component and its real foreground art layer.", true);
    return;
  }
  try {
    const selection = integerSelection(rasterSelection);
    const dayBounds = alphaBounds(dayRaster, selection);
    const nightBounds = alphaBounds(nightRaster, selection);
    if (JSON.stringify(dayBounds) !== JSON.stringify(nightBounds)) {
      throw new Error("Day/Night foreground alpha differs in this selection. Shared alpha must be repaired before bounds can be derived.");
    }
    captureModelHistory("Derive foreground component bounds");
    for (const phase of ["day", "night"] as const) {
      const layer = project.visuals[phase].foreground_layers.find((candidate) => candidate.id === selectedForegroundLayerId);
      const linked = layer?.alpha_components.find((candidate) => candidate.id === selectedForegroundComponentId);
      if (linked) {
        linked.pixel_bbox = structuredClone(dayBounds.box);
        linked.area_px = dayBounds.area;
      }
    }
    setModelDirty("Foreground pixel bounds derived from shared Day/Night alpha", false);
    renderForegroundInspector();
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

function addForegroundComponent(): void {
  if (!project || !rasterSelection) {
    setStatus("Add requires a raster selection around real shared-alpha foreground pixels.", true);
    return;
  }
  const dayLayer = project.visuals.day.foreground_layers.find((layer) => layer.id === selectedForegroundLayerId);
  const nightLayer = project.visuals.night.foreground_layers.find((layer) => layer.id === selectedForegroundLayerId);
  const dayRaster = rasterLayers.get(rasterKey("day", selectedForegroundLayerId));
  const nightRaster = rasterLayers.get(rasterKey("night", selectedForegroundLayerId));
  if (!dayLayer || !nightLayer || !dayRaster || !nightRaster) {
    setStatus("The selected real foreground layer must exist in both Day and Night.", true);
    return;
  }
  try {
    const parsed = JSON.parse(element<HTMLTextAreaElement>("foregroundJson").value) as AlphaComponent;
    if (!parsed.id || (!parsed.trigger_pixel_rect && !parsed.trigger_pixel_polygon && !parsed.trigger_tile_rect)) {
      throw new Error("Enter a unique component id and explicit trigger geometry before adding.");
    }
    if ([...dayLayer.alpha_components, ...nightLayer.alpha_components].some((component) => component.id === parsed.id)) {
      throw new Error(`Foreground component id ${parsed.id} already exists.`);
    }
    const selection = integerSelection(rasterSelection);
    const dayBounds = alphaBounds(dayRaster, selection);
    const nightBounds = alphaBounds(nightRaster, selection);
    if (JSON.stringify(dayBounds) !== JSON.stringify(nightBounds)) {
      throw new Error("Day/Night alpha differs in this selection. Component creation requires shared real alpha.");
    }
    parsed.pixel_bbox = structuredClone(dayBounds.box);
    parsed.area_px = dayBounds.area;
    captureModelHistory("Add foreground component");
    dayLayer.alpha_components.push(structuredClone(parsed));
    nightLayer.alpha_components.push(structuredClone(parsed));
    selectedForegroundComponentId = parsed.id;
    setModelDirty("Foreground component added from real shared-alpha pixels", false);
    renderForegroundControls();
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

function deleteForegroundComponent(): void {
  if (!project || !selectedForegroundComponentId) return;
  if (!confirm(`Delete foreground component ${selectedForegroundComponentId} from both Day and Night authoring data?`)) return;
  captureModelHistory("Delete foreground component");
  for (const phase of ["day", "night"] as const) {
    const layer = project.visuals[phase].foreground_layers.find((candidate) => candidate.id === selectedForegroundLayerId);
    if (layer) {
      layer.alpha_components = layer.alpha_components.filter(
        (component) => component.id !== selectedForegroundComponentId
      );
    }
  }
  selectedForegroundComponentId = "";
  setModelDirty("Foreground component deleted from Day/Night", false);
  renderForegroundControls();
}

function alphaBounds(layer: RasterLayerState, selection: Rect): { box: Rect; area: number } {
  const image = layer.context.getImageData(selection.x, selection.y, selection.width, selection.height);
  let minimumX = image.width;
  let minimumY = image.height;
  let maximumX = -1;
  let maximumY = -1;
  let area = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if ((image.data[(y * image.width + x) * 4 + 3] || 0) === 0) continue;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
      area += 1;
    }
  }
  if (area === 0) {
    throw new Error("The selection contains no real nontransparent foreground pixels.");
  }
  return {
    box: {
      x: selection.x + minimumX,
      y: selection.y + minimumY,
      width: maximumX - minimumX + 1,
      height: maximumY - minimumY + 1
    },
    area
  };
}

function addRepairAnnotation(): void {
  if (!project) return;
  const record = getSelectedRecord();
  const geometry = rasterSelection || (record && (record.pixel_rect || record.pixel_polygon || record.pixel_point));
  if (!geometry) {
    setStatus("Select actual map geometry or a raster area before adding a repair annotation.", true);
    return;
  }
  captureModelHistory("Add repair annotation");
  const annotation: RepairAnnotation = {
    id: nextRepairId(),
    category: element<HTMLSelectElement>("repairCategory").value,
    status: element<HTMLSelectElement>("repairStatus").value as RepairAnnotation["status"],
    geometry: structuredClone(geometry),
    notes: element<HTMLTextAreaElement>("repairNotes").value.trim()
  };
  project.manifest.repairAnnotations.push(annotation);
  setModelDirty("Repair annotation added", false);
  renderRepairList();
}

function renderRepairList(): void {
  const container = element("repairList");
  container.replaceChildren();
  if (!project) return;
  for (const repair of project.manifest.repairAnnotations) {
    const row = document.createElement("div");
    row.className = "record-row";
    row.innerHTML = `<span>${escapeHtml(repair.id)} · ${escapeHtml(repair.category)} · ${escapeHtml(repair.status)}</span>`;
    row.title = repair.notes;
    row.addEventListener("click", () => {
      const geometry = repair.geometry;
      if ("width" in geometry) rasterSelection = structuredClone(geometry);
      element<HTMLSelectElement>("repairCategory").value = repair.category;
      element<HTMLSelectElement>("repairStatus").value = repair.status;
      element<HTMLTextAreaElement>("repairNotes").value = repair.notes;
    });
    container.append(row);
  }
}

function renderAssetOptions(): void {
  const select = element<HTMLSelectElement>("assetSelect");
  const query = element<HTMLInputElement>("assetSearch").value.toLowerCase();
  const previous = select.value;
  select.replaceChildren();
  for (const asset of assets.filter((candidate) => candidate.path.toLowerCase().includes(query)).slice(0, 1000)) {
    const option = document.createElement("option");
    option.value = asset.path;
    option.textContent = `${asset.name} — ${asset.folder}`;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  if (!selectedAsset && select.value) void selectStampAsset();
}

async function selectStampAsset(): Promise<void> {
  const path = element<HTMLSelectElement>("assetSelect").value;
  selectedAsset = assets.find((asset) => asset.path === path) || null;
  selectedAssetImage = null;
  if (!selectedAsset) {
    renderAssetPreview();
    return;
  }
  try {
    selectedAssetImage = await loadImage(selectedAsset.path);
    element<HTMLInputElement>("assetCropW").value = String(Math.min(32, selectedAssetImage.naturalWidth));
    element<HTMLInputElement>("assetCropH").value = String(Math.min(32, selectedAssetImage.naturalHeight));
    renderAssetPreview();
  } catch (error) {
    setStatus(errorMessage(error), true);
  }
}

function renderAssetPreview(): void {
  assetPreviewContext.clearRect(0, 0, assetPreview.width, assetPreview.height);
  assetPreviewContext.fillStyle = "#05080d";
  assetPreviewContext.fillRect(0, 0, assetPreview.width, assetPreview.height);
  if (!selectedAsset || !selectedAssetImage) {
    element("assetInfo").textContent = "No real asset selected.";
    return;
  }
  const crop = assetCrop();
  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x + crop.width > selectedAssetImage.naturalWidth ||
    crop.y + crop.height > selectedAssetImage.naturalHeight
  ) {
    element("assetInfo").textContent = "Crop is outside the real asset.";
    return;
  }
  const scale = Math.min(assetPreview.width / crop.width, assetPreview.height / crop.height);
  const width = crop.width * scale;
  const height = crop.height * scale;
  assetPreviewContext.imageSmoothingEnabled = false;
  assetPreviewContext.drawImage(
    selectedAssetImage,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    (assetPreview.width - width) / 2,
    (assetPreview.height - height) / 2,
    width,
    height
  );
  element("assetInfo").textContent = `${selectedAsset.path} · ${selectedAssetImage.naturalWidth}×${selectedAssetImage.naturalHeight} · crop ${crop.x},${crop.y},${crop.width}×${crop.height}`;
}

function assetPreviewClick(event: MouseEvent): void {
  if (!selectedAssetImage) return;
  const rect = assetPreview.getBoundingClientRect();
  const crop = assetCrop();
  const scale = Math.min(assetPreview.width / crop.width, assetPreview.height / crop.height);
  const displayWidth = crop.width * scale;
  const displayHeight = crop.height * scale;
  const x = (event.clientX - rect.left) * (assetPreview.width / rect.width);
  const y = (event.clientY - rect.top) * (assetPreview.height / rect.height);
  if (
    x < (assetPreview.width - displayWidth) / 2 ||
    y < (assetPreview.height - displayHeight) / 2 ||
    x > (assetPreview.width + displayWidth) / 2 ||
    y > (assetPreview.height + displayHeight) / 2
  ) return;
  setTool("asset-stamp");
}

function setTool(next: ToolMode): void {
  tool = next;
  polygonDraft = [];
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.classList.toggle("active", button.dataset.tool === tool);
  }
  canvas.style.cursor = tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";
  setStatus(`Tool: ${tool}.`);
}

function selectRecord(collection: SemanticCollection, id: string): void {
  selectedRecord = { collection, id };
  element<HTMLSelectElement>("semanticCollection").value = collection;
  renderRecordList();
  renderInspector();
}

function getSelectedRecord(): SemanticRecord | null {
  if (!project || !selectedRecord) return null;
  return project.semantic[selectedRecord.collection].find((record) => record.id === selectedRecord?.id) || null;
}

function hitRecord(point: Point): SemanticRecord | null {
  if (!project) return null;
  const records = project.semantic[activeCollection()];
  return [...records].reverse().find((record) => recordContains(record, point)) || null;
}

function getSelectedForegroundLayer(): ForegroundLayer | null {
  return project?.visuals[view.phase].foreground_layers.find((layer) => layer.id === selectedForegroundLayerId) || null;
}

function getSelectedForegroundComponent(): AlphaComponent | null {
  return getSelectedForegroundLayer()?.alpha_components.find((component) => component.id === selectedForegroundComponentId) || null;
}

function currentRasterLayer(): RasterLayerState | null {
  return rasterLayers.get(rasterKey(view.phase, selectedArtLayerId)) || null;
}

function activeCollection(): SemanticCollection {
  return element<HTMLSelectElement>("semanticCollection").value as SemanticCollection;
}

function nextRecordId(collection: SemanticCollection, prefix?: string): string {
  const records = project?.semantic[collection] || [];
  const base = (prefix || collection.replace(/_regions$|s$/g, "")).replace(/[^a-z0-9_:-]+/gi, "_");
  let number = 1;
  let candidate = `${base}_${String(number).padStart(2, "0")}`;
  const allIds = new Set(SEMANTIC_COLLECTIONS.flatMap((key) => project?.semantic[key].map((record) => record.id) || []));
  while (allIds.has(candidate)) {
    number += 1;
    candidate = `${base}_${String(number).padStart(2, "0")}`;
  }
  return candidate;
}

function nextRepairId(): string {
  const ids = new Set(project?.manifest.repairAnnotations.map((repair) => repair.id) || []);
  let number = 1;
  let candidate = `repair_${String(number).padStart(3, "0")}`;
  while (ids.has(candidate)) {
    number += 1;
    candidate = `repair_${String(number).padStart(3, "0")}`;
  }
  return candidate;
}

function moveRecordFromOriginal(record: SemanticRecord, original: SemanticRecord, delta: Point): void {
  if (original.pixel_rect) record.pixel_rect = { ...original.pixel_rect, x: original.pixel_rect.x + delta.x, y: original.pixel_rect.y + delta.y };
  if (original.pixel_point) record.pixel_point = { x: original.pixel_point.x + delta.x, y: original.pixel_point.y + delta.y };
  if (original.pixel_polygon) {
    record.pixel_polygon = {
      points: original.pixel_polygon.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }))
    };
  }
}

function updateHud(): void {
  element("zoomHud").textContent = `${Math.round(view.zoom * 100)}%`;
  element<HTMLButtonElement>("undoButton").disabled = !history.canUndo && rasterUndo.length === 0;
  element<HTMLButtonElement>("redoButton").disabled = !history.canRedo && rasterRedo.length === 0;
}

function updateCoordinateHud(point: Point): void {
  element("coordinateHud").textContent =
    `px ${Math.round(point.x)},${Math.round(point.y)} · tile ${(point.x / 32).toFixed(2)},${(point.y / 32).toFixed(2)}`;
}

function updateDirtyState(): void {
  const dirty = dirtyModel || dirtyRaster;
  const text = element("dirtyText");
  text.textContent = dirty
    ? `${dirtyModel ? "Project" : ""}${dirtyModel && dirtyRaster ? " + " : ""}${dirtyRaster ? "Raster" : ""} unsaved`
    : "Clean";
  text.classList.toggle("dirty", dirty);
}

function setModelDirty(message: string, capture = true): void {
  if (capture) captureModelHistory(message);
  dirtyModel = true;
  lastModelEdit = Date.now();
  updateDirtyState();
  setStatus(message);
}

function setStatus(message: string, error = false): void {
  const status = element("statusText");
  status.textContent = message;
  status.style.color = error ? "#fecaca" : "";
  window.clearTimeout(statusTimer);
  if (message && !error) {
    statusTimer = window.setTimeout(() => {
      status.style.color = "";
    }, 4500);
  }
}

function populateProjects(summaries: Awaited<ReturnType<typeof listProjects>>): void {
  const select = element<HTMLSelectElement>("projectSelect");
  select.replaceChildren();
  for (const summary of summaries) {
    const option = document.createElement("option");
    option.value = summary.mapId;
    option.textContent = summary.error
      ? `${summary.mapId} — ERROR`
      : `${summary.displayName}${summary.sourceDrift?.length ? " — SOURCE DRIFT" : ""}`;
    option.disabled = Boolean(summary.error);
    select.append(option);
  }
}

async function loadRealLulu(): Promise<void> {
  try {
    luluImage = await loadImage("public/assets/characters/lulu/sheets/Lulu_idle.png");
    if (luluImage.naturalWidth < 96 || luluImage.naturalHeight < 96) throw new Error("Real Lulu idle sheet is invalid.");
  } catch (error) {
    view.showLulu = false;
    element<HTMLInputElement>("showLulu").checked = false;
    setStatus(`Real Lulu preview unavailable: ${errorMessage(error)}`, true);
  }
}

function defaultLuluPoint(semantic: SemanticMap): Point {
  const spawn = semantic.spawns.find((record) => record.id.includes("default")) || semantic.spawns[0];
  return spawn?.pixel_point ? structuredClone(spawn.pixel_point) : { x: 32, y: 32 };
}

function updateCompareVisibility(): void {
  element<HTMLElement>("comparePositionLabel").hidden = view.compareMode !== "split" && view.compareMode !== "wipe";
}

function fitMap(): void {
  if (!project) return;
  const bounds = canvas.getBoundingClientRect();
  const margin = 28;
  view.zoom = Math.min(
    (bounds.width - margin * 2) / project.manifest.dimensions.widthPx,
    (bounds.height - margin * 2) / project.manifest.dimensions.heightPx
  );
  view.panX = (bounds.width - project.manifest.dimensions.widthPx * view.zoom) / 2;
  view.panY = (bounds.height - project.manifest.dimensions.heightPx * view.zoom) / 2;
}

function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function eventToWorld(event: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - view.panX) / view.zoom,
    y: (event.clientY - rect.top - view.panY) / view.zoom
  };
}

function visibleWorldBounds(): Rect {
  const rect = canvas.getBoundingClientRect();
  return {
    x: -view.panX / view.zoom,
    y: -view.panY / view.zoom,
    width: rect.width / view.zoom,
    height: rect.height / view.zoom
  };
}

function clampPoint(point: Point): Point {
  if (!project) return point;
  return {
    x: clamp(point.x, 0, project.manifest.dimensions.widthPx),
    y: clamp(point.y, 0, project.manifest.dimensions.heightPx)
  };
}

function clampRectToMap(rect: Rect): Rect {
  if (!project) return rect;
  const x = clamp(Math.round(rect.x), 0, project.manifest.dimensions.widthPx);
  const y = clamp(Math.round(rect.y), 0, project.manifest.dimensions.heightPx);
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(rect.width), project.manifest.dimensions.widthPx - x)),
    height: Math.max(1, Math.min(Math.round(rect.height), project.manifest.dimensions.heightPx - y))
  };
}

function clipPatchBounds(rect: Rect): Rect | null {
  if (!project) return null;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(project.manifest.dimensions.widthPx, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(project.manifest.dimensions.heightPx, Math.ceil(rect.y + rect.height));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function pointInsideMap(point: Point): boolean {
  return Boolean(
    project &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < project.manifest.dimensions.widthPx &&
    point.y < project.manifest.dimensions.heightPx
  );
}

function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

function integerSelection(rect: Rect): Rect {
  const clamped = clampRectToMap(rect);
  const x = Math.floor(clamped.x);
  const y = Math.floor(clamped.y);
  const right = Math.ceil(clamped.x + clamped.width);
  const bottom = Math.ceil(clamped.y + clamped.height);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function polygonBounds(points: Point[]): Rect {
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const x = Math.min(...xValues);
  const y = Math.min(...yValues);
  return clampRectToMap({
    x,
    y,
    width: Math.max(...xValues) - x,
    height: Math.max(...yValues) - y
  });
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

function fillPolygon(points: Point[]): void {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0]?.x || 0, points[0]?.y || 0);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
  context.fill();
}

function strokePolygon(points: Point[]): void {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0]?.x || 0, points[0]?.y || 0);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
  context.stroke();
}

function rasterKey(phase: Phase, layerId: string): string {
  return `${phase}:${layerId}`;
}

function isRasterTool(value: ToolMode): boolean {
  return [
    "raster-brush",
    "raster-eraser",
    "eyedropper",
    "clone",
    "asset-stamp",
    "mask-add",
    "mask-remove"
  ].includes(value);
}

function assetCrop(): Rect {
  return {
    x: Number(element<HTMLInputElement>("assetCropX").value),
    y: Number(element<HTMLInputElement>("assetCropY").value),
    width: Number(element<HTMLInputElement>("assetCropW").value),
    height: Number(element<HTMLInputElement>("assetCropH").value)
  };
}

function canvasBlob(source: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    source.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Browser could not encode the edited PNG.")), "image/png");
  });
}

function emptyPointer(): PointerState {
  return {
    down: false,
    pointerId: -1,
    button: 0,
    startScreen: { x: 0, y: 0 },
    lastScreen: { x: 0, y: 0 },
    startWorld: { x: 0, y: 0 },
    lastWorld: { x: 0, y: 0 },
    previewRect: null,
    panning: false,
    movingRecord: null,
    movingVertex: null,
    draggingLulu: false,
    collisionRecord: null
  };
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Map Studio UI is missing #${id}.`);
  return value as T;
}

function requiredContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = target.getContext("2d", { willReadFrequently: true });
  if (!value) throw new Error("Canvas2D is required by Lulu's Tale Map Studio.");
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rgbHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

type PointerState = {
  down: boolean;
  pointerId: number;
  button: number;
  startScreen: Point;
  lastScreen: Point;
  startWorld: Point;
  lastWorld: Point;
  previewRect: Rect | null;
  panning: boolean;
  movingRecord: {
    record: SemanticRecord;
    original: SemanticRecord;
    start: Point;
  } | null;
  movingVertex: {
    record: SemanticRecord;
    index: number;
  } | null;
  draggingLulu: boolean;
  collisionRecord: SemanticRecord | null;
};

type RasterPatch = {
  key: string;
  bounds: Rect;
  before: ImageData;
  after: ImageData;
};

type RasterAction = {
  label: string;
  patches: RasterPatch[];
};

type StageReport = {
  mapId: string;
  files: Array<{ path: string; sha256: string }>;
  collisionMigrationEquivalent: boolean | null;
};
