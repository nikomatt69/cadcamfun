# WP3 contract recovery handoff

Only packages/api is edited by this recovery. Shared specifications, root files,
lockfiles and other work packages are unchanged. No legacy files are modified.

## Recovered versus new

Initial inspection found production-costs (21 operations) and library (8 operations)
already composed into Api, alongside the existing core contracts. Baseline checks
passed: typecheck, 3 tests, 48/195 inventory files covered. The worktree is untracked,
so Git cannot attribute these recovered implementations to a prior commit.

During inspection, files, notifications, organizations and plugins contracts and
their Api composition appeared in the worktree. They are preserved, not claimed
as newly implemented here. Their complete wire parity has not been audited here.

## Sidecar integration

- New `auth` group: forgotPassword, resetPassword, sendMagicLink,
  sendVerificationEmail, verifyEmail, signout, registerPasskey.
- New `analytics` group: systemMetrics and track; uses Authorization middleware.
- New `waitlist` group: join, with 201 success and 400/409/500 failures.
- Extended `plugins`: install (multipart file array, 201), bootstrap (JavaScript
  response and text 400/404/500 errors), serve (byte stream with dynamic
  content-type/cache-control headers).
- signout returns HttpApiSchema.withHeaders with a set-cookie array. The legacy
  passkey handler is explicitly a 501 error, not a fabricated success contract.

Auth and waitlist groups are public at the legacy application-auth level. Desktop
transport bearer authentication remains the sidecar's responsibility. Existing
plugins middleware is preserved.

## Remaining work

See `inventory-gaps.json` for exact missing paths and methods, generated from the
inventory against OpenAPI. This measures declarations, not handler implementation
or full payload parity. Unknown inventory methods still require source auditing.
Coverage no longer silently ignores missing OPTIONS operations.

Final validation: `bun run typecheck`, `bun test` and `bun run coverage --missing`
all pass. There are 8 passing tests across 4 files, with one OpenAPI snapshot.
Coverage is 68/195 inventory files (35%); 127 remain missing. Thirteen newly
covered files come from this recovery's auth/analytics/waitlist/plugin additions;
the other seven beyond the 48-file baseline come from the preserved contracts
that appeared during inspection. The complete gap list is in inventory-gaps.json.

The specification-only `/settings`, `/files/import`, `/files/export` and
`/costs/estimate` have no legacy inventory contract and no agreed concrete payload
in the shared spec. They remain unimplemented rather than inventing wire formats
without the required cross-WP specification change. Existing production-costs
and library contracts are preserved, including their legacy JSON data slots.

Missing auth signin/signup/session/magic-link verification, organization nested
routes/invitations, most analytics and cloud billing/marketplace/webhooks remain.
Background delegations failed without delivering implementations; none of their
proposed work is counted as complete.
