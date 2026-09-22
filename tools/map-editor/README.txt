Lulu's Tale Map Studio
======================

Launch
------
Run:

tools/map-editor/tiletool.bat

The launcher builds the typed browser client, starts the local server on
http://127.0.0.1:5187, and opens the Studio. Closing the launcher window stops
the server.

Authority
---------
Canonical authoring projects live in:

map-projects/<map-id>/map-project.json

Publication targets only:

- public/data/maps
- public/assets/maps/native
- RUNTIME_AUTHORITY_MANIFEST.json

Legacy root maps and old *.visual.json placement companions are never written.
The active Overworld is hard-guarded at 96x68 tiles / 3072x2176 pixels.

Workflow
--------
1. Select Home, Charles Jr., or Overworld.
2. Edit semantic geometry, 4px collision, real raster layers, foreground alpha,
   triggers, or non-runtime repair annotations.
3. Save Project. This never changes runtime files.
4. Validate.
5. Stage and inspect the exact publication bundle.
6. Publish. The server rejects stale source hashes, creates a complete backup,
   prepares every target, and rolls back if replacement fails.

Day/Night foreground alpha is shared and validation-blocking. Raster tools work
only on real loaded project pixels or selected real project assets. Missing
images block editing; no fallback art is rendered.

The Overworld publication gate stays closed until Nick approves the
x=16-43, y=16-43 Charles Jr. calibration area after inspecting raster quality,
foreground masks, staging output, and runtime behavior.

Tests
-----
npm run map-studio:build
npm run map-studio:test

Full operating details are in:

tools/map-editor/docs/MAP_STUDIO_WORKFLOW.md
