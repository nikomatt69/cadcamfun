# Contributing to CADCAMFUN

Bug reports, documentation, examples, accessibility improvements and focused
changes are welcome. Read [LICENSE](LICENSE) before reusing or changing code:
this repository contains both open-source and proprietary components.

## Licensing and contributor rights

Original contributions to Apache-2.0 areas are submitted under Apache-2.0,
unless a different agreement is explicitly made before submission. You retain
your copyright. Submission does not assign ownership to the maintainer or grant
a blanket right to relicense your work under proprietary terms.

For `packages/ai`, `packages/core/src/cad` and `packages/core/src/cam`, obtain
written authorization to work on the proprietary material and agree contribution
terms with the maintainer **before** submitting code. A pull request, issue or
commit sign-off alone is not a proprietary contribution agreement. This does not
limit rights already granted in third-party material or mandatory legal rights.

Sign off commits to open-source areas using `git commit -s` to certify the
[Developer Certificate of Origin 1.1](https://developercertificate.org/).
The sign-off certifies your authority to contribute; it does not transfer
copyright, replace a license or authorize use of proprietary material.

Preserve upstream licenses and attributions. Identify the origin and license of
third-party code, snippets, data and assets. Check AI-assisted submissions as
carefully as your own work; you are responsible for their accuracy and licensing.
Do not submit confidential prompts, customer models, keys or unlicensed material.

## Before changing code

1. Read [AGENTS.md](AGENTS.md), [the overview](specs/00-overview.md),
   [conventions](specs/01-conventions.md) and the relevant package specification.
2. Search existing issues and discuss large changes before implementation.
3. Keep changes in the owning module. Agree and document shared contracts first.
4. Write code, comments, documentation and commit messages in English. Follow
   the pinned Bun and Effect versions and use the installed Effect v4 docs.
5. Keep `.reference/` read-only. Never commit credentials or local databases.

## Verification and pull requests

Run the affected package's typecheck and relevant tests, for example:

```sh
bun --no-env-file check -p packages/ai/tsconfig.json
bun --no-env-file test packages/ai/test/cache.test.ts
```

Before a workspace typecheck or completing an API contract/schema change,
regenerate the web API reference from the repository root:

```sh
bun --no-env-file packages/web/script/generate-api-reference.mjs
```

Use a small pull request that explains the problem, resulting behavior, tests and
known limitations. Include screenshots for visual changes and reproduce bugs
with synthetic data. Update the owning spec and relevant documentation. Report
failed checks honestly, including failures already present in the checkout.

Maintainers review changes before merging. Submission does not guarantee
acceptance, a release date, support or compensation. Community participation is
covered by the [code of conduct](CODE_OF_CONDUCT.md); vulnerabilities go through
the [security policy](SECURITY.md), not public bug reports.
