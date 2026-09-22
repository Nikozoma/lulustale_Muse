# Codex Project Context Index

This directory holds durable project knowledge. It complements the root `AGENTS.md`; it does not replace the current user prompt or active repository evidence.

Do **not** load every document for every task. Read only the specialist document relevant to the work, plus `CURRENT_STATE.md` when current baseline knowledge is materially necessary.

## Routing

| Task area | Read |
| --- | --- |
| Current overall implementation, runtime authority, active tools, or known gates | [CURRENT_STATE.md](CURRENT_STATE.md) |
| Lulu, characters, sprites, roots, timing, or animation | [CHARACTER_ANIMATION.md](CHARACTER_ANIMATION.md) |
| Maps, semantics, collision, foregrounds, Day/Night art, or HD refinement | [MAP_PRODUCTION.md](MAP_PRODUCTION.md) |
| Mobile UX, PWA, orientation, fullscreen, viewport, or touch | [MOBILE_PWA.md](MOBILE_PWA.md) |
| Story, gameplay, combat, companion, or system direction | [GAME_DESIGN.md](GAME_DESIGN.md) |
| Agent workflow, validation depth, planning, goals, or credit efficiency | [CODEX_WORKFLOW.md](CODEX_WORKFLOW.md) |

## Authority and Maintenance

Use this order: newest explicit user decision → active implementation → current authoritative docs → historical material. Treat old reports, audits, packages, prototypes, and superseded revisions as evidence to verify, not automatic authority.

- Update `CURRENT_STATE.md` only when the implemented baseline materially changes.
- Update a specialist document only when a durable design, engineering, or production decision changes.
- Do not update durable context for temporary tasks or routine bug fixes.
- The current prompt/chat is the temporary task layer.
- Never create a persistent `CURRENT_TASK` file.
