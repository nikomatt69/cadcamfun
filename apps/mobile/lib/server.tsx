import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react"
import { AppState, Platform } from "react-native"
import { CompanionClient, CompanionError, type AiStatusInfo } from "./client"
import { launchPairLink, nativeAvailable, pairingStore, pinnedTransport } from "./native"
import { parsePairingLink, type Pairing } from "./pairing"
import { uiPreferencesReady, useUIStore } from "./store"

export type Connectivity = "disconnected" | "connecting" | "online" | "offline" | "error"
export interface ServerValue {
  config: Pairing | null
  client: CompanionClient | null
  connectivity: Connectivity
  connectionError: string | null
  ai: AiStatusInfo | null
  booting: boolean
  save(pairing: Pairing): Promise<boolean>
  clear(): Promise<void>
  recheck(): Promise<void>
}
const ServerContext = createContext<ServerValue | null>(null)
export function useServer(): ServerValue {
  const value = useContext(ServerContext)
  if (!value) throw new Error("useServer must be used within a ServerProvider")
  return value
}

/** Pairing survives an offline desktop; the provider owns and cancels health probes. */
export function ServerProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<Pairing | null>(null)
  const [connectivity, setConnectivity] = useState<Connectivity>("disconnected")
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [ai, setAi] = useState<AiStatusInfo | null>(null)
  const [booting, setBooting] = useState(true)
  const generation = useRef(0)
  const mounted = useRef(true)
  const probeGeneration = useRef(0)
  const probeController = useRef<AbortController | null>(null)
  const storage = useRef<Promise<void>>(Promise.resolve())
  const client = useMemo(() => config && (nativeAvailable || Platform.OS === "web") ? new CompanionClient(pinnedTransport(config)) : null, [config])

  const storePairing = useCallback((operation: () => Promise<void>) => {
    const next = storage.current.catch(() => undefined).then(operation)
    storage.current = next
    return next
  }, [])
  const activate = useCallback((pairing: Pairing) => {
    useUIStore.getState().setAssistantDesktop(`${pairing.baseUrl}|${pairing.fingerprint}`)
    setConfig(pairing)
  }, [])
  const check = useCallback(async (pairing: Pairing): Promise<boolean> => {
    const version = generation.current, probeVersion = ++probeGeneration.current
    probeController.current?.abort()
    const controller = new AbortController()
    probeController.current = controller
    const current = () => mounted.current && version === generation.current && probeVersion === probeGeneration.current
    setConnectivity((previous) => previous === "online" ? previous : "connecting")
    setConnectionError(null)
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const probe = new CompanionClient(pinnedTransport(pairing))
      await probe.health(controller.signal)
      if (!current()) return false
      setConnectivity("online")
      try {
        const status = await probe.aiStatus(controller.signal)
        if (current()) setAi(status)
      } catch {
        if (current()) setAi(null)
      }
      return current()
    } catch (error) {
      if (!current()) return false
      setAi(null)
      setConnectivity(error instanceof CompanionError && (error.status === 401 || error.status === 403) ? "error" : "offline")
      setConnectionError(controller.signal.aborted ? "The desktop did not respond within 15 seconds" : error instanceof Error ? error.message : "Cannot reach the desktop")
      return false
    } finally {
      clearTimeout(timeout)
      if (probeController.current === controller) probeController.current = null
    }
  }, [])

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
          await check(pairing)
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
    }
  }, [activate, check, storePairing])

  useEffect(() => {
    if (!config) return
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check(config)
      else {
        probeGeneration.current += 1
        probeController.current?.abort()
      }
    })
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && !probeController.current) void check(config)
    }, 20_000)
    return () => {
      subscription.remove()
      clearInterval(timer)
      probeGeneration.current += 1
      probeController.current?.abort()
    }
  }, [config, check])

  const save = useCallback(async (pairing: Pairing): Promise<boolean> => {
    const version = ++generation.current
    setAi(null)
    const ok = await check(pairing)
    if (!ok || !mounted.current || version !== generation.current) return false
    await storePairing(() => pairingStore.save(pairing))
    if (!mounted.current || version !== generation.current) return false
    activate(pairing)
    setBooting(false)
    return true
  }, [activate, check, storePairing])
  const clear = useCallback(async () => {
    const version = ++generation.current
    probeGeneration.current += 1
    probeController.current?.abort()
    await storePairing(() => pairingStore.clear())
    if (!mounted.current || version !== generation.current) return
    useUIStore.getState().setAssistantDesktop(null)
    setConfig(null)
    setConnectivity("disconnected")
    setConnectionError(null)
    setAi(null)
    setBooting(false)
  }, [storePairing])
  const recheck = useCallback(async () => { if (config) await check(config) }, [config, check])
  const value = useMemo<ServerValue>(() => ({ config, client, connectivity, connectionError, ai, booting, save, clear, recheck }), [config, client, connectivity, connectionError, ai, booting, save, clear, recheck])
  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
}
