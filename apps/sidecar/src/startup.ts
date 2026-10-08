/**
 * Settles once the sidecar has printed its ready line. Heavy, optional work (importing the embedded AI host) waits for it, so
 * the shell is never kept waiting by work that only the first chat message needs.
 */
let announce: () => void = () => {}
export const announced: Promise<void> = new Promise<void>((resolve) => { announce = resolve })
export const markAnnounced = (): void => announce()
