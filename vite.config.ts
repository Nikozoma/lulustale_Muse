import { readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const DARK_GAME_THEME = "#11100f";
const PROJECT_ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_ROOT = resolve(PROJECT_ROOT, "public");

type MapRegistry = {
  maps: Record<string, { semantic: string; collision: string; day: string; night: string }>;
};

type MapVisual = {
  base_layer: { asset: string };
  detail_layers?: Array<{ asset: string }>;
  foreground_layers: Array<{ asset: string }>;
};

type CharacterIndex = {
  characters: Array<{ status: string; manifest: string }>;
};

type CharacterManifest = {
  actions: Record<string, { sheet: string }>;
  portraits?: Array<{ image: string }>;
};

function readPublicJson<T>(publicRelativePath: string): T {
  return JSON.parse(readFileSync(resolve(PUBLIC_ROOT, publicRelativePath), "utf8")) as T;
}

function publicRelative(fullPath: string): string {
  const path = relative(PUBLIC_ROOT, fullPath).replace(/\\/g, "/");
  if (!path || path === ".." || path.startsWith("../")) {
    throw new Error(`Active PWA dependency is outside public/: ${fullPath}`);
  }
  statSync(fullPath);
  return path;
}

function hrefToPublicRelative(href: string): string {
  return publicRelative(resolve(PUBLIC_ROOT, href.replace(/^\/+/, "")));
}

function collectActiveRuntimeAssets(): string[] {
  const assets = new Set<string>([
    "assets/ui/lulus-tale-title-screen.png",
    "assets/ui/lifecycle/portrait-gate.jpg",
    "assets/ui/lifecycle/fullscreen-entry.jpg",
    "assets/ui/lifecycle/exit-goodbye.jpg",
    "assets/top-down-retro-interior/TopDownHouse_SmallItems.png",
    "assets/characters/brutus/INTERACTIONS.json",
    "pwa/lulus-tale-192.png",
    "pwa/lulus-tale-512.png",
    "pwa/lulus-tale-maskable-192.png",
    "pwa/lulus-tale-maskable-512.png"
  ]);

  const mapRegistryPath = "data/maps/visual_companion_config.json";
  assets.add(mapRegistryPath);
  const mapRegistry = readPublicJson<MapRegistry>(mapRegistryPath);
  for (const entry of Object.values(mapRegistry.maps)) {
    for (const descriptor of [entry.semantic, entry.collision, entry.day, entry.night]) {
      assets.add(publicRelative(resolve(PUBLIC_ROOT, "data/maps", descriptor)));
    }
    for (const visualPath of [entry.day, entry.night]) {
      const visualRelative = publicRelative(resolve(PUBLIC_ROOT, "data/maps", visualPath));
      const visual = readPublicJson<MapVisual>(visualRelative);
      const layers = [
        visual.base_layer,
        ...(visual.detail_layers ?? []),
        ...visual.foreground_layers
      ];
      for (const layer of layers) {
        assets.add(hrefToPublicRelative(`/assets/maps/native/${layer.asset.replace(/^production\//, "")}`));
      }
    }
  }

  const characterIndexPath = "assets/characters/INDEX.json";
  assets.add(characterIndexPath);
  const characterIndex = readPublicJson<CharacterIndex>(characterIndexPath);
  for (const entry of characterIndex.characters.filter((candidate) => candidate.status === "runtime_ready")) {
    const manifestPath = hrefToPublicRelative(entry.manifest);
    assets.add(manifestPath);
    const manifest = readPublicJson<CharacterManifest>(manifestPath);
    for (const action of Object.values(manifest.actions)) assets.add(hrefToPublicRelative(action.sheet));
    for (const portrait of manifest.portraits ?? []) assets.add(hrefToPublicRelative(portrait.image));
  }

  return [...assets].sort();
}

const ACTIVE_RUNTIME_ASSETS = collectActiveRuntimeAssets();
const ACTIVE_RUNTIME_MAX_BYTES =
  Math.max(...ACTIVE_RUNTIME_ASSETS.map((path) => statSync(resolve(PUBLIC_ROOT, path)).size)) + 1024;

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ACTIVE_RUNTIME_ASSETS,
      manifest: {
        name: "Lulu’s Tale",
        short_name: "Lulu’s Tale",
        start_url: "/",
        scope: "/",
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
        orientation: "any",
        theme_color: DARK_GAME_THEME,
        background_color: DARK_GAME_THEME,
        icons: [
          {
            src: "/pwa/lulus-tale-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa/lulus-tale-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa/lulus-tale-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/pwa/lulus-tale-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css}"],
        maximumFileSizeToCacheInBytes: ACTIVE_RUNTIME_MAX_BYTES,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "index.html"
      }
    })
  ]
});
