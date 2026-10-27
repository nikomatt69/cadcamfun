import { Clock, Duration, Effect } from "effect"

/**
 * A `Clock` whose sleeps return at once and are recorded in `waits` (ms): a retry schedule runs at full speed in a test and
 * the test still sees every pause it would have taken. Provide it with `Effect.provideService(Clock.Clock, recordingClock())`.
 */
export const recordingClock = (waits: number[] = []): Clock.Clock => ({
  currentTimeMillisUnsafe: () => Date.now(),
  currentTimeMillis: Effect.sync(() => Date.now()),
  currentTimeNanosUnsafe: () => BigInt(Date.now()) * 1_000_000n,
  currentTimeNanos: Effect.sync(() => BigInt(Date.now()) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => process.hrtime.bigint(),
  monotonicTimeNanos: Effect.sync(() => process.hrtime.bigint()),
  sleep: (duration) => Effect.sync(() => { waits.push(Duration.toMillis(duration)) })
})
