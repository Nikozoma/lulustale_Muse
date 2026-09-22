import Ajv2020 from "ajv/dist/2020.js";
import { join } from "node:path";
import { PROJECT_ROOT } from "./config.mjs";
import { readJson } from "./fs-utils.mjs";

const schemaFiles = {
  project: join(PROJECT_ROOT, "tools", "map-editor", "schema", "map-project.schema.json"),
  semantic: join(PROJECT_ROOT, "public", "data", "schema", "map-semantics.schema.json"),
  visual: join(PROJECT_ROOT, "public", "data", "schema", "visual-config.schema.json"),
  collision: join(PROJECT_ROOT, "public", "data", "schema", "collision-grid.schema.json")
};

const validators = await buildValidators();

export function assertProjectSchema(value) {
  assertValid("map project", validators.project, value);
}

export function assertSemanticSchema(value) {
  assertValid("map semantics", validators.semantic, value);
}

export function assertVisualSchema(value) {
  assertValid(`${value?.variant || "map"} visual descriptor`, validators.visual, value);
}

export function assertCollisionSchema(value) {
  assertValid("collision grid", validators.collision, value);
}

async function buildValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  });
  const [project, semantic, visual, collision] = await Promise.all(
    Object.values(schemaFiles).map((path) => readJson(path))
  );
  return {
    project: ajv.compile(project),
    semantic: ajv.compile(semantic),
    visual: ajv.compile(visual),
    collision: ajv.compile(collision)
  };
}

function assertValid(label, validator, value) {
  if (validator(value)) return;
  const details = (validator.errors || [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  throw new Error(`${label} does not match its maintained schema: ${details}`);
}
