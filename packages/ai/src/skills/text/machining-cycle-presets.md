# Reusable machining cycle presets

Use the loaded schema; discover missing tools with search_tools. Reuse current machine, material, cutter, stock, origin and geometry evidence; read only missing/stale fields. A preset is an ordered strategy, not a generator action name or universal machine setting.

- Closed recess: pocket, then a finishing pass with explicit allowance and a cutter that fits the inside radii.
- External contour: profile after internal machining; include tabs or confirmed workholding where the schema supports them.
- Deep recess: adaptive roughing, rest machining with a smaller cutter, then finish the selected faces.
- Hole series: drill, with the supported peck cycle for depth; tapping or thread milling only with confirmed pitch and controller support.
- Rotational part: cam action lathe uses operations face, rough, finish, then part; thread needs confirmed pitch, insert and controller. cam action turn is the separate point-tool preview. Never send turning_od/threading_od as legacy create types.

Use library action lookup_tool and cam action suggest for missing starting values. For legacy operations: cam action plan_check, cam_edit action create, cam_edit action generate, cam action analyze, cam_edit action verify and cam action review. A dedicated verifier uses its permitted cam_verify action generate/verify instead. Native adaptive/rest strategies belong to cam action manufacture and its matching cam_edit action manufacture; they are not legacy create types. Do not regenerate manufacture/turn NC with legacy generate. Preserve returned operation ids and stock identity. Each flip needs its own origin and fixtures. Report unsupported combinations instead of substituting an unrelated cycle.
