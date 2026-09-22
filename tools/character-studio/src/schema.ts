import Ajv from "ajv";
import { DIRECTION_ORDER, type CharacterProjectV1, type ValidationResult } from "./types";

const pointSchema = {
  type: "object",
  required: ["x", "y"],
  additionalProperties: false,
  properties: {
    x: { type: "number" },
    y: { type: "number" }
  }
} as const;

const projectSchema = {
  type: "object",
  required: [
    "schema",
    "version",
    "id",
    "displayName",
    "characterClass",
    "identity",
    "production",
    "presentation",
    "collisionProfileId",
    "sources",
    "actions",
    "portraits",
    "runtime",
    "updatedAt"
  ],
  additionalProperties: false,
  properties: {
    schema: { const: "lulus-character-project" },
    version: { const: 1 },
    id: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]*$" },
    displayName: { type: "string", minLength: 1 },
    characterClass: { enum: ["humanoid", "canine", "bird", "animal", "custom"] },
    species: { type: "string" },
    identity: {
      type: "object",
      required: ["canonicalApproval", "locked", "notes", "paletteReferences"],
      additionalProperties: false,
      properties: {
        canonicalApproval: { enum: ["unapproved", "approved"] },
        locked: { type: "boolean" },
        notes: { type: "array", items: { type: "string" } },
        paletteReferences: { type: "array", items: { type: "string" } }
      }
    },
    production: {
      type: "object",
      required: ["status", "revision", "warnings"],
      additionalProperties: false,
      properties: {
        status: { enum: ["reference_only", "in_production", "runtime_ready", "deprecated"] },
        revision: { type: "integer", minimum: 1 },
        parentProjectId: { type: "string" },
        templateId: { type: "string" },
        deprecationTarget: { type: "string" },
        warnings: { type: "array", items: { type: "string" } }
      }
    },
    presentation: {
      type: "object",
      required: ["nativeCell", "renderScales", "resampling"],
      additionalProperties: false,
      properties: {
        nativeCell: {
          type: "object",
          required: ["width", "height"],
          additionalProperties: false,
          properties: {
            width: { type: "integer", minimum: 1 },
            height: { type: "integer", minimum: 1 }
          }
        },
        targetSilhouette: {
          type: "object",
          required: ["width", "height"],
          additionalProperties: false,
          properties: {
            width: { type: "integer", minimum: 1 },
            height: { type: "integer", minimum: 1 }
          }
        },
        renderScales: {
          type: "object",
          additionalProperties: { type: "number", exclusiveMinimum: 0 }
        },
        resampling: { enum: ["none", "nearest", "approved_custom"] }
      }
    },
    collisionProfileId: { type: "string", minLength: 1 },
    sources: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "role", "path", "sha256", "immutable", "approval"],
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          role: { enum: ["reference", "canonical", "sheet", "frame", "portrait", "metadata"] },
          path: { type: "string" },
          sha256: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
          immutable: { const: true },
          approval: { enum: ["unreviewed", "approved", "rejected"] },
          notes: { type: "string" },
          missing: { type: "boolean" }
        }
      }
    },
    actions: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: [
          "id",
          "displayName",
          "category",
          "playback",
          "directionMode",
          "directions",
          "cell",
          "loop",
          "entryFrame",
          "stopPolicy",
          "tracks"
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          displayName: { type: "string" },
          category: { enum: ["idle", "locomotion", "interaction", "transition", "battle", "reaction", "custom"] },
          playback: { enum: ["loop", "once", "hold", "transition"] },
          directionMode: { enum: ["eight", "explicit", "single"] },
          directions: { type: "array", minItems: 1, uniqueItems: true, items: { enum: [...DIRECTION_ORDER] } },
          cell: {
            type: "object",
            required: ["width", "height"],
            additionalProperties: false,
            properties: {
              width: { type: "integer", minimum: 1 },
              height: { type: "integer", minimum: 1 }
            }
          },
          loop: {
            type: "object",
            required: ["start", "end"],
            additionalProperties: false,
            properties: {
              start: { type: "integer", minimum: 0 },
              end: { type: "integer", minimum: 0 }
            }
          },
          entryFrame: { type: "integer", minimum: 0 },
          stopPolicy: { enum: ["idle_entry", "finish_to_contact", "transition"] },
          transitionActionId: { type: "string" },
          cycleDistancePx: { type: "number", exclusiveMinimum: 0 },
          runtimeSheet: { type: "string" },
          runtimeHref: { type: "string" },
          tracks: {
            type: "object",
            additionalProperties: {
              type: "object",
              required: ["direction", "frames"],
              additionalProperties: false,
              properties: {
                direction: { enum: [...DIRECTION_ORDER] },
                frames: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    required: [
                      "id",
                      "imagePath",
                      "crop",
                      "durationMs",
                      "root",
                      "visualOffset",
                      "grounded",
                      "anchors",
                      "events"
                    ],
                    additionalProperties: false,
                    properties: {
                      id: { type: "string" },
                      imagePath: { type: "string" },
                      crop: {
                        type: "object",
                        required: ["x", "y", "width", "height"],
                        additionalProperties: false,
                        properties: {
                          x: { type: "number", minimum: 0 },
                          y: { type: "number", minimum: 0 },
                          width: { type: "number", exclusiveMinimum: 0 },
                          height: { type: "number", exclusiveMinimum: 0 }
                        }
                      },
                      durationMs: { type: "number", exclusiveMinimum: 0 },
                      root: pointSchema,
                      visualOffset: pointSchema,
                      bodyBounds: {
                        type: "object",
                        required: ["x", "y", "width", "height"],
                        additionalProperties: false,
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" },
                          width: { type: "number", minimum: 0 },
                          height: { type: "number", minimum: 0 }
                        }
                      },
                      grounded: { type: "boolean" },
                      contact: { enum: ["left", "right", "both", "none"] },
                      anchors: { type: "array" },
                      events: { type: "array" },
                      sourceFrame: { type: "object" },
                      mirrorSource: { type: "object" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    portraits: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "expression", "imagePath", "crop", "alphaRequired", "status"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]*$" },
          expression: { type: "string", minLength: 1 },
          imagePath: { type: "string", minLength: 1 },
          crop: {
            type: "object",
            required: ["x", "y", "width", "height"],
            additionalProperties: false,
            properties: {
              x: { type: "integer", minimum: 0 },
              y: { type: "integer", minimum: 0 },
              width: { type: "integer", minimum: 1 },
              height: { type: "integer", minimum: 1 }
            }
          },
          alphaRequired: { type: "boolean" },
          status: { enum: ["reference_only", "in_production", "runtime_ready", "deprecated"] }
        }
      }
    },
    runtime: {
      type: "object",
      required: ["manifestPath", "generatedAssetDirectory"],
      additionalProperties: false,
      properties: {
        manifestPath: { type: "string" },
        generatedAssetDirectory: { type: "string" },
        legacyPackage: { type: "string" }
      }
    },
    updatedAt: { type: "string" }
  }
} as const;

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validateProjectSchema = ajv.compile(projectSchema);

