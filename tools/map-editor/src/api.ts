import type { AssetInfo, LoadedProject, ProjectSummary } from "./types.js";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, options);
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
  }
  if (!response.ok) {
    const message = typeof body === "object" && body && "error" in body
      ? String((body as { error: unknown }).error)
      : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return body as T;
}

export function jsonPost<T>(path: string, payload: unknown): Promise<T> {
  return api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const result = await api<{ projects: ProjectSummary[] }>("/api/projects");
  return result.projects;
}

export function loadProject(mapId: string): Promise<LoadedProject> {
  return api<LoadedProject>(`/api/project?mapId=${encodeURIComponent(mapId)}`);
}

export async function listAssets(): Promise<AssetInfo[]> {
  const result = await api<{ assets: AssetInfo[] }>("/api/assets");
  return result.assets;
}

export function assetHref(path: string): string {
  return `/api/asset?path=${encodeURIComponent(path)}`;
}

export function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load real project image ${path}.`));
    image.src = assetHref(path);
  });
}
