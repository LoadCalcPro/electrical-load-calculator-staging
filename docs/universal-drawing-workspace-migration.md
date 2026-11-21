# Universal Drawing Workspace — staged migration plan

Status: architecture baseline only; no runtime behavior changed.

## Confirmed code baseline (2026-11-21)
- The Electrical Drawing Suite currently lives in `one-line/index.html` (approximately 891 KB / 6,955 lines at inspection).
- The runtime already has a shared `nodes`, `wires`, `annotations`, `drawnLines`, and `polyRoutes` model.
- `drawingView` defaults to `plan`, but `viewState={one:null,plan:null,ladder:null}` and each sheet stores separate `views`. This separation is the principal architectural barrier to mixed content on one sheet.
- The symbol list already includes Plan footprints (`planpanel`, `plantransformer`, `plangenerator`) alongside electrical equipment types (`transformer`, `generator`, `ats`, etc.). This is a promising starting point for a universal library.
- `snapshotView()` returns the common collections; `storeCurrentSheet()` saves the current drawing into the view-specific slot and records sheet metadata including architectural scale.

## Target
One sheet/canvas with all Plan, One-Line, and Ladder symbols, annotations, editable schedules and diagram groups. The sheet may use a calibrated architectural scale while embedded diagram groups can be visually resized and marked NTS without changing electrical ratings, measurements or internal connection topology.

## Implementation order
1. **Regression baseline:** capture sample saved projects and test selection, label movement, resizing, rotation, measurements, print/export and save/open for each existing view. Do not delete or repurpose old view states.
2. **Unified item registry:** define symbol type, renderer, property schema, default geometry, label behavior, connection anchors and capabilities; adapt existing types incrementally.
3. **Mixed-content sheet model:** add a versioned unified `items` / diagram-group layer while preserving backward-compatible reading of `views.one`, `views.plan`, `views.ladder`. Explicit migration required for old files; never silently flatten or discard views.
4. **Embed one-line equipment in Plan:** enable a small pilot set (Disconnect, Panel, Transformer), retaining shared selection/properties and electrical values. Verify against the existing One-Line editor.
5. **Diagram groups:** add stable IDs, local transforms, move, proportional resize, nested editing and group copy/paste between sheets. Distinguish display transform from engineering measurement scale.
6. **Panel schedules and ladder symbols:** add editable data-backed tables and specialized connection behavior using the same canvas.
7. **Retire redundant tabs only after complete parity testing and user approval.**

## Non-negotiable invariants
- Stage only; never change production as part of this migration.
- Keep the calibrated floor-plan scale and measurement results invariant under NTS diagram resizing.
- Preserve all equipment ratings, wire endpoints, text contents, independent label offsets/rotations, developer visibility choices, and saved project compatibility.
- No broad search-and-replace in the monolithic HTML; use narrow, testable changes and remove duplicated paths only after verifying parity.
- Retain a rollback point before each runtime migration.

## First implementation milestone
On a Plan sheet, insert a Disconnect (or another existing One-Line equipment type), select and edit it using the same Properties controls, then save/reopen and confirm both the floor-plan measurement calibration and embedded equipment are unchanged.
