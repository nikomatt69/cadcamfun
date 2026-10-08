/**
 * Settles once the sidecar has printed its ready line. Heavy, optional work (importing the embedded AI host) waits for it, so
 * the shell is never kept waiting by work that only the first chat message needs.
 */
let announce: () => void = () => {}
export const announced: Promise<void> = new Promise<void>((resolve) => { announce = resolve })
export const markAnnounced = (): void => announce()

/** Loopback port of the running API, set once the server listens; the companion gateway forwards to it. */
let localPort: number | undefined
export const setLocalPort = (port: number): void => { localPort = port }
export const getLocalPort = (): number | undefined => localPort
