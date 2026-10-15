# Reusable machining cycle presets

Load the operation schema before applying a preset. Read the actual machine, material, cutter, stock, origin and selected geometry. A preset is an ordered strategy, never invented feeds or a universal machine setting.

- Closed recess: pocket, then a finishing pass with explicit allowance and a cutter that fits the inside radii.
- External contour: profile after internal machining; include tabs or confirmed workholding where the schema supports them.
- Deep recess: adaptive roughing, rest machining with a smaller cutter, then finish the selected faces.
- Hole series: drill, with the supported peck cycle for depth; tapping or thread milling only with confirmed pitch and controller support.
- Rotational part: facing, turning_od, then parting; threading_od only after confirming pitch, tool and machine.

Use library action lookup_tool and cam action suggest for starting values. Create operations through cam_edit action create, generate through cam_edit action generate, analyse through cam action analyze, and verify through cam_edit action verify. Preserve real operation ids, predecessor links and remaining stock. Each flipped setup needs its own coordinate origin and fixtures. Report unsupported cycle/controller combinations instead of substituting an unrelated cycle.
