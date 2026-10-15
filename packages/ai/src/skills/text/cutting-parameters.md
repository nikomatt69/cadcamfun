# Cutting parameters, as a starting point

Use the tool and material library values first, then cam action suggest. Without them, start here and say they are starting values.

- Spindle speed: `rpm = Vc * 1000 / (pi * D)`; feed: `F = rpm * flutes * fz`.
- Surface speed Vc (m/min, carbide): aluminium 200-400, brass 150-300, plastics 150-300, mild steel 80-150, stainless 50-100, titanium 30-60, hardwood 300-600.
- Chip load fz (mm/tooth) for a 6 mm cutter, scale roughly with diameter: aluminium 0.03-0.06, brass 0.03-0.05, plastics 0.04-0.08, mild steel 0.02-0.04, stainless 0.015-0.03, titanium 0.01-0.03.
- Roughing: stepdown up to 1 x D in aluminium and plastics, 0.3-0.5 x D in steel; stepover 40-50 % of D (10-15 % when slotting full width in steel).
- Finishing: leave 0.1-0.3 mm, climb milling, stepover 5-15 % of D.
- Plunge feed 30-50 % of the cutting feed; a drill is fed by the cycle, not by chip load per tooth.
- Never exceed the machine's maximum spindle speed or feed; the analysis flags both.
- Small cutters (< 3 mm) break first: shallow stepdown, light chip load, no full-width slotting.
