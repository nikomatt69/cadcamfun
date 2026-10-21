# AI package third-party notices

The proprietary [package license](LICENSE) applies to the licensor's original
material. It does not replace licenses for dependencies, upstream-derived
portions, provider catalogue data or user-installed extensions. This file
identifies direct external runtime dependencies and the bundled model metadata;
it is not a complete transitive dependency inventory or a distribution clearance.
Dependency versions are those installed when these notices were prepared on
21 October 2026; manifests and the lockfile determine the version actually used.

## nikcli / OpenCode

`@nikcli-ai/sdk-next` 1.428.0 declares MIT in its package manifest. Its installed
package does not include a standalone LICENSE file. The
[upstream license](https://github.com/nikcli/nikcli/blob/live-main/LICENSE)
identifies nikcli as a fork of OpenCode and retains these notices:

> nikcli is a fork of OpenCode (https://github.com/anomalyco/opencode), which is
> also MIT licensed. The upstream copyright notice is retained below, as required
> by that license.

Copyright (c) 2025 opencode

Copyright (c) 2025 nikcli

The MIT terms reproduced below apply to the corresponding upstream material.
The upstream branch is a provenance reference, not a claim that every later
version has the same contents. Preserve relevant notices for the pinned SDK and
its bundled dependencies when distributing it. Application host patches are
described in `src/nikcli/host-patches.ts`; they do not make upstream code
exclusively proprietary.

## Bundled models.dev metadata

`src/nikcli/models-snapshot.ts` contains compressed provider/model metadata
extracted from the pinned SDK by `scripts/generate-models-snapshot.py` at the
repository root. The generated file records the SDK version and source hash.
The data originates from [models.dev](https://github.com/anomalyco/models.dev),
whose [license](https://raw.githubusercontent.com/anomalyco/models.dev/master/LICENSE)
is MIT with this notice:

Copyright (c) 2025 models.dev

The snapshot is third-party data, not an exclusively proprietary dataset. Its
transformation and compression do not remove the upstream license. Catalogue
descriptions do not grant rights to model weights, APIs or provider trademarks.

## Other MIT dependencies

- Effect `4.0.0-rc.112`: Copyright (c) 2023 Effectful Technologies Inc.
- Zod `4.6.5`: Copyright (c) 2025 Colin McDonnell.

Their installed LICENSE files provide the MIT terms below. These copyright
notices each apply to their respective component, not to unrelated package code.

## MIT license text

For each MIT component identified above, retain its applicable copyright notice
and this permission and disclaimer text:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## AI SDK and provider packages — Apache-2.0

Direct dependencies: `ai` 7.0.127, `@ai-sdk/anthropic` 4.0.71,
`@ai-sdk/gateway` 4.0.103, `@ai-sdk/openai` 4.0.83 and
`@ai-sdk/openai-compatible` 3.0.62. Their installed manifests declare Apache-2.0.
Their LICENSE files carry this notice:

Copyright 2023 Vercel, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

The full terms are included in [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt).
Preserve any additional notices required by the actual dependency version.

## Workspace and distribution boundaries

`@cadcamfun/api` and `@cadcamfun/core` are workspace dependencies. Their applicable
terms follow the [repository license map](../../LICENSE), including the CAD/CAM
proprietary exclusions and third-party B-rep notices. A runtime dependency does
not become proprietary merely because this package imports it.

Before distributing a standalone package, bundled sidecar or installer, inventory
the actual included direct and transitive components and include their required
licenses, attributions and modification notices. These package notices alone do
not establish compliance for an entire application bundle.
