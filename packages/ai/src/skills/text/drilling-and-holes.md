# Holes

- Use the `drill` operation: the generator emits G81 (simple), G82 (dwell), G83 (peck) or G73 (chip break) from the depth and diameter.
- Peck when the depth is more than about 3 x diameter; clear chips every 1-2 x diameter deeper than that.
- Drill the full depth plus the point: a 118 degree point adds about 0.3 x D below the nominal bottom for a through hole; leave the tip inside the spoilboard.
- Holes larger than about 12 mm: pilot drill first or use a pocket / helical interpolation with an end mill.
- Order holes nearest-first (the generator does) and rapid only above the surface: a rapid in material is an error in the verification.
- Always give the verification the real `cuttingLength` of the drill: a hole deeper than the flutes drags the shank through the wall.

## Hole finishing in the kernel

The kernel (not only the legacy generator) makes holes in three steps, and picks the tool for each one from the hole's own note:

- **Drill** (`drill`): the tap drill, the clearance hole or the pilot. G81, G82 (dwell), G83 (peck) or G73 (chip break).
- **Ream** (`drill` with `cut: "ream"`): a bore with an ISO fit (H7 and the like) is drilled under size and reamed to size; the reamer is fed in and back out (G85) so the edge does not mark the finished bore.
- **Tap** (`drill` with `cut: "tap"`): rigid tapping, G84, with the feed = pitch x spindle speed (the spindle reverses at the bottom: a control without G84 refuses the cycle rather than losing the reversal). The kernel taps a threaded hole when the machine's control can, and mills the thread otherwise.

The tap's bottom is the thread's bottom plus the tap's lead (2.5 pitches for a form C tap), so a blind thread is not cut through the hole's floor. The thread's pitch comes from the hole's note (ISO coarse when it is not given).
