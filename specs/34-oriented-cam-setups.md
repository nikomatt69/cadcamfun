# Oriented manual CAM setups

Status: implementation in progress. Owner request: continue the CAM accessibility session and enable lateral setups without invented fixtures or full-part completion claims.

This concrete increment extends spec 29, not the ordered RM acceptance gates. Owners: WP2 CAM core and tests, WP3 existing manufacturing schemas/generated clients, WP4 existing manufacturing adapters, WP6 kernel settings/panel and translations, WP8 existing manufacturing guidance.

## Contract

- `setupOrientation?: "+Z" | "-Z" | "+X" | "-X" | "+Y" | "-Y"` identifies the CAD direction facing the spindle. Omitted means the existing +Z setup. Each request creates one separate three-axis program requiring manual refixturing; it does not emit rotary movements.
- The core rotates part meshes, exact machining features and the stock box together using a right-handed signed permutation. Explicit operations use the oriented setup coordinates before the usual stock-origin subtraction. CAD data stays unchanged.
- Artifacts retain the orientation. Their origin and stock bounds use the oriented coordinates. The NC identifies a manual setup. The desktop restores the choice and invalidates evidence when it changes.
- Downward-facing mesh triangles above the underside make part coverage unresolved even in the default setup: matching its top height field does not verify hidden surfaces. Absence of this finding is not an exact accessibility proof.
- A lateral/bottom setup has unresolved workholding and full-part coverage claims. No fixture is manufactured from a description, and no collection of programs is certified as a complete process. Height-field replay cannot certify hidden surfaces, thin fins or helical undercuts.
- The assistant can plan, edit process parameters and save separate programs through the existing manufacture actions. Unsupported rotary/helical work remains explicit; existing NC is not retroactively verified.

## Verification

Core tests must check independent coordinates, stock placement, lateral-hole planning, emitted/replayed NC, input immutability, deterministic identity, and preview release for unresolved setup evidence. Shared schema/adapters and desktop request/restore controls must preserve the orientation. Run relevant workspace typechecks, tests and generated-client checks.

## Change log

- 2026-10-19: specified the scoped manual-setup increment before cross-WP changes. Global RM statuses unchanged.
