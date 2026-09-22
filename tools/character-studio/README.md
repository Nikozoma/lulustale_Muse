# Lulu's Tale Character Studio

Local production and repair tool for the real character assets under `public/assets/characters`.

## Launch

Run `characterstudio.bat` or:

```powershell
npm run character-studio
```

The service listens only on `127.0.0.1:5191`, confines file operations to the Lulu's Tale project root, and opens the Vite/Canvas workspace in the default browser.

## Storage and authority

- `character-production/projects/<character-id>/project.json` is editable production metadata.
- Imported source paths remain immutable provenance inputs. Pixel edits are saved as derived PNGs inside that character project.
- `public/assets/characters/INDEX.json` and `public/assets/characters/v2/*/MANIFEST.json` are generated runtime contracts.
- `character-production/staging` receives validated export candidates and hash diffs.
- `character-production/backups/backupN` receives numbered backups before project saves, derivative overwrites, and runtime publishing.
- `public/assets/characters` changes only through the explicit **Publish Staged Revision** action.

Sharp is the final PNG decoder, inspector, packer, and encoder. Browser Canvas data is an editing preview until it is saved through the local service.

## Current asset migration

Run this only when intentionally regenerating the migration records from current real project assets:

```powershell
npm run character-studio:migrate
```

The migration creates projects for current Lulu, Brutus, NPC, and bird assets, preserves active runtime paths and hashes, records the historical Brutus filename defect as rejected provenance, and records malformed historical worker boards as reference-only. It does not alter sprite pixels.

## Repair workflow

1. Select a migrated project or import an existing real sheet with confirmed cell geometry and direction topology.
2. Inspect frame alpha, hidden RGB, occupied bounds, roots, offsets, contacts, anchors, events, and adjacent directions.
3. Make non-destructive crop, nearest-neighbor scaling, alpha, geometry, anchor, event, or explicit mirror-provenance edits. Use Undo/Redo, then save a derived frame.
4. Set production metadata and save; every overwrite receives a numbered backup.
5. Validate the project. Source hash drift, missing directions/files, crop/geometry errors, non-RGBA PNGs, alpha defects, invalid roots, and invalid locomotion cycle distances block export. Exact duplicate frames are reported without automatically failing.
6. Stage export and inspect every unchanged/new/changed file and SHA-256.
7. Publish only a reviewed `runtime_ready` revision. Publishing revalidates stage hashes and backs up affected runtime files. Class batch staging validates and stages multiple real projects but intentionally leaves publishing as a per-revision decision.

Game Motion preview uses the shared runtime direction/timing/root calculations and the project’s real 640×360, 760×360, and Android usable viewport cases. It can compare legacy time-driven locomotion with proposed distance-driven playback, analog strength, blocked movement, map render scale, logical viewport, and output scale.

Portrait PNGs can be imported only from real project files. They enter `in_production`; the UI will not allow runtime approval until canonical identity is approved and locked. Runtime-ready portraits are deterministically cropped into the staged character package and included in `CharacterManifestV2`. The migrated projects intentionally contain none because no approved portrait library exists.

Interaction Stage is preview-only. It can select the second real project's
action, direction, fixed frame or synchronized timeline, render scale, and
runtime-relative root offset without creating another persisted choreography
contract. `INTERACTIONS.json` remains the authority for paired gameplay
alignment.

## Rollback

Published paths and their prior bytes are recorded under the numbered backup directory shown after publish. Rollback is deliberately manual: inspect the backup report and restore only the intended files. Character Studio never automatically guesses which later project changes should be reverted.

## Checks

```powershell
npm run character-studio:check
```

Checks use current migrated projects and real project PNGs, including the known malformed Charles Jr. worker reference. No synthetic art fixtures are used.
