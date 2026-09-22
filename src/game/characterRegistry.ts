import {
  validateRuntimeCharacterManifest,
  type CharacterIndexContract,
  type RuntimeCharacterActionContract,
  type RuntimeCharacterManifestContract
} from "./characterContract";

export type LoadedCharacterAction = RuntimeCharacterActionContract & {
  image: HTMLImageElement;
};

export type LoadedCharacter = {
  manifest: RuntimeCharacterManifestContract;
  actions: Map<string, LoadedCharacterAction>;
};

export type CharacterRegistry = {
  index: CharacterIndexContract;
  characters: Map<string, LoadedCharacter>;
};

let registryPromise: Promise<CharacterRegistry> | undefined;

export function loadCharacterRegistry(): Promise<CharacterRegistry> {
  registryPromise ??= loadRegistry();
  return registryPromise;
}

export function requireCharacter(registry: CharacterRegistry, characterId: string): LoadedCharacter {
  const character = registry.characters.get(characterId);
  if (!character) throw new Error(`Runtime-ready character ${characterId} is not registered.`);
  return character;
}

async function loadRegistry(): Promise<CharacterRegistry> {
  const index = await fetchJson<CharacterIndexContract>("/assets/characters/INDEX.json");
  if (index.schema !== "lulus-character-index" || index.version !== 1) {
    throw new Error("Unsupported character runtime index.");
  }
  const entries = index.characters.filter((entry) => entry.status === "runtime_ready");
  const manifests = await Promise.all(
    entries.map(async (entry) => {
      const manifest = await fetchJson<RuntimeCharacterManifestContract>(entry.manifest);
      const errors = validateRuntimeCharacterManifest(manifest);
      if (errors.length > 0) {
        throw new Error(`Invalid runtime character ${entry.id}: ${errors.join(" ")}`);
      }
      if (manifest.id !== entry.id) throw new Error(`Character index id ${entry.id} does not match ${manifest.id}.`);
      return manifest;
    })
  );

  const imagePromises = new Map<string, Promise<HTMLImageElement>>();
  const imageFor = (href: string): Promise<HTMLImageElement> => {
    const existing = imagePromises.get(href);
    if (existing) return existing;
    const loading = loadImage(href);
    imagePromises.set(href, loading);
    return loading;
  };

  const characters = new Map<string, LoadedCharacter>();
  await Promise.all(
    manifests.map(async (manifest) => {
      const actions = new Map<string, LoadedCharacterAction>();
      await Promise.all(
        Object.entries(manifest.actions).map(async ([actionId, action]) => {
          actions.set(actionId, { ...action, image: await imageFor(action.sheet) });
        })
      );
      characters.set(manifest.id, { manifest, actions });
    })
  );
  return { index, characters };
}

async function fetchJson<T>(href: string): Promise<T> {
  const response = await fetch(href);
  if (!response.ok) throw new Error(`Unable to load ${href}: ${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

function loadImage(href: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load authoritative character asset ${href}.`));
    image.src = href;
  });
}
