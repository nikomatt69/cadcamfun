# Viewport integration

Import `Editor2D` and `View3D` from `./index.ts`. Both fill their parent's width
and height; give the parent a non-zero height.

`Editor2DProps` requires `drawing: Drawing`, `onChange: (drawing: Drawing) => void`,
and `selectedTool: ToolId`. Feed emitted drawings back into the `drawing` prop.
External document replacements reset history; emitted document echoes do not.
The canvas owns selection and a bounded undo/redo history. Ctrl/Cmd+Z undoes,
Shift+Ctrl/Cmd+Z or Ctrl/Cmd+Y redoes, Delete removes selection, F fits the drawing,
Enter finishes a polyline, and Escape cancels a gesture. Wheel/pinch zoom;
space-drag, middle-drag, and right-drag pan. Text starts as "Text"; type before
placing it. Transform gestures use the first point as origin; rotation uses the
drag direction, scale uses drag length / 10 mm, and mirror uses the drag axis.

`View3DProps` has optional `drawing: Drawing`, `solids: readonly Solid[]`,
`extrusionHeight: number` (mm, default 0), `program: cam.Program`,
`preset: ViewPreset` (default "perspective"), `playing: boolean` (default false),
`playbackTime: number` (seconds, default 0), `playbackRate: number` (default 1),
and `onPlaybackTimeChange: (seconds: number) => void`.
Presets are perspective, top, front, right, and isometric. OrbitControls handles
orbit/pan/zoom. Playback stops at the end; set playbackTime to 0 to restart.
The caller supplies play/pause and scrub UI through these props. Stock can be
supplied as a core Box solid. Programs expand drilling cycles and tessellate
helical/full-circle arcs, retain dwell timing, and distinguish dashed rapids.
Resize observers, animation frames, controls, geometries, materials, and the
WebGL renderer are released on unmount.

Remaining full-spec features: offset/trim/extend/fillet/chamfer machines,
center-start-end arcs, rulers, four-view, worker mesh construction above 50,000
vertices, and large-drawing frame-budget verification. Current mesh construction
runs on the main thread. No material-removal simulation is included.
