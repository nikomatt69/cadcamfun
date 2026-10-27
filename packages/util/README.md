# @cadcamfun/util

Small, dependency-free helpers shared by the packages (no Effect, nothing CAM-specific). One file per helper, imported by path
(`@cadcamfun/util/bounded-cache`), no barrel: a consumer pulls in only what it imports.

| File | What |
| --- | --- |
| `bounded-cache.ts` | LRU cache bounded by entries **and** bytes, with an eviction hook |

Concurrency (slots, shared runs, cancellation) is Effect's job: the kernel job queue uses Effect's `Semaphore` and fibers
(`packages/ai/src/kernel-job.ts`). Only what Effect has no equivalent for lives here.
