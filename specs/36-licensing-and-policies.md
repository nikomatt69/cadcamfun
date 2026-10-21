# Repository licensing and community policies

Date: 2026-10-21. Status: implemented; repository checks pass. The existing
`cam.turn` action-contract test failure is unrelated and remains outside scope.

## Owner-requested scope

The owner requested a proprietary license throughout `packages/ai`, an updated
main license that protects proprietary work while allowing open collaboration,
and professional repository policies. This authorizes changes to root licensing
and community files, `.github` issue/PR templates and review ownership, `packages/ai` licensing notices
and `specs/08-ai.md`. Existing CAD/CAM licenses remain in place.

## Contract

- The root `LICENSE` identifies Apache-2.0 as the default for original repository
  material the licensor is entitled to license, outside explicitly excluded paths.
- `packages/ai`, `packages/core/src/cad` and `packages/core/src/cam` retain their
  scoped proprietary terms. Third-party materials retain their original rights.
- The Apache license is reproduced without additional restrictions. Proprietary
  exclusions identify separate material, rather than modifying Apache terms.
- User data/output is not claimed merely through application use. No promise of
  blanket legal compliance, machine safety or ownership of third-party work.
- Contribution, security, conduct, support, governance, trademark, privacy and
  usage policies must describe actual scope and avoid invented operational claims.
- Community policies do not revoke open-source rights or impose extra conditions
  on Apache-licensed code. Proprietary contributions require a separate agreement;
  no blanket copyright assignment is inferred from a pull request.
- Keep provider credentials, personal information and confidential models out of
  public issue templates. Do not claim hosted GitHub settings are enabled.

## Verification

Check relative documentation links, JSON/YAML metadata and scoped license paths;
review the unchanged Apache terms and third-party exclusions. Run the AI package
typecheck and report existing test failures separately. No runtime changes are
required by this work.

Verification results: AI package typecheck passed (505 files); both manifest
license references and private flags passed; 11 documents and 40 relative links
passed; all 3 issue-template YAML files parsed and their form structure passed;
all 3 proprietary license boundaries resolve; the root and AI copies of Apache
terms are identical and retain the existing Apache terms without modification.
All 5 direct AI SDK packages carry the same verified Vercel attribution.
`cache.test.ts` and `action-contracts.test.ts`: 12 passed, 1 failed because the
existing in-progress `cam.turn` catalogue action lacks its API result contract.
No runtime source was changed and the unrelated contract was not modified.

The notices identify direct AI dependencies and bundled catalogue data; they do
not claim to be an exhaustive transitive inventory or installer compliance audit.
GitHub private reporting and branch protection were not changed or assumed.
Privacy/usage documents describe repository and local application scope; they
do not replace service-specific notices or certify a production deployment.

## Change log

- 2026-10-21: recorded the owner's expanded licensing and policy scope before
  editing shared repository files.
- 2026-10-21: implemented the Apache-2.0 default with explicit proprietary
  exclusions, recursive AI license, scoped upstream notices, community and data
  policies, issue/PR templates and review ownership. Published the owner-selected
  X contact and recorded validation and distribution/deployment limits.
