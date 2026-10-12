# Native AI design contracts

Status: **specified; implementation pending**. These specifications deepen the native AI integration with **Effect 4.0.0-rc.112** and **nikcli sdk-next 1.428.0**. They are not an independent task board or execution sequence.

## Authority

Read [the ordered roadmap](../roadmap/README.md), [its process](../roadmap/00-how-to-follow.md), [conventions](../01-conventions.md) and [the umbrella contract](../28-native-ai-architecture.md) first. The current implementation step is RM-01. Only the controlling RM step's deliverables/owners may be implemented, after its dependencies are satisfied. A published design is not implemented or verified runtime behaviour.

## Contract map

| Design | Contract | Controlling RM step | Implementation prerequisites |
| --- | --- | --- | --- |
| AI-01 | [Actions and execution](01-actions-and-execution.md) | [RM-01](../roadmap/01-action-catalogue.md) | Current first step |
| AI-02 | [Setup and domain parity](02-setup-and-domain-parity.md) | [RM-02](../roadmap/02-multi-op-setup.md), [RM-03](../roadmap/03-api-parity.md) | RM-01 for tools; RM-03 before persisted setup completion; pure work parallel only on disjoint files |
| AI-03 | [Native workspace review](03-native-workspace-review.md) | [RM-04](../roadmap/04-desktop-parity.md) | RM-03 receipts/revisions and each vertical's routes |
| AI-04 | [Engineering libraries](04-engineering-libraries.md) | [RM-05](../roadmap/05-library-write.md) | RM-01 and WP0 contracts |
| AI-05 | [Design intent and context](05-design-intent-and-context.md) | [RM-06](../roadmap/06-context-awareness.md) | RM-01 |
| AI-06 | [Owner-safe lifecycle](06-owner-safe-lifecycle.md) | [RM-07](../roadmap/07-ai-lifecycle.md) | RM-01; receipt guarantees from RM-03 |
| AI-07 | [Companion continuity](07-companion-continuity.md) | [RM-08](../roadmap/08-mobile-codriver.md) | RM-07 recovery |
| AI-08 | [Precision modelling and CAM](08-precision-modelling-and-cam.md) | [RM-09](../roadmap/09-cad-cam-depth.md) | RM-02 for core; RM-03/RM-06 and core acceptance before precision integration |
| AI-09 | [Evaluation and observability](09-evaluation-and-observability.md) | [RM-10](../roadmap/10-observability.md) | RM-07; fixtures ship with each earlier increment |
| AI-10 | [nikcli and plugin adapters](10-nikcli-and-plugin-adapters.md) | [RM-11](../roadmap/11-nikcli-bridge.md) | RM-01 catalogue, RM-03 routes and pinned SDK compatibility |

## Delivery discipline

- One action catalogue, pure CAD/CAM implementation, typed Effect execution and native nikcli decisions. No replacement framework or permanent duplicate dispatcher.
- Each module's interface is the test surface. Deepen implementations that earn locality/leverage; new seams require a second adapter or explicit hypothetical rationale.
- Publish owner/contract amendments before cross-WP changes. Stop after the current RM Verify gate unless asked to continue; only then update that RM row and Change log.
- Precision is measured against declared achievable dimensions/features/tolerances, not inferred from attractive meshes or successful schema decoding. Exact B-rep and machine-grade parity remain separately gated.
- Use Monitor for tests/typechecks/builds and installed Bun scripts with `--no-env-file`. Offline fake-provider integration, stochastic model evaluations, native packaging and machine validation are different evidence classes.
- Publication verification checks document structure, source paths, relative links, sequence/status consistency and whitespace. It does not claim runtime tests pass.

## Change log

- 2026-10-12: published ten design increments mapped to the existing RM sequence; no RM implementation status changed.
