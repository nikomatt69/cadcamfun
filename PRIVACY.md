# Repository privacy and application data practices

Last updated: 21 October 2026.

## Scope and contact

This document describes collaboration in this repository and the data flows of
the local application code. Project maintainer: Nicola Mattioli,
[@nikomatt69 on X](https://x.com/nikomatt69). Use the
[private contact guidance](SUPPORT.md#private-contact) for privacy inquiries and
send only enough information to identify the request; do not post identity
documents, credentials or customer models publicly.

This is not a privacy notice for every deployment, provider or hosted service.
A company or person operating such a service must identify its own controller,
processing purposes, legal bases, recipients, retention and applicable rights
before collecting personal data. A software license alone is not consent to
process personal data. Nothing here waives rights under applicable privacy law.

## Repository participation

GitHub receives account, usage and submission data under its own
[privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
Issues, pull requests, comments, public profile details and commit metadata may
be public. A DCO sign-off includes the name and email you choose for your commit;
GitHub offers a no-reply commit email. Public version history, forks, archives
and caches may retain contributions indefinitely. Deleting an issue or rewriting
one repository cannot ensure removal of copies held by others.

Maintainers use submissions to review work, resolve reports, moderate the
community and maintain the project. Private correspondence is used to handle
the inquiry, security report, permission request or conduct complaint. Disclose
only necessary details. Access and sharing should be limited to what is needed
for that purpose or a legal obligation. No fixed deletion period or absolute
confidentiality is promised by this repository policy.

X handles contact messages under its own
[privacy policy](https://x.com/en/privacy). A direct message is not a guarantee
that information is hidden from the platform operator. Agree another channel
before sending sensitive records.

## Local application storage

Projects, drawings, toolpaths, libraries and related application records are
stored in the configured local SQLite database. The embedded nikcli host also
keeps local session, message and configuration state in the application's
isolated data directory. These records can contain personal or confidential data.
OS accounts, backups, device management and installed extensions affect access.
Local-first does not mean every feature operates without network traffic.

Provider API keys can persist in the app's `ai/credentials.json`; the
implementation writes owner-only file permissions on platforms that support
them. Supported OAuth grants persist separately in the isolated host's
`auth.json`. These files are not encrypted by that JSON persistence mechanism.
File permissions are not a substitute for disk encryption or a secure OS account.
Do not assume every secret is stored exclusively in an OS keychain.

## AI, integrations and network recipients

When you use AI, the selected provider or configured gateway receives the
request and associated connection metadata. Requests may include prompts,
conversation history, attached content, drawing/toolpath context and requested
viewport images. nikcli is the embedded host, not necessarily the remote model
provider. Review the selected provider's terms, retention, training settings and
data location before submitting confidential or personal information; this
repository does not promise zero retention or exclusion from provider training.

Search, MCP servers, mods, plugins and workflows can process data according to
their configured tools and permissions. Catalogue refresh can contact models.dev.
Account connections, GitHub synchronization, updates, billing and device pairing
have their own recipients and data flows when used. A companion connection sends
data to the paired desktop/gateway. Check the destination and permissions before
connecting external services; provider and plugin behavior is not covered by an
assurance that data never leaves the device.

The sidecar's OpenTelemetry exporter is disabled unless an operator configures
an OTLP endpoint. If configured, traces, metrics and logs can be exported to that
endpoint. Traces carry the shape of an operation (route template, status, provider,
model, tool name), never its content: an attribute whose key names a prompt, a
payload or a credential is dropped before export. The same numbers are readable
locally at the loopback `GET /metrics` endpoint, in the Prometheus exposition
format. This policy does not claim the data is anonymous, that every collector
has the same retention, or that a particular UI switch controls all telemetry.

## Retention, deletion and rights

Local records remain subject to application actions, local storage, host session
state and backups. Removing a project is not a promise that all related host
history, logs, exports, backups or remote provider records are erased. Revoke
provider access and remove stored credentials when retiring an installation;
remove local application data and backups according to your needs and any
retention obligations. Provider-side requests must be addressed to that provider.

For repository records handled by the maintainer, use the private contact above
to request information, correction, deletion or other rights available under
applicable law. Requests may require proportionate verification and may be
limited by legal obligations, other people's rights and the nature of public
version history. You may contact the competent data-protection authority where
applicable. For data held by GitHub, X, your employer, an application operator or
an AI provider, contact that party through its own privacy process.

This document describes practices; it does not itself configure privacy controls,
delete records, replace an operator's required notice or certify legal compliance.
