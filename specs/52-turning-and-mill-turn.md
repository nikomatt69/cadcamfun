# 52 — Turning and mill-turn in the CAM kernel

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes M3 and K6 of
[spec 33](33-kernel-gap-analysis.md); extends [spec 29](29-native-cam-kernel.md). Owner: WP2 (`cam/kernel/turning.ts`,
`cam/generator/lathe.ts`, `cam/viewer/{turn-mill,turned-profile,lathe-tools}.ts`, `cam/post/*`). Depends on
[53](53-stock-simulation-verification.md).

## 1. Where it stands (verified)

- `kernel/turning.ts`: **external turning preview** in diameter X / axial Z with an ideal point tool (`TurnPoint`, `TurnStock`,
  `TurningMachine`, `TurningJob`): face skim, diameter-bounded roughing, analytic removed / remaining / unmachined partition;
  `planBoring` bores a declared pilot to a finished internal profile (preview, not a job operation, not `cam.turn`). Release
  stays `preview`.
- Legacy `generator/lathe.ts` emits facing, turning, boring, threading, grooving, parting, knurling without kernel evidence.
- `LATHES`: `lathe-standard` (2 axes, C spindle, X/Z turret), Mazak INTEGREX i-200 class and Okuma MULTUS B300II class mill-turns
  (B head, Y axis, C spindle); the milling kernel refuses a turning centre with the reason.
- Viewer: `turn-mill.ts`, `turn-mill-view.ts`, `turned-profile.ts`, `lathe-tools.ts` (display).
- Posts: no turning-specific canned cycles (`G71/G72/G73/G70/G76/G75/G74`) are verified in the kernel path (confirm per post).

## 2. Work items

### 2.1 Tooling

| ID | Item | Gate |
|---|---|---|
| T1 | **Insert and holder model** (ISO 1832 shape, nose radius, inscribed circle, clearance angle, ISO 5608 holder: approach angle, tool angle limits, shank), grooving and threading inserts, boring bars (diameter, overhang, minimum bore), live tools. Tool assemblies already exist for milling (`kernel/assembly.ts`); reuse. | insert silhouette (swept shape) and limit angles computed for 10 standard inserts and checked against the ISO tables |
| T2 | **Nose-radius compensation**: geometric offset of the programmed profile by the nose radius for finishing (path offset, not only `G41/G42`), with the undercut / back-turning limit check (the tool cannot reach angles beyond its relief). | a 45° chamfer and an R5 arc finished with R0.8: profile error ≤ 0.002 mm against the ideal profile, back-angle violations are reported |

### 2.2 Operations

| ID | Item | Gate |
|---|---|---|
| T3 | **Facing, OD/ID roughing** with multiple stock removal strategies (parallel to Z, to X, contour-parallel/"G73"), pocketing in grooves, corner clearing, plunge roughing, **finishing** with spring pass, entry / exit arcs, chip breaking (feed pauses). Bar stock, forged/cast stock (a stock profile), chuck zones. | each strategy's removed volume equals the analytic partition (existing invariant: removed + remaining + unmachined); no gouge of the finished profile |
| T4 | **Grooving** (OD, ID, face; plunge, zig-zag, multiple tools), **parting / cut-off** with a stock-catcher / bar-puller sequence. | groove geometry exact; parting leaves the declared stub |
| T5 | **Threading**: ISO metric, UN, Whitworth, trapezoidal, NPT/tapered, multi-start, external / internal, infeed methods (radial, flank, alternating), spring passes, thread depth from the standards in `fasteners.ts` / `thread.ts`; explicit passes (not only `G76`), with `G76` emitted where the controller has it. | pitch and depth from tables; pass count and depth schedule follow the infeed law; the replay of the NC returns the programmed lead within 1e-4 mm/rev |
| T6 | **Drilling, tapping, reaming on axis** (spot, peck, deep hole) and **boring** promoted from the preview to a job operation with evidence, cycles via the shared `cycles` templates. | `cam.manufacture` on a lathe job returns evidence for each op |
| T7 | **Part transfer**: sub-spindle pick-up, synchronised spindles, back-working, re-chucking with stock redefinition and a new work offset. | transfer sequence NC and stock model continue across the transfer; the remaining stock after transfer matches the part length |

### 2.3 Mill-turn

| ID | Item | Gate |
|---|---|---|
| M1 | **C-axis positioned milling** on face and cross (cylindrical) with polar (`G12.1`) and cylindrical (`G07.1`) interpolation, live-tool drilling and milling, **Y-axis** offsets, **B-axis** tilt for off-axis holes. Reuses the milling operations through a rotary frame mapping. | a cross hole at 60° and a face pocket produce NC whose replay (spec 53 V3) removes the analytic volume ± bound |
| M2 | **Mode switching sequences per controller**: turn → C-mode → milling → turn (Fanuc `M-codes`, Mazak, Okuma, Siemens `TRANSMIT/TRACYL`), spindle/brake changes, and returned positions; per-post tests. | sequences are present, orderly and reversible in golden NC for each supported post |
| M3 | **Machine bodies for collision**: chuck jaws (soft-jaw envelope), tailstock/quill, steady rest, turret and tool disc, sub-spindle, B-head (extends `machine-clearance`), bar length vs chuck. | collision between a long boring bar and the chuck is found; clearing the setup passes |
| M4 | **Stock tracking in simulation**: revolved stock as a profile (analytic) for turning, a dexel / voxel stock for milled features in a mill-turn run; consistent hand-off. | after turning then cross-milling, the stock model equals the profile ∩ the milled removal |

### 2.4 Posts and output

| ID | Item | Gate |
|---|---|---|
| P1 | **Turning posts**: Fanuc (0i/31i) with diameter programming `G96/G97`, constant surface speed with limit `G50 S`, feed per rev `G99`; Mazak (ISO/EIA), Okuma OSP, Siemens, Haas ST; canned cycles optional (explicit-moves fallback). | golden NC per post and operation; replay validates the diameter programming |
| P2 | **Tool table and offsets** for turrets: tool number + offset pairs (`T0101`), turret station map, geometry vs wear offsets. | job returns the turret map |

## 3. Release path

Today `release: "preview"`. A turning program may be labelled above `preview` only when: T2 (profile error) and the removal
partition hold, `machine-clearance` with chuck / tailstock bodies (M3) passes, and the post has a golden replay; **qualification
on a real machine** (spec 55 §6) is what upgrades beyond `verified-model`.

## 4. Honest limits

- Turning with live tooling is planned in an ideal kinematic model; machine-specific collision fidelity depends on the bodies in
  the preset.
- Eccentric turning, hard turning with CBN dynamics, and thread whirling are not included.

## 5. Order

T1 → T2 → T3 → T5 → T4 → T6 → P1/P2 → M3 → M1 → M2 → M4 → T7.
