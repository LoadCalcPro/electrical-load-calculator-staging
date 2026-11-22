# Universal Properties — overlap and duplication audit
Date: 2026-11-21
Scope: staging only. Findings based on inspection of `one-line/index.html`; these are **candidates**, not permission to remove controls.

## Confirmed existing architecture
- `UNIVERSAL_PROPERTY_CONTROLS` has 15 IDs. Developer inspector discovers additional rendered fields outside that list, and drops registered entries when their corresponding DOM field is absent.
- Registry selectors for rotation already accommodate `data-wall-angle`, `data-rotation`, and `data-drawing-rotation`. This is evidence of multiple UI entry points, **not proof** of duplicate state.
- Registry designation maps `data-prop="name"` and `data-prop="label"` to one developer entry; display terminology also varies between Equipment Designation, Symbol Designation and Label.
- Line thickness appears as Drawing Line Weight and Drawing Line Thickness in source text, with `data-weight-value` in the registry.
- Size is described as Equipment Size (%) and Symbol Size in source text; the registry currently covers `data-equipment-size` only.
- Rotation Degrees, Label Rotation, Horizontal Offset, and Vertical Offset appear in source text. Outline and label transforms must not be merged.
- Conduit trade size appears in source text. Confirm one authoritative trade-size field per run; do not merge conduit trade size with drawing line weight.
- Equipment Fill, label highlight, and hatch/fill color have distinct semantics; do not merge solely because they use color selectors.
- `planFootprint` is a section grouping dimensions and location, not a scalar Property. Avoid counting it and its nested fields as separate duplicates without checking wrappers.

## Canonical candidate groups to validate
| Category | Candidate aliases | Proposed canonical capability | Decision |
| --- | --- | --- | --- |
| Sizing | Equipment Size (%), Symbol Size | item scale | Investigate whether one percentage scale can represent both |
| Line appearance | Drawing Line Weight, Drawing Line Thickness | stroke width | Merge if same underlying value and units |
| Rotation | Rotation Degrees, drawing rotation, wall angle | outline rotation | Share engine; retain separate label rotation |
| Designation | Equipment Designation, Symbol Designation, Label | primary designation | Share field behavior; preserve context-specific captions |
| Conduit | Conduit trade size and any other trade-size entry | conduit nominal size | One authoritative size; separate from stroke width |
| Fill | Equipment Fill, hatch color, label highlight | **separate** capabilities | Not duplicates; use shared color picker component |
| Position | X/Y, H/V offsets | position vs label offset | Check coordinate frames before merging |
| Dimensions | Actual footprint, width/height, wall length | distinct item dimensions | Shared dimension editors, distinct values |

## Next checks before any runtime consolidation
1. Enumerate all rendered field IDs, event handlers, and storage paths for each candidate.
2. Trace mouse-drag, Properties editing, save/open and printing for each candidate.
3. Identify a single authoritative model value for genuine duplicates.
4. Add complete categorized Developer inventory with stable IDs; distinguish **available and working**, **adapter pending**, and **not applicable** in development.
5. Preserve checked-by-default behavior, hidden data values, and per-type visibility/order preferences.
6. Test Disconnect, Wall, Room, Linear Light, Breaker, conduit and annotation leader as regression samples.

No runtime code changed by this audit.
