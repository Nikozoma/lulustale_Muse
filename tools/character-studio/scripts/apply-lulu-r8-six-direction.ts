import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCharacterStudioServer } from "../server";
import type { CharacterProjectV1, StageReport } from "../src/types";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const CANDIDATE_PATH = path.join(
  PROJECT_ROOT,
  "character-production",
  "projects",
  "lulu",
  "derived",
  "canonical-anime-r8-six-direction-down-run-repair",
  "project-r8.candidate.json"
);

type ApiResult = {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
};

async function post<T extends ApiResult>(
  baseUrl: string,
  route: string,
  body: object
): Promise<T> {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = (await response.json()) as T;
  if (!response.ok || !result.ok) {
    throw new Error(result.error ?? `${route} failed with HTTP ${response.status}.`);
  }
  return result;
}

async function get<T extends ApiResult>(
  baseUrl: string,
  route: string
): Promise<T> {
  const response = await fetch(`${baseUrl}${route}`);
  const result = (await response.json()) as T;
  if (!response.ok || !result.ok) {
    throw new Error(result.error ?? `${route} failed with HTTP ${response.status}.`);
  }
  return result;
}

async function main(): Promise<void> {
  const candidate = JSON.parse(
    await readFile(CANDIDATE_PATH, "utf8")
  ) as CharacterProjectV1;
  if (
    candidate.id !== "lulu" ||
    candidate.production.revision !== 8 ||
    candidate.actions.run.directions.includes("Left") ||
    candidate.actions.run.directions.includes("Right")
  ) {
    throw new Error("The revision-8 candidate does not match the approved six-direction correction scope.");
  }

  const service = await createCharacterStudioServer(0);
  try {
    const loaded = await get<ApiResult & { project: CharacterProjectV1 }>(
      service.url,
      "/api/project?id=lulu"
    );
    const alreadySaved =
      loaded.project.production.revision === 8 &&
      loaded.project.actions.run.directions.join(",") ===
        candidate.actions.run.directions.join(",") &&
      loaded.project.sources.some(
        (source) =>
          source.id === "lulu_r8_run_six_direction_sheet" &&
          source.approval === "approved"
      );
    const saved = alreadySaved
      ? {
          ok: true as const,
          project: loaded.project,
          backup: null
        }
      : await post<
      ApiResult & {
        project: CharacterProjectV1;
        backup: { directory: string } | null;
      }
    >(service.url, "/api/project/save", { project: candidate });
    if (saved.project.production.revision !== 8) {
      throw new Error(`Character Studio saved unexpected revision ${saved.project.production.revision}.`);
    }

    const validated = await post<
      ApiResult & {
        validation: { ok: boolean; errors: string[]; warnings: string[] };
      }
    >(service.url, "/api/project/validate", { projectId: "lulu" });
    if (!validated.validation.ok) {
      throw new Error(validated.validation.errors.join("\n"));
    }

    const staged = await post<ApiResult & { report: StageReport }>(
      service.url,
      "/api/export/stage",
      { projectId: "lulu" }
    );
    const published = await post<
      ApiResult & {
        published: string[];
        backup: { directory: string } | null;
      }
    >(service.url, "/api/export/publish", {
      stageId: staged.report.stageId
    });

    console.log(
      JSON.stringify(
        {
          revision: saved.project.production.revision,
          projectBackup: saved.backup?.directory ?? null,
          stageId: staged.report.stageId,
          changed: staged.report.files
            .filter((file) => file.change !== "unchanged")
            .map((file) => file.publishPath),
          runtimeBackup: published.backup?.directory ?? null,
          published: published.published
        },
        null,
        2
      )
    );
  } finally {
    await service.close();
  }
}

await main();
