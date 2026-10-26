import { MAX_IMAGE_BYTES, attachmentProblem, base64Bytes, type PendingAttachment } from "./attachments"

/** A byte count as "840 KB" or "2.4 MB". */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB"
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export interface PhotoReview {
  readonly size: string
  /** The reason the desktop would refuse the photo (over 5 MB, unreadable); undefined when it can be sent. */
  readonly problem?: string
  readonly sendable: boolean
}

/** What the preview shows under a fresh photo, with the desktop's own limit applied before it is sent. */
export const reviewPhoto = (attachment: PendingAttachment): PhotoReview => {
  const problem = attachmentProblem(attachment)
  const bytes = base64Bytes(attachment.data)
  return {
    size: `${formatBytes(bytes)} of ${formatBytes(MAX_IMAGE_BYTES)}`,
    ...(problem ? { problem } : {}),
    sendable: !problem,
  }
}
