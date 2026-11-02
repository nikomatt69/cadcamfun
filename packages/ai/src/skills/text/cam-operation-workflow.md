# From model to verified G-code

Choose the actual execution route. These steps describe legacy operations; whole-part manufacture and turning use their matching preview/store actions and retain their returned evidence. Never regenerate their NC through legacy generate. No route establishes physical machine safety.

1. Reuse fresh drawing context or read cad action describe/exact for missing geometry, bounds and ids. If requested machining has no geometry, report what is missing.
2. Use current machine, stock, work offset, material and cutter records. Read library action lookup_material/lookup_tool only for missing data. Unknown physical setup data stays unmodelled; do not invent a saved tool or fixture.
3. cam action suggest (or cutting_data, skill cutting-parameters) gives starting values and warnings; preserve their assumptions. When two cutters or two sets of feeds compete, cam action compare_setups (1 to 4 candidates `{name, params, toolId?, materialId?}`) generates and verifies each one on the real stock and reports them side by side; it needs explicit stock first (cam_edit action stock_set), a `params.material` cutting family for each library material, and stores nothing. Run cam action plan_check with the proposed operations and returned current revision before storing the plan.
4. cam_edit action create with expectedRevision and a supported type (contour, pocket, drill, engrave, profile, threading, 3d_surface). Parameters include `toolDiameter`, positive `depth`, `stepdown`, `feedrate`, `rpm`, `material` and `offset` (outside for a part contour, inside for a pocket wall).
5. cam_edit action generate for the operation id.
6. cam action analyze with operationId reads the full stored NC, not just the preview head: static checks include travel limits and missing spindle/feed.
7. cam_edit action verify replays that stored programHash on stock; the dedicated verifier uses cam_verify action verify. Pass known `tool.cuttingLength`, `tool.stickout`, `tool.holderDiameter`, `fixtures` and `targetSolids`; omitted geometry was not checked. Read cam action review for evidence freshness and limits.
8. Diagnose errors, update the operation with the current expectedRevision, regenerate, analyze and verify. Do not repeat unchanged failures or treat unrelated successful reads as a fix. Respect the returned refinement limit (at most three per drawing/stock revision); report the cause when blocked. After stale revision, inspect and plan_check again.

Chains: after an operation, cam action chain_suggest (`fromOperationId`, default the last one; `materialHint`, `toolHint`) proposes the next one from the depth and stepdown already used (roughing left, then the outline, then a face for an empty program): it is a heuristic from the saved parameters, not a plan, so run plan_check on what you take from it. cam action chain_status (`operationId`) tells which operation the rest machining continues from and warns `OrphanRef` when a rest-machining operation names no larger previous tool.

Report: the operation, the parameters you chose and why, the verification result with what it did NOT model, and the next decision for the user.
