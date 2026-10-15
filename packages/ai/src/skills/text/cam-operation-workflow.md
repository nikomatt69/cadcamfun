# From model to verified G-code

Follow the loop; do not skip a step and do not call a program safe before the last one.

1. cad action describe: what is there, its bounds and ids. Nothing to machine means stop and say so.
2. library action lookup_material and library action lookup_tool: use the user's tool and material; if there is none, say which assumption you made.
3. cam action suggest: depth, stepdown, cutting speed, chip load and warnings for this drawing.
4. cam_edit action create with a type (contour, pocket, drill, engrave, profile, threading, 3d_surface) and parameters: `toolDiameter`, `depth` (positive, below the stock top), `stepdown`, `feedrate`, `rpm`, `material`, `offset` (outside for a part contour, inside for a pocket wall).
5. cam_edit action generate for the operation id.
6. cam action analyze: static checks (travel limits, missing spindle or feed).
7. cam_edit action verify: simulate it on the stock. Pass what you know: `tool.cuttingLength`, `tool.stickout`, `tool.holderDiameter`, `fixtures`, `targetSolids` for the finished part.
8. Errors? cam_edit action update, then generate and verify again. Repeat until the report has no errors or you can state what blocks it.

Report: the operation, the parameters you chose and why, the verification result with what it did NOT model, and the next decision for the user.
