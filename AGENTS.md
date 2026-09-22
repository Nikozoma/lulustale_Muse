# AGENTS.md — Lulu's Tale

## Operating Guide

Lulu's Tale is a TypeScript/Vite/Canvas 2D, mobile-first, landscape-first PWA. The current priority is the playable demo foundation and vertical-slice stability.

Use this authority order:

1. newest explicit user decision;
2. active repository implementation and current runtime/authoring manifests;
3. current authoritative project documentation;
4. historical documentation, reports, audits, prototypes, and superseded assets.

The active project folder is authoritative for implementation. Preserve a working implementation when it conflicts with older documentation unless the user explicitly requests a change. Label claims as implemented/current, planned, historical/superseded, or uncertain/requires verification. Never promote an old or uncertain claim into current authority.

## Durable Context Routing

Start with [docs/codex/INDEX.md](docs/codex/INDEX.md). Read only the specialist document relevant to the task, plus `CURRENT_STATE.md` when the current baseline materially matters. Do not load the whole documentation set by default.

## Core Rules

- Preserve unrelated working state and dirty-tree changes.
- Make normal reversible technical decisions autonomously.
- Ask only when a decision is architecture-changing, destructive, high-rework, compatibility/data-risking, or dependent on unresolved subjective preference.
- Prefer coherent correlated batches over excessive micro-steps.
- Make the smallest coherent change that completes the request; avoid scope expansion, speculative refactors, overengineering, and future-system work.
- Do not mix active and historical project variants, especially map dimensions, runtime packages, or character revisions.
- Use real project assets and data only. Never add placeholder/fake assets or data, mocks, stubs, invented art, invented geometry, or temporary stand-ins. If required authority is missing or ambiguous, stop and report it.
- Preserve mobile compatibility, current-objective `!` interaction, dedicated Day/Night visuals, and shared semantic geometry unless the task explicitly changes them.
- Human visual/gameplay judgment is authoritative for subjective work. Do not manufacture approval from automated checks.
- Do not create, reset, clean, discard, commit, branch, tag, push, or otherwise change Git state unless explicitly requested.

## Credit-Efficient Default Workflow

`UNDERSTAND → INSPECT → IMPLEMENT COHERENT BATCH → MINIMAL TARGETED SANITY CHECK → MAKE RUNNABLE → USER TESTS → BATCH FIXES`

Before any nontrivial check, ask: **Will the result materially affect what I do next?** If not, skip it.

Do not default to full test suites, broad regression sweeps, production builds merely because work finished, repeated validator loops, automated gameplay walkthroughs, giant QA/comparison artifacts, redundant hash/parity proofs, benchmarks without a demonstrated issue, or unnecessary Git checkpoints and cleanup.

Use targeted checks appropriate to the change. Do not treat visual, animation, gameplay, mobile, UI, art, collision feel, or other subjective work as programmatically approved. The user's eyes and hands are the primary QA for those areas.

## Planning Autonomy

In Plan Mode, choose the clearly recommended option and continue when it is reversible, not materially architecture-changing, and not dependent on user preference.

Stop and ask only when the choice:

- materially changes architecture;
- creates meaningful migration, rework, data-loss, or compatibility risk;
- depends on subjective preference not already established; or
- could reasonably produce substantially different end results.

Otherwise use best judgment and continue.

## Task Discipline

- Inspect active source, configs, manifests, maps, assets, and current Studio records before relying on reports.
- Do not modify maps, assets, collision, controls, rendering, quest flow, or production behavior unless directly required.
- Do not perform automated gameplay playthroughs unless explicitly requested.
- Prefer focused code inspection, targeted checks, and controlled debug-state screenshots. Never claim device or gameplay testing that was not performed.
- Keep player-facing UI mobile-first: no normal desktop-control instructions, permanent Interact button, or floating `Press E` prompts.
- Only the current objective's active `!` is shown and tapped; interaction still requires Lulu to be in range.
- Day/Night is manual and bed/event-driven, not clock-driven. Dedicated Night art must not receive an additional generic night tint.

## Completion Report

End each task with:

- summary and changed files;
- commands run;
- tests/builds/checks with pass/fail status;
- validation results;
- known issues, blockers, assumptions, and deferred work;
- recommended next step;
- Git status when a repository exists; and
- confirmation that no placeholders, fakes, mocks, stubs, or temporary stand-ins were added.
