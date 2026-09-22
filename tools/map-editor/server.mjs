import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { extname, join, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import {
  DEFAULT_PORT,
  EDITOR_ROOT,
  EDITOR_VERSION,
  MAX_IMAGE_BODY_BYTES,
  MAX_JSON_BODY_BYTES,
  MIME_TYPES,
  PROJECT_ROOT
} from "./server/config.mjs";
import { listImageFiles } from "./server/fs-utils.mjs";
import {
  addProjectArtLayer,
  createProject,
  importActiveProject,
  linkExternalProjectImage,
  listProjects,
  loadProject,
  publishProject,
  readProjectAsset,
  saveProject,
  saveProjectImage,
  stageProject,
  validateProject
} from "./server/projects.mjs";

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url);
      if (!handled) sendJson(response, 404, { error: "Unknown Map Studio API route." });
      return;
    }
    await serveStatic(response, url);
  } catch (error) {
    sendJson(response, error?.code === "ENOENT" ? 404 : 500, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(DEFAULT_PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${DEFAULT_PORT}`;
  console.log("================================================");
  console.log(`Lulu's Tale Map Studio ${EDITOR_VERSION}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Editor URL:   ${url}`);
  console.log("Runtime publication is explicit and transactional.");
  console.log("Close this window to stop the editor.");
  console.log("================================================");
  openBrowser(url);
});

server.on("error", (error) => {
  console.error("Could not start Lulu's Tale Map Studio:", error.message);
  console.error("Try another port with: set LULUS_MAP_EDITOR_PORT=5190");
  process.exit(1);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      version: EDITOR_VERSION,
      projectRoot: PROJECT_ROOT,
      runtimeAuthority: "RUNTIME_AUTHORITY_MANIFEST.json"
    });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/projects") {
    sendJson(response, 200, { projects: await listProjects() });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/project") {
    sendJson(response, 200, await loadProject(requiredQuery(url, "mapId")));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/project/import") {
    const body = await readJsonBody(request);
    sendJson(response, 200, { ok: true, manifest: await importActiveProject(body.mapId) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/project/create") {
    const body = await readJsonBody(request);
    sendJson(response, 200, { ok: true, manifest: await createProject(body) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/project/layer") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await addProjectArtLayer(body.mapId, body));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/project/save") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await saveProject(body.mapId, body));
    return true;
  }
  if (request.method === "PUT" && url.pathname === "/api/project/image") {
    const bytes = await readBody(request, MAX_IMAGE_BODY_BYTES);
    sendJson(
      response,
      200,
      await saveProjectImage(
        requiredQuery(url, "mapId"),
        requiredQuery(url, "phase"),
        requiredQuery(url, "layerId"),
        bytes
      )
    );
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/project/image/link") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await linkExternalProjectImage(body.mapId, body.phase, body.layerId, body.sourcePath));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/project/validate") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await validateProject(body.mapId));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/project/stage") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await stageProject(body.mapId));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/project/publish") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await publishProject(body.mapId));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/assets") {
    const [publicAssets, projectAssets] = await Promise.all([
      listImageFiles(join(PROJECT_ROOT, "public", "assets")),
      listImageFiles(join(PROJECT_ROOT, "map-projects")).catch(() => [])
    ]);
    sendJson(response, 200, { assets: [...publicAssets, ...projectAssets] });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/asset") {
    const asset = await readProjectAsset(requiredQuery(url, "path"));
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[asset.extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(asset.bytes);
    return true;
  }
  return false;
}

async function serveStatic(response, url) {
  let requested = decodeURIComponent(url.pathname);
  if (requested === "/") requested = "/index.html";
  const allowedRoots = [
    EDITOR_ROOT,
    join(EDITOR_ROOT, "dist"),
    join(EDITOR_ROOT, "src"),
    join(EDITOR_ROOT, "schema")
  ];
  const fullPath = resolve(EDITOR_ROOT, `.${requested}`);
  if (!allowedRoots.some((root) => fullPath === root || fullPath.startsWith(`${root}\\`) || fullPath.startsWith(`${root}/`))) {
    sendText(response, 403, "Forbidden");
    return;
  }
  const info = await stat(fullPath);
  if (!info.isFile()) throw new Error("Static path is not a file.");
  const extension = extname(fullPath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  response.end(await readFile(fullPath));
}

async function readJsonBody(request) {
  const bytes = await readBody(request, MAX_JSON_BODY_BYTES);
  if (!bytes.length) return {};
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Request body is not valid JSON.");
  }
}

async function readBody(request, maximumBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error(`Request body exceeds ${Math.round(maximumBytes / 1024 / 1024)}MB.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function requiredQuery(url, name) {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`Missing query parameter ${name}.`);
  return value;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(text);
}

function openBrowser(url) {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}
