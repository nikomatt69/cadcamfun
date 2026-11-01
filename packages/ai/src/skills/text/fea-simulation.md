# Finite-element studies: static stress, thermal, thermal stress, modal, buckling

One call, `cad` action `simulate`, on the exact solid of one element (`id`) or a history sent inline. It solves with quadratic tetrahedra
on a grid-aligned mesh; lengths mm, forces N, stress MPa, temperature °C, `convection.coefficient` W/(m²·K), `flux` W/m², `heat.power` W.
Nothing is stored. Read the unit-free truth first: results are screening-grade (spec 48), never a certification.

## The loop that improves a study
1. `op: library` lists materials (E, yield, ultimate, expansion, conductivity, service limit). Pick the grade; override only what the user gave.
2. Get the bounds from `cad` action `exact` (bounds, face names). Regions are in drawing mm: `plane {axis,value}` for a flat face,
   `box`, `sphere`, `cylinder {axis,center:[a,b],radius}` for a hole wall (`center` = the two other coordinates in x,y,z order), `all`.
   A region that selects nothing is refused with the reason: raise `tolerance` or fix the value.
3. `op: run` with supports and loads. Read `findings` first: each has a severity and a `suggestion`.
4. Never quote a peak stress from one mesh: `op: converge` re-solves on finer meshes. `converged: true` means the last refinement moved the
   metric by less than `tolerance`; `singularity: true` means the peak keeps growing while the displacement has settled (point load, sharp
   re-entrant corner, support edge): spread the load over a face, add a fillet, or judge stress away from it. `extrapolated` is the
   Richardson estimate at zero element size.
5. If the safety factor fails or the part is far over-designed, change the part (`cad_edit` parametric_update: thickness, fillet radius, rib,
   hole) or the grade (`op: materials` ranks `candidates` by safety factor and mass and names the lightest that reaches `targetSafety`), then run again.
   Compare runs by the numbers, never by memory; stop when the findings are only informational.

## Analyses
- `static`: needs `supports` (at least one, so the part cannot move as a rigid body) and `loads`: force (total N over the region), pressure
  (MPa pushing in), torque (N·mm about axis through `center`), gravity. `dofs` on a support restrict directions: one axis on a plane is a
  frictionless/symmetry support; `value` prescribes a displacement.
- `thermal`: steady conduction. Needs a heat path: a `temperature` or `convection` boundary. `flux` and `heat` are sources.
- `thermal_stress`: the temperature field becomes a thermal strain (`referenceTemperature`, default 20 °C, is stress-free). Give `thermal`
  boundaries (solved first) or `uniformTemperature`. Without supports the part expands freely (self-equilibrated stress only); with supports
  that stop the growth, the stress is about E·α·ΔT (clamped bar: −E·α·ΔT). Fixes: release one support along the growth, add a slot or
  bellows, cut ΔT, choose a lower E·α grade (`op: materials`).
- `transient_thermal`: `transient {duration, steps, stressSteps}` from `initialTemperature`; steps are backward Euler. With `stressSteps` it
  also solves thermal stress at those instants and reports the worst one (`stressTimeS`) plus a `history`. Use for shocks, warm-up, cooling.
- `modal`: `modes` (default 6) natural frequencies in Hz. Without supports it is free-free (six rigid modes at 0 Hz are listed, flagged `rigid`).
- `buckling`: factors by which the applied loads (and thermal strain) reach elastic buckling; a result below 1 buckles. Needs compression
  (otherwise refused). Linear theory: apply a knock-down for imperfections.

## Criteria (Fusion's stress types)
`criterion` picks the measure judged against the allowable: `von_mises` (default for ductile grades), `tresca` (conservative maximum shear),
`max_principal` (brittle in tension), `mohr_coulomb` (default for brittle grades, uses tensile and compressive strength). The summary also
reports Tresca, maximum and minimum principal stress, and the safety factor with its location.

## Limits you must report
Boundaries are stepped by the grid (`mesh.volumeRatio` shows how much of the solid the mesh holds); refine before trusting local stress.
Linear elastic, small displacement, isotropic, one body (assemblies, contact, plasticity, creep and fatigue are not modelled). Point
supports and point loads are singular. Say which of these applies when you give a number.
