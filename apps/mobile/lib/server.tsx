import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react"
import { AppState, Platform } from "react-native"
import { CompanionClient, CompanionError, type AiStatusInfo } from "./client"
import { launchPairLink, nativeAvailable, pinnedTransport, warmLocalNetwork } from "./native"
import { pairingStore } from "./storage"
import { desktopLabel, firstReachable, parsePairingLink, type Pairing } from "./pairing"
import { drainQueueWith, refreshOfflineQueueCount } from "./offline-queue"
import { uiPreferencesReady, useUIStore } from "./store"
import { ServerContext, type Connectivity, type DesktopBootstrap, type ServerValue } from "./server-context"

export type { Connectivity, DesktopBootstrap, ServerValue }
export { useServer } from "./server-context"

/**
 * Pairing lifecycle + health probing (nikcli: server-provider).
 *
 * - Pairing survives an offline desktop; probes are owned, cancellable and
 *   never overlap (generation + AbortController, stale-client guard).
 * - Failures back off exponentially (1s → 30s max) instead of hammering a
 *   sleeping Mac; foregrounding re-probes immediately and drains the offline
 *   assistant queue.
 * - Background sets connectivity to "background" (never "offline") so the UI
 *   does not flash error banners when the app is suspended.
 * - 401/403 maps to "auth-required" (revoked device token → re-pair), other
 *   failures to "offline". Boot/parse failures map to "error".
 */
