/**
 * "Run the whole program": playback that stops at each collision with the event in view, waits a moment and goes on by itself, so a
 * long program is watched from the first move to the last without pressing Play at every stop.
 */

/** How long the playhead rests on a stop before the run goes on. */
export const RUN_THROUGH_PAUSE_MS = 1500

export interface RunThroughState {
  /** The run is on (the person started it and has not paused or moved the playhead since). */
  readonly runThrough: boolean
  readonly playing: boolean
  readonly time: number
  /** Where the run stopped. */
  readonly stoppedAt: number
  readonly duration: number
}

/** The run goes on only if nothing happened during the pause: still on, still stopped, the playhead where it stopped, not at the end. */
export const shouldResume = (state: RunThroughState): boolean =>
  state.runThrough && !state.playing && state.time === state.stoppedAt && state.stoppedAt < state.duration
