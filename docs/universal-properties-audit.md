# Universal Properties consolidation — baseline audit (staging)

Status: audit started; **no runtime behavior changed**. Do not claim the unified Properties engine is implemented.

## Existing implementation found in `one-line/index.html`

- One monolithic editor contains shared `nodes`, `wires`, `annotations`, `drawnLines`, and `polyRoutes` but maintains separate `viewState.one`, `viewState.plan`, and `viewState.ladder`.
- A partial shared registry already exists as `UNIVERSAL_PROPERTY_CONTROLS` (15 registered groups): size, rotation, wall length, plan footprint, line thickness, outline pattern, equipment fill, designation, voltage, main type, amps, kAIC, fuse amps, generator kW, transformer kVA.
- `installDeveloperPropertyVisibility(panel,item)` builds a developer inspector from registered controls **and** dynamically discovered DOM fields, then hides/reorders actual fields.
- **Critical gap:** unavailable registry controls are removed from the developer list (`if(!present[i].field)present.splice(i,1)`). This means a checkbox cannot enable a capability not implemented/rendered for the selected type. Existing behavior is *visibility of present controls*, not universal availability.
- Preferences currently persist in browser `localStorage` under `loadcalcpro-staging-property-visibility-v1`; confirm project JSON portability and per-item-type defaults before changing persistence.
- The inspector is staging-hostname gated. Preserve that protection.
- Reordering existing DOM nodes may affect wrappers, nested formatting controls and event listeners; test carefully.
- Current symbol registry includes one-line `disconnect`, `panel`, `transformer` and Plan `planwall`, `planroom`, `planpanel`, `plantransformer`, `plangenerator`. Some geometry and labels have type-specific behavior.

## Required architecture

1. **Capability registry**: every item type can address every shared capability. Define each control once with stable ID, schema, renderer, state read/write, validation, and canvas synchronization. Specialized controls are optional capabilities in the *same registry*, not separate property panels.
2. **Developer visibility**: checked by default for new types; toggles hide only the UI, never erase values or disable capabilities. Expose the complete registry, including capabilities that require a migration adapter. Do not expose a broken control to ordinary users.
3. **Item adapters**: migrate Disconnect, Wall, Room, Linear Light, Breaker and other types in small batches. Map existing stored fields into canonical state without breaking saved drawings.
4. **Shared interaction contracts**: outline vs label selection, independent label transforms, sizing, rotation, mouse/property synchronization, undo/redo, copy/paste and save/open.
5. **One workspace** only after each adapter passes regression checks. Preserve calibrated Plan scale and NTS diagram geometry.

## First executable migration gate

Start with Disconnect as the reference and Wall as the first cross-domain adapter. Verify selection, independent label rotation and offsets, outline resize, color/fill/weight, visibility toggle persistence, save/open, and absence of regressions. Then expand to Linear Light and Breaker. Do not remove old paths until both adapter and original pass.

## Explicitly deferred

- Embedding PDF outputs and panel schedules as drawing objects comes after unification.
- Existing Panel Schedule + Load Calculation in `electrical_calculator_suite.html` remains authoritative; the newly added `one-line/panel-schedule-model.js` is experimental and must **not** be wired as a second calculation engine.
