import { createContext, useContext } from "react"
import type { CompanionClient, AiStatusInfo, ProjectSummary } from "./client"
import type { Pairing } from "./pairing"

/**
 * Shared server state, split from the provider so screens import types without
 * pulling the provider's effects (nikcli: server-context + server-provider).
 */
export type Connectivity =
  | "disconnected"
  | "connecting"
  | "online"
  | "offline"
  | "auth-required"
  | "error"
  | "background"

export interface DesktopBootstrap {
  readonly projects: readonly ProjectSummary[]
  readonly ai: AiStatusInfo | null
}

export interface ServerValue {
  config: Pairing | null
  client: CompanionClient | null
  connectivity: Connectivity
  connectionError: string | null
  ai: AiStatusInfo | null
  bootstrap: DesktopBootstrap | null
  bootstrapLoading: boolean
  booting: boolean
  save(pairing: Pairing): Promise<boolean>
  clear(): Promise<void>
  recheck(): Promise<void>
  refreshBootstrap(): Promise<DesktopBootstrap | null>
}

export const ServerContext = createContext<ServerValue | null>(null)

export function useServer(): ServerValue {
  const value = useContext(ServerContext)
  if (!value) throw new Error("useServer must be used within a ServerProvider")
  return value
}
