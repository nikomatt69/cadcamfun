import type { CloudProjectStatus } from "@cadcamfun/api"
import { CompanionError } from "./client"

/** Default English copy shared by the delivery UI and announcements. */
export const cloudCopy = {
  title: "Desktop delivery",
  send: "Send to PC",
  sending: "Saving version…",
  sent: "Version saved for your PC",
  failed: "Could not send this version",
  dirty: "New cloud changes have not been sent yet.",
  offline: "Reconnect to the cloud workspace before sending.",
  retry: "Refresh delivery status",
  states: {
    local: { title: "Not sent to PC", detail: "Save a version for your desktop to download." },
    pending: { title: "Waiting for your PC", detail: "Your version is saved in the cloud. Your PC can receive it when it reconnects." },
    downloaded: { title: "Downloaded to PC", detail: "The desktop has received this version. It still needs to apply it to the local project." },
    applied: { title: "Applied on PC", detail: "Your desktop confirmed that this version was applied." },
    conflict: { title: "Needs review on PC", detail: "Cloud and desktop changes differ. Review them on the desktop before applying." },
  },
} as const

/** Mobile imports schema types only; a malformed or foreign reply must not claim delivery succeeded. */
export const cloudProjectStatus = (raw: unknown, projectId: string): CloudProjectStatus => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CompanionError(502, "The cloud returned an invalid delivery status")
  const value = raw as Record<string, unknown>
  const head = (input: unknown) => input === null || typeof input === "string" && /^[0-9a-f]{40}$/u.test(input)
  if (value.projectId !== projectId || typeof value.state !== "string" || !Object.hasOwn(cloudCopy.states, value.state) || typeof value.dirty !== "boolean" || !head(value.localHead) || !head(value.remoteHead)) {
    throw new CompanionError(502, "The cloud returned an invalid delivery status")
  }
  return { projectId, localHead: value.localHead as string | null, remoteHead: value.remoteHead as string | null, state: value.state as CloudProjectStatus["state"], dirty: value.dirty }
}
