import { createHash, randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { PROJECT_ROOT } from "./config.mjs";

export function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

export function assertProjectRelative(input) {
  const normalized = normalizeRelativePath(input);
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || isAbsolute(normalized)) {
    throw new Error("Expected a project-relative path.");
  }
  const fullPath = resolve(PROJECT_ROOT, normalized);
  const rel = relative(PROJECT_ROOT, fullPath);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("Path escapes the Lulu's Tale project.");
  }
  return rel.replace(/\\/g, "/");
}

export function projectPath(input) {
  return join(PROJECT_ROOT, assertProjectRelative(input));
}

export async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJsonAtomic(path, value) {
  await writeBufferAtomic(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

export async function writeBufferAtomic(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${randomUUID()}.${extname(path) || "tmp"}`);
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function hashFile(path) {
  return sha256(await readFile(path));
}

export async function readPngDimensions(path) {
  const handle = await open(path, "r");
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (
      bytesRead < 24 ||
      header[0] !== 0x89 ||
      header.toString("ascii", 1, 4) !== "PNG" ||
      header.toString("ascii", 12, 16) !== "IHDR"
    ) {
      throw new Error(`${relative(PROJECT_ROOT, path)} is not a valid PNG.`);
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally {
    await handle.close();
  }
}

export async function hashPngAlpha(path) {
  const alpha = await sharp(path)
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer();
  return sha256(alpha);
}

export async function copyFileEnsured(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

export async function listImageFiles(root, options = {}) {
  const results = [];
  const allowed = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  const skipped = new Set(options.skipDirectories || [".git", "node_modules", "dist", "staging", "backups"]);
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!skipped.has(entry.name)) await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !allowed.has(extname(entry.name).toLowerCase())) continue;
      const relativePath = relative(PROJECT_ROOT, fullPath).replace(/\\/g, "/");
      if (relativePath.includes("/references/not_runtime_ready/")) continue;
      const dimensions = extname(entry.name).toLowerCase() === ".png"
        ? await readPngDimensions(fullPath).catch(() => null)
        : null;
      const info = await stat(fullPath);
      results.push({
        path: relativePath,
        name: entry.name,
        folder: dirname(relativePath).replace(/\\/g, "/"),
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        bytes: info.size
      });
    }
  }
  await walk(root);
  return results.sort((a, b) => assetPriority(a.path) - assetPriority(b.path) || a.path.localeCompare(b.path));
}

export function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function rollbackFiles(entries) {
  for (const entry of [...entries].reverse()) {
    if (entry.backup && await exists(entry.backup)) {
      await copyFileEnsured(entry.backup, entry.target);
    } else if (!entry.existed) {
      await rm(entry.target, { force: true });
    }
  }
}

function assetPriority(path) {
  if (path.startsWith("public/assets/maps/native/")) return 0;
  if (path.startsWith("public/assets/maps/")) return 1;
  if (path.startsWith("public/assets/city/")) return 2;
  if (path.startsWith("public/assets/top-down-retro-interior/")) return 3;
  if (path.startsWith("public/assets/modern-interiors/")) return 4;
  if (path.startsWith("public/assets/")) return 10;
  if (path.startsWith("map-projects/")) return 20;
  return 50;
}
