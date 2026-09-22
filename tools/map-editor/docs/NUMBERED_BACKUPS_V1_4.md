# Tile Tool v1.4 — Numbered Direct-Save Backups

## Backup root

Backups are written to the project-relative folder:

```text
tools/backups
```

This is resolved from the project root at runtime. The absolute user machine path is not hardcoded.

## Numbering behavior

Before a direct overwrite/save-to-project-file operation, the server scans `tools/backups` for folders named:

```text
backup1
backup2
backup3
...
```

It chooses the next backup folder as:

```text
max(existing backup number) + 1
```

If no backup folders exist, the first backup is:

```text
tools/backups/backup1
```

## Safety behavior

A direct save only proceeds after the backup copy succeeds.

If backup creation/copying fails, the direct save is cancelled and the original project file is not overwritten.

The tool never overwrites an existing backup folder and never deletes old backups automatically.

## Backed-up filenames

Backed-up files keep their original filename.

Examples:

```text
tools/backups/backup1/Home.json
tools/backups/backup2/Charles.json
tools/backups/backup3/Overworld.json
```

For visual companion files:

```text
tools/backups/backup4/Home.visual.json
```

## Notes

- Semantic saves require the target map file to already exist.
- Visual saves back up the `.visual.json` file if it already exists.
- If a visual file is being created for the first time, there is no existing file to back up, so no backup folder is created for that creation-only save.
- `tools/backups` is not scanned as a normal active map source.
