# Holes

- Use the `drill` operation: the generator emits G81 (simple), G82 (dwell), G83 (peck) or G73 (chip break) from the depth and diameter.
- Peck when the depth is more than about 3 x diameter; clear chips every 1-2 x diameter deeper than that.
- Drill the full depth plus the point: a 118 degree point adds about 0.3 x D below the nominal bottom for a through hole; leave the tip inside the spoilboard.
- Holes larger than about 12 mm: pilot drill first or use a pocket / helical interpolation with an end mill.
- Order holes nearest-first (the generator does) and rapid only above the surface: a rapid in material is an error in the verification.
- Always give the verification the real `cuttingLength` of the drill: a hole deeper than the flutes drags the shank through the wall.