export function validateCharacterProject(project: CharacterProjectV1): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!validateProjectSchema(project)) {
    errors.push(...(validateProjectSchema.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`));
  }

  const sourcePaths = new Set(project.sources.map((source) => source.path));
  const sourceIds = new Set<string>();
  for (const source of project.sources) {
    if (sourceIds.has(source.id)) errors.push(`Duplicate source id: ${source.id}.`);
    sourceIds.add(source.id);
    if (source.missing) warnings.push(`Source is unavailable: ${source.path}.`);
    if (source.missing && source.sha256 === null) warnings.push(`Source checksum is unavailable: ${source.path}.`);
    if (!source.missing && source.sha256 === null) errors.push(`Available source has no checksum: ${source.path}.`);
  }

  for (const [actionId, action] of Object.entries(project.actions)) {
    if (action.id !== actionId) errors.push(`Action key ${actionId} does not match id ${action.id}.`);
    if (action.directionMode === "eight" && action.directions.length !== DIRECTION_ORDER.length) {
      errors.push(`${actionId} declares eight-direction mode but does not contain eight directions.`);
    }
    if (action.stopPolicy === "transition" && !action.transitionActionId) {
      errors.push(`${actionId} requires a transitionActionId.`);
    }
    if (action.category === "locomotion" && !action.cycleDistancePx) {
      errors.push(`${actionId} locomotion requires cycleDistancePx.`);
    }
    const frameCounts = new Set<number>();
    for (const direction of action.directions) {
      const track = action.tracks[direction];
      if (!track) {
        errors.push(`${actionId} is missing authored direction ${direction}.`);
        continue;
      }
      if (track.direction !== direction) errors.push(`${actionId}/${direction} track label does not match its key.`);
      frameCounts.add(track.frames.length);
      for (const frame of track.frames) {
        if (!sourcePaths.has(frame.imagePath)) {
          warnings.push(`${actionId}/${direction}/${frame.id} uses ${frame.imagePath}, which is not listed in project sources.`);
        }
        if (frame.root.x < 0 || frame.root.y < 0 || frame.root.x > action.cell.width || frame.root.y > action.cell.height) {
          errors.push(`${actionId}/${direction}/${frame.id} root is outside the action cell.`);
        }
      }
    }
    if (frameCounts.size > 1) errors.push(`${actionId} directions have unequal frame counts and cannot use directional-grid export.`);
    const frameCount = frameCounts.values().next().value as number | undefined;
    if (frameCount !== undefined) {
      if (action.loop.start > action.loop.end || action.loop.end >= frameCount) errors.push(`${actionId} loop range is invalid.`);
      if (action.entryFrame >= frameCount) errors.push(`${actionId} entryFrame is outside the track.`);
    }
  }

  const portraitIds = new Set<string>();
  for (const portrait of project.portraits) {
    if (portraitIds.has(portrait.id)) errors.push(`Duplicate portrait id: ${portrait.id}.`);
    portraitIds.add(portrait.id);
  }
  for (const portrait of project.portraits.filter((candidate) => candidate.status === "runtime_ready")) {
    const source = project.sources.find((candidate) => candidate.path === portrait.imagePath);
    if (!source) errors.push(`Runtime-ready portrait ${portrait.id} is not backed by a listed real source asset.`);
    else if (source.missing || source.approval !== "approved") {
      errors.push(`Runtime-ready portrait ${portrait.id} requires an available approved real source.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
