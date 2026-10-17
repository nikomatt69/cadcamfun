import { Show, type JSX } from "solid-js"
import { Pause, Play, Rewind, FastForward } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import "../styles/simulation-mini-player.css"

interface SimulationMiniPlayerProps {
  readonly playing: boolean
  readonly time: number
  readonly duration: number
  readonly onPlayingChange: (playing: boolean) => void
  readonly onSeek: (seconds: number) => void
}

const clock = (seconds: number): string => {
  const s = Math.floor(Math.max(0, seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** One clock with the CAM toolbar; seeking pauses so the requested frame stays visible. */
export function SimulationMiniPlayer(props: SimulationMiniPlayerProps): JSX.Element {
  const duration = () => Number.isFinite(props.duration) ? Math.max(0, props.duration) : 0
  const time = () => Math.max(0, Math.min(duration(), Number.isFinite(props.time) ? props.time : 0))
  const seek = (seconds: number) => {
    props.onPlayingChange(false)
    props.onSeek(Math.max(0, Math.min(duration(), seconds)))
  }
  const toggle = () => {
    if (!props.playing && time() >= duration()) props.onSeek(0)
    props.onPlayingChange(!props.playing)
  }
  return (
    <div class="cam-mini-player" role="group" aria-label={t("cam.player.label")} data-testid="simulation-mini-player">
      <button type="button" disabled={duration() === 0 || time() === 0} title={t("cam.player.back")} aria-label={t("cam.player.back")} onClick={() => seek(time() - 5)}>
        <Rewind size={13} aria-hidden="true" />
      </button>
      <button type="button" class="cam-mini-player__toggle" disabled={duration() === 0} title={t(props.playing ? "cam.player.pause" : "cam.player.play")} aria-label={t(props.playing ? "cam.player.pause" : "cam.player.play")} onClick={toggle}>
        <Show when={props.playing} fallback={<Play size={14} fill="currentColor" aria-hidden="true" />}><Pause size={14} fill="currentColor" aria-hidden="true" /></Show>
      </button>
      <button type="button" disabled={duration() === 0 || time() >= duration()} title={t("cam.player.forward")} aria-label={t("cam.player.forward")} onClick={() => seek(time() + 5)}>
        <FastForward size={13} aria-hidden="true" />
      </button>
      <input type="range" min="0" max={duration()} step="any" value={time()} disabled={duration() === 0}
        aria-label={t("cam.player.seek")} aria-valuetext={`${clock(time())} / ${clock(duration())}`}
        style={{ background: `linear-gradient(to right, #60a5fa ${duration() > 0 ? time() / duration() * 100 : 0}%, #ffffff30 0%) center / 100% 3px no-repeat` }}
        onPointerDown={() => props.onPlayingChange(false)} onInput={(event) => seek(Number(event.currentTarget.value))} />
      <output class="cam-mini-player__time" aria-live="off">{clock(time())}<span> / {clock(duration())}</span></output>
    </div>
  )
}
