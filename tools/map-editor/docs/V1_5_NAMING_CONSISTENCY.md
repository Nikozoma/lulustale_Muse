Tile Tool v1.5 — Naming Consistency Update
==========================================

Summary
-------
v1.5 standardizes the Tile Tool around the current Lulu's Tale project names.

Current active map files
------------------------
- Home.json
- Charles.json
- Overworld.json

Current active map identities
-----------------------------
- Home
- Charles
- Overworld

Current visual companion files
------------------------------
- Home.visual.json
- Charles.visual.json
- Overworld.visual.json

Launcher
--------
- tools/map-editor/tiletool.bat

Backup root
-----------
- tools/backups

Behavior
--------
- Paths remain project-relative.
- Current root maps are preferred over legacy semantic filenames.
- Backups and reports do not appear in the active map selector.
- Visual saves for current maps use current visual filenames.
- Old semantic map names are treated as legacy/import candidates, not the current active project format.
- Legacy visual saves use a LegacyImport_ prefix to avoid creating old active filenames.
