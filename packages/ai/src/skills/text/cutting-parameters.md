# Cutting parameters, as a starting point

Use the tool and material library values first, then `cam` action `cutting_data`, then `cam` action `suggest`. Without them, start here and say they are starting values.

- Spindle speed: `rpm = Vc * 1000 / (pi * D)`; feed: `F = rpm * flutes * fz`.
- Surface speed Vc (m/min, carbide): aluminium 200-400, brass 150-300, plastics 150-300, mild steel 80-150, stainless 50-100, titanium 30-60, hardwood 300-600.
- Chip load fz (mm/tooth) for a 6 mm cutter, scale roughly with diameter: aluminium 0.03-0.06, brass 0.03-0.05, plastics 0.04-0.08, mild steel 0.02-0.04, stainless 0.015-0.03, titanium 0.01-0.03.
- Roughing: stepdown up to 1 x D in aluminium and plastics, 0.3-0.5 x D in steel; stepover 40-50 % of D (10-15 % when slotting full width in steel).
- Finishing: leave 0.1-0.3 mm, climb milling, stepover 5-15 % of D.
- Plunge feed 30-50 % of the cutting feed; a drill is fed by the cycle, not by chip load per tooth.
- Never exceed the machine's maximum spindle speed or feed; the analysis flags both.
- Small cutters (< 3 mm) break first: shallow stepdown, light chip load, no full-width slotting.

## `cam` action `cutting_data`: kernel feeds and speeds for one cut
Ask it before quoting numbers from the table above. Input: `material` (an id or name from `cam` action `materials`; unknown is refused with the list), `cut` (face, slot, rough-side, adaptive, finish-wall, finish-floor, finish-3d, drill, spot, chamfer, engrave, thread-mill, tap or ream), `tool` `{kind: flat|ball|bull|chamfer|spot|drill|facemill|threadmill|engraver|tap|reamer, diameter, flutes, toolMaterial?, coating?, cornerRadius?, angle?, pitch?, fluteLength?, stickout?, shankDiameter?}`, and optionally `machine` (a preset or `config:<id>`: the result is bounded by its spindle and feed), `depth`, `ae`, `ap`, `scallop`. A cutter that is geometrically impossible (flutes longer than the stick-out, a bull nose without 0 < `cornerRadius` < D/2, a chamfer, spot or engraver without `angle`, a thread mill or tap without `pitch`) is refused with the reasons. Omitted flute length, shank and stick-out are assumed (3 x D, D with at least 3 mm, 4 x D + 10): pass the real ones from `library` action `lookup_tool` when you have them, and say which were assumed. A filament printer is refused: it has deposition settings, not cutting feeds.
- The answer is a starting point from handbook data (Kienzle), not a guarantee: the tool life, deflection and chatter are not modelled. Quote the numbers with the cut they belong to, and let `cam` action `process` (skill cam-post) judge the real engagement of a program.
- `cam` action `suggest` is the older, operation-shaped helper (it needs an operation type, tool diameter and material); `cutting_data` is the one that knows the cut type and the machine ceiling.