export function ServerProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<Pairing | null>(null)
  const [connectivity, setConnectivity] = useState<Connectivity>("disconnected")
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [ai, setAi] = useState<AiStatusInfo | null>(null)
  const [bootstrap, setBootstrap] = useState<DesktopBootstrap | null>(null)
  const [bootstrapLoading, setBootstrapLoading] = useState(false)
  const [booting, setBooting] = useState(true)

  const generation = useRef(0)
  const mounted = useRef(true)
  const probeGeneration = useRef(0)
  const probeController = useRef<AbortController | null>(null)
  const failures = useRef(0)
  const probeError = useRef<Error | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const storage = useRef<Promise<void>>(Promise.resolve())
  const configRef = useRef<Pairing | null>(null)
  configRef.current = config
  const currentClient = useRef<CompanionClient | null>(null)
  const checkRef = useRef<(pairing: Pairing) => Promise<Pairing | null>>(async () => null)

  const client = useMemo(
    () => (config && (nativeAvailable || Platform.OS === "web") ? new CompanionClient(pinnedTransport(config)) : null),
    [config],
  )
  currentClient.current = client

  const storePairing = useCallback((operation: () => Promise<void>) => {
    const next = storage.current.catch(() => undefined).then(operation)
    storage.current = next
    return next
  }, [])

  const activate = useCallback((pairing: Pairing) => {
    // Wi-Fi, hotspot and VPN addresses can change while the desktop identity stays the same.
    useUIStore.getState().setAssistantDesktop(pairing.fingerprint)
    setConfig(pairing)
  }, [])

  const scheduleRetry = useCallback(
    (pairing: Pairing) => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(failures.current, 5))
      retryTimer.current = setTimeout(() => {
        if (mounted.current && AppState.currentState === "active" && !probeController.current) void checkRef.current(pairing)
      }, delay)
    },
    [],
  )

  const check = useCallback(
    async (pairing: Pairing): Promise<Pairing | null> => {
      const version = generation.current
      const probeVersion = ++probeGeneration.current
      probeController.current?.abort()
      if (retryTimer.current) {
        clearTimeout(retryTimer.current)
        retryTimer.current = null
      }
      const controller = new AbortController()
      probeController.current = controller
      const current = () => mounted.current && version === generation.current && probeVersion === probeGeneration.current
      setConnectivity((previous) => (previous === "online" ? previous : "connecting"))
      setConnectionError(null)
      probeError.current = null
      setBootstrapLoading(true)
      warmLocalNetwork()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        // A QR can list Wi-Fi + Personal Hotspot + Tailscale. Race them; keep the one that answers.
        const reached = await firstReachable(pairing, async (candidate, signal) => {
          const probe = new CompanionClient(pinnedTransport(candidate))
          await probe.health(signal)
          return probe
        }, controller.signal)
        if (!current()) return null
        const [status, projects] = await Promise.all([
          reached.result.aiStatus(controller.signal).catch(() => null),
          reached.result.projects(controller.signal).catch(() => null),
        ])
        if (!current()) return null
        failures.current = 0
        setConnectivity("online")
        setAi(status)
        setBootstrap(status || projects ? { projects: projects ?? [], ai: status } : null)
        void drainQueueWith(reached.pairing)
          .then(() => refreshOfflineQueueCount().catch(() => undefined))
          .catch(() => undefined)
        return reached.pairing
      } catch (error) {
        if (!current()) return null
        failures.current += 1
        setAi(null)
        setBootstrap(null)
        const auth = error instanceof CompanionError && (error.status === 401 || error.status === 403)
        setConnectivity(auth ? "auth-required" : "offline")
        const message =
          controller.signal.aborted
            ? `The desktop at ${desktopLabel(pairing)} did not respond within 15 seconds. Allow Local Network access in iPhone Settings → Apps → CADCAMFUN, and join the same Wi-Fi or Personal Hotspot as the Mac, or use Tailscale.`
            : error instanceof Error
              ? error.message
              : "Cannot reach the desktop"
        probeError.current = new Error(message)
        setConnectionError(message)
        scheduleRetry(pairing)
        return null
      } finally {
        clearTimeout(timeout)
        if (current()) setBootstrapLoading(false)
        if (probeController.current === controller) probeController.current = null
      }
    },
    [scheduleRetry],
  )
  checkRef.current = check

  useEffect(() => {
    mounted.current = true
    const version = ++generation.current
    void (async () => {
      try {
        await uiPreferencesReady
        const launched = await launchPairLink()
        if (!mounted.current || version !== generation.current) return
        let pairing: Pairing | undefined
        if (launched) {
          pairing = parsePairingLink(launched)
          await storePairing(() => pairingStore.save(pairing!))
        } else pairing = await pairingStore.load()
        if (!mounted.current || version !== generation.current) return
        if (pairing) {
          activate(pairing)
          const reached = await check(pairing)
          if (reached && reached.baseUrl !== pairing.baseUrl) {
            await storePairing(() => pairingStore.save(reached))
            if (mounted.current && version === generation.current) activate(reached)
          }
        }
      } catch (error) {
        if (mounted.current && version === generation.current) {
          setConnectivity("error")
          setConnectionError(error instanceof Error ? error.message : "Could not read the saved pairing")
        }
      } finally {
        if (mounted.current && version === generation.current) setBooting(false)
      }
    })()
    return () => {
      mounted.current = false
      generation.current += 1
      probeGeneration.current += 1
      probeController.current?.abort()
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [activate, check, storePairing])

  useEffect(() => {
    if (!config) return
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void check(config).then((reached) => {
          if (!reached || reached.baseUrl === config.baseUrl) return
          void storePairing(() => pairingStore.save(reached))
          activate(reached)
        })
      } else {
        probeGeneration.current += 1
        probeController.current?.abort()
        if (retryTimer.current) clearTimeout(retryTimer.current)
        setConnectivity("background")
        setBootstrapLoading(false)
      }
    })
    return () => {
      subscription.remove()
      probeGeneration.current += 1
      probeController.current?.abort()
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [config, check, activate, storePairing])

  const save = useCallback(
    async (pairing: Pairing): Promise<boolean> => {
      const version = ++generation.current
      failures.current = 0
      setAi(null)
      setBootstrap(null)
      const reached = await check(pairing)
      if (!mounted.current || version !== generation.current) return false
      if (!reached) throw probeError.current ?? new Error("Cannot reach the desktop")
      await storePairing(() => pairingStore.save(reached))
      if (!mounted.current || version !== generation.current) return false
      activate(reached)
      setBooting(false)
      return true
    },
    [activate, check, storePairing],
  )

  const clear = useCallback(async () => {
    const version = ++generation.current
    probeGeneration.current += 1
    probeController.current?.abort()
    if (retryTimer.current) clearTimeout(retryTimer.current)
    failures.current = 0
    await storePairing(() => pairingStore.clear())
    if (!mounted.current || version !== generation.current) return
    useUIStore.getState().setAssistantDesktop(null)
    setConfig(null)
    setConnectivity("disconnected")
    setConnectionError(null)
    setAi(null)
    setBootstrap(null)
    setBootstrapLoading(false)
    setBooting(false)
  }, [storePairing])

  const recheck = useCallback(async () => {
    if (config) await check(config)
  }, [config, check])

  const refreshBootstrap = useCallback(async (): Promise<DesktopBootstrap | null> => {
    const pairing = configRef.current
    const live = currentClient.current
    if (!pairing || !live) {
      setBootstrap(null)
      setBootstrapLoading(false)
      return null
    }
    setBootstrapLoading(true)
    try {
      const [status, projects] = await Promise.all([live.aiStatus().catch(() => null), live.projects().catch(() => null)])
      if (currentClient.current !== live) return null
      const next: DesktopBootstrap | null = status || projects ? { projects: projects ?? [], ai: status } : null
      setBootstrap(next)
      setAi(status)
      if (next) {
        setConnectivity("online")
        setConnectionError(null)
      }
      return next
    } catch (error) {
      if (currentClient.current === live) {
        const auth = error instanceof CompanionError && (error.status === 401 || error.status === 403)
        setConnectivity(auth ? "auth-required" : "offline")
        setConnectionError(error instanceof Error ? error.message : "Connection failed")
      }
      throw error
    } finally {
      if (currentClient.current === live) setBootstrapLoading(false)
    }
  }, [])

  const value = useMemo<ServerValue>(
    () => ({ config, client, connectivity, connectionError, ai, bootstrap, bootstrapLoading, booting, save, clear, recheck, refreshBootstrap }),
    [config, client, connectivity, connectionError, ai, bootstrap, bootstrapLoading, booting, save, clear, recheck, refreshBootstrap],
  )
  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
}
