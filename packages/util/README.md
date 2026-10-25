# @cadcamfun/util

Small, dependency-free helpers shared by the packages (no Effect, nothing CAM-specific). One file per helper, imported by path
(`@cadcamfun/util/semaphore`), no barrel: a consumer pulls in only what it imports.

| File | What |
| --- | --- |
| `semaphore.ts` | FIFO counting semaphore with abortable waiting: bounds how many heavy jobs run at once |
| `bounded-cache.ts` | LRU cache bounded by entries **and** bytes, with an eviction hook |
| `single-flight.ts` | Identical concurrent work runs once; every caller gets the result, progress and its own abort |
