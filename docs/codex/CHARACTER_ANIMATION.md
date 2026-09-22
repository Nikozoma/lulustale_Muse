# Character Animation Engineering

## Authority

Re-check the live Character Studio project and runtime manifest before work:

- authoring: `character-production/projects/<character-id>/project.json`;
- runtime index: `public/assets/characters/INDEX.json`;
- runtime contract: `public/assets/characters/v2/<character-id>/MANIFEST.json`;
- generated sheets: paths declared by the runtime manifest.

Historical revisions, derived reports, and source packages are provenance—not active authority—unless the live project selects them. Preserve canonical approval separately from `runtime_ready`.

For Lulu, the current project is revision 8 and canonically `unapproved`; see `CURRENT_STATE.md` for the current live baseline.

## Production Order

Use:

`MECHANICS → POSES → TIMING → ART`

1. Define movement mechanics and the distance/time contract.
2. Design readable key poses and locomotion phases.
3. Set timing and synchronize playback to runtime movement.
4. Finish pixel art only after motion reads correctly.

Do not attempt to repair a motion problem by regenerating art before diagnosing whether the fault is poses, timing, root registration, direction mapping, or runtime synchronization.

## Lulu Runtime Contract

- Native production cells: `96×96`.
- Root: around `(48,88)` where the active action contract applies.
- Lulu's intended presentation directions are `Down`, `Down-Left`, `Up-Left`, `Up`, `Up-Right`, and `Down-Right`. Gameplay movement remains fully analog and can travel exactly horizontally.
- Exact horizontal input uses the diagonal on the same side and preserves the last visual vertical hemisphere. Stateful angular hysteresis prevents small joystick Y noise from flickering between the two neighboring diagonals.
- Pure `Left` and `Right` Lulu rows are legacy provenance only and receive no further production work. Other characters retain their own explicit direction topology.
- Rendering is nearest-neighbor. Keep transparent pixels clean and preserve registered roots and occupied silhouettes.
- Runtime movement speed, action timing, and `cycleDistancePx` must describe the same apparent travel. Do not tune animation cadence independently of world displacement.

Always read current manifest values rather than copying an older revision. At the current baseline, Lulu walk uses `cycleDistancePx: 96` and run uses `cycleDistancePx: 192`.

## Pose and Phase Design

Temporal consistency matters more than isolated attractive frames. Track body mass, limb identity, silhouette, root, and contact across the loop and between neighboring directions.

### Walk

Build each half-cycle from:

`contact → down/recoil → passing → up/high`

- Contact establishes the planted foot and stride.
- Down/recoil accepts weight without sliding the root.
- Passing clearly carries the free foot past the planted leg.
- Up/high releases the planted foot and prepares the next contact.
- The two halves must alternate legs and preserve comparable stride amplitude.

### Run

Build each half-cycle from:

`contact → compression → push-off → flight`

- Contact reads as a brief landing, not a held walk pose.
- Compression lowers and stores energy.
- Push-off extends through the planted leg.
- Flight visibly removes ground contact before the next landing.

Foot planting is evaluated in world motion, not only on the sheet. A visually fixed foot must remain consistent with root displacement and cycle distance.

## Diagnosis

Classify the defect before editing:

- **Pose:** weak contact, missing passing/flight, incorrect limb order, inconsistent silhouette.
- **Timing:** holds or transitions are too slow/fast for the intended action.
- **Root/offset:** apparent bob, drift, skating, or misregistration despite good poses.
- **Mapping:** wrong row, direction order, mirroring, frame topology, or action selection.
- **Synchronization:** runtime speed and cycle distance disagree with the authored stride.

Change the smallest layer that owns the defect. Preserve unrelated actions and approved identity invariants.

## Calibration and Review

When animation mechanics or character design are not locked, calibrate a representative direction/action at real game scale before expensive full-direction production. After explicit approval, expand coherently rather than repeatedly requesting micro-approval.

Use focused structural checks for geometry, alpha, manifests, roots, hashes, and playback contracts when relevant. Avoid exhaustive image-analysis QA, giant frame comparisons, or automated claims of motion quality.

Human review in gameplay and on the target phone is the final authority for motion, identity, grounding, scale, and feel.
