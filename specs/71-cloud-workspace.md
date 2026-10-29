# Personal cloud workspace and desktop synchronization

Status: in progress. Owner requested a Docker-hosted CADCAMFUN workspace usable by the mobile companion while the desktop is off, with project changes delivered to the local desktop. Implementation authorized on 2026-10-29 after a four-agent analysis.

Deployment direction: the owner has no VPS and asked about Cloudflare Durable Objects. Target Cloudflare Workers + a SQLite-backed Durable Object for workspace coordination/durable checkpoint references + R2 for immutable checkpoint bytes/assets + a Cloudflare Container for the existing Bun runtime. A Durable Object cannot directly execute Bun; Container disk is ephemeral. A successful hosted mutation must cross a durable persistence barrier before acknowledgement, with checkpoint restore before readiness. Do not present container sleep or an R2 filesystem mount as durable SQLite storage. Local Compose remains useful for validation and alternate hosting.

## Scope and ownership

This owner-requested cross-WP integration owns: WP4 sidecar hosted lifecycle, configuration, scoped gateway, cloud services/repositories/HTTP handlers and wiring; WP3 additive cloud API schemas and generated clients/reference; WP11 portable project snapshots, verified object exchange and synchronization; WP0 narrow persistence additions if needed; WP6 cloud connection and project synchronization controls; WP13 hosted connection transport and send-to-desktop controls; WP10 root Docker/Compose files, deployment scripts and documentation. Existing unrelated changes must be preserved. Finished specs are not reopened.

## Required behavior

1. One independent, headless Bun/Effect workspace runs in Docker without Tauri or an open stdin. The desktop lifecycle remains unchanged. Both modes use the existing domain services, kernel workers and migrations.
2. The hosted raw API stays private. A stable-port scoped gateway is the public application boundary, behind an HTTPS proxy. Hosted requests require a valid configured-owner identity and a revocable device grant; the local-profile/session fallback is unavailable at this boundary. Bootstrap and device enrollment are private administrative actions.
3. Mobile keeps pinned local pairing. Hosted connections use platform HTTPS trust and hostname verification, with a persistent workspace ID independent of the TLS certificate. Missing/expired identity fails closed for hosted requests. Tokens stay in secure storage. Existing reconnection and stream recovery remain in use.
4. Desktop and cloud keep independent SQLite databases. Synchronization exchanges verified Git-compatible project objects and required content-hashed assets, never live database files. Initial publish/clone preserves project/entity IDs and common history. Credentials and installation settings are not project content.
5. A portable snapshot excludes installation-local ownership and revision metadata. Applying a transferred version and advancing its local Git ref must be atomic. A successful import must leave a clean working copy despite different installation user IDs. Shared library divergence must be reconciled or reported, never silently overwrite unrelated local work.
6. Desktop initiates outgoing network connections. Fetch stores an immutable remote version separately from applying it. Dirty local work or an active mutation blocks application. Ref/revision checks run after network I/O. Divergent histories produce an explicit conflict or reviewed merge; they never silently replace a branch.
7. Mobile send-to-desktop creates a durable project commit. Delivery distinguishes pending, downloaded and applied; a PC that is off remains pending. Repeated transfers/acknowledgements are idempotent and receipts survive restart. A delivery is applied only after required assets and database changes succeed.
8. Hosted data, AI state, uploads and device revocations persist outside the container. Deployment includes backup/restore instructions and a Linux runtime/worker smoke check. Single active SQLite runtime initially; no cross-host shared live database.

## API seam

Add a schema-first `cloud` API group. Local authenticated connection management stores a validated HTTPS origin, workspace ID and a device grant (the grant is write-only and stored with owner-only permissions). Local project controls publish, fetch, apply and clone from that remote. Hosted transport endpoints expose owner-authorized catalog/object transfers and delivery receipts, but never connection credentials or administrator pairing. The same local operations power desktop UI and tests. Mobile receives only project delivery controls in the hosted gateway allow-list. Endpoint names and generated clients are implementation-owned; errors preserve unauthorized, dirty/conflict, missing-asset and remote-unavailable outcomes.

## Verification and acceptance

- Hosted process survives stdin EOF, serves authenticated scoped requests, refuses missing/invalid identity and device grants, stops cleanly on SIGTERM, and persists data across restart.
- Two separate SQLite installations with different local user IDs: initial publish/clone, cloud modification while PC is off, download, safe apply and matching clean snapshots/history. Include required uploaded assets.
- Dirty editor, edits during network fetch, divergent branches/shared library, invalid hashes, missing assets, failed database apply, interrupted transfer/retry, entity deletion and delivery acknowledgement recovery.
- Mobile local pinning regression, hosted PKI/hostname validation, certificate renewal without workspace/cache identity change, expired OAuth denial, stream recovery and send-to-desktop state. Physical cellular acceptance is separate from source/bundle checks.
- Regenerate API clients and web API reference, retain freshness gates, run targeted tests and affected package typechecks, build desktop/mobile bundles, and build/run the Docker image when a Docker engine is available.
- Online deployment and physical-device acceptance remain incomplete until verified against an actual configured server and device. Do not claim those outcomes from unit tests.

## Change log

- 2026-10-29: established the owner-authorized cross-WP contracts before implementation.
