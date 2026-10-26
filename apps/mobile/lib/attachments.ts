/**
 * Attachments the phone sends with an assistant message.
 *
 * The desktop already reads images, PDFs and text files attached to a turn (packages/ai/src/attachments.ts):
 * a photo of the part on the bench, a dimensioned drawing, a DXF. The phone could not send any of it —
 * the pairing was the only way to talk to the assistant. The limits below are the desktop's own, so the
 * phone refuses a photo before it costs a 36 MiB request.
 */

/** The desktop keeps at most five attachments per message. */
export const MAX_ATTACHMENTS = 5
/** The desktop accepts an image of at most five megabytes. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export interface PendingAttachment {
  readonly name: string
  readonly mime: string
  /** Base64 without the `data:` prefix, as the desktop's schema takes it. */
  readonly data: string
}

/** The bytes a base64 payload carries (four characters for three bytes, minus the padding). */
export const base64Bytes = (data: string): number => {
  if (!data.length) return 0
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0
  return Math.floor((data.length * 3) / 4) - padding
}

/** Why an attachment cannot be sent, or undefined when it can. */
export const attachmentProblem = (attachment: { readonly name: string; readonly data: string }): string | undefined => {
  if (!attachment.data) return `${attachment.name} could not be read.`
  const bytes = base64Bytes(attachment.data)
  if (bytes > MAX_IMAGE_BYTES) return `${attachment.name} is ${(bytes / 1024 / 1024).toFixed(1)} MB; the desktop accepts up to 5 MB.`
  return undefined
}

/**
 * Adds attachments to the pending list, refusing the ones that do not fit. The refused ones come back with
 * their reason, so the phone can say which photo was too large instead of dropping it silently.
 */
export const acceptAttachments = (
  existing: readonly PendingAttachment[],
  added: readonly PendingAttachment[],
): { readonly accepted: readonly PendingAttachment[]; readonly refused: ReadonlyArray<{ readonly name: string; readonly reason: string }> } => {
  const accepted = [...existing]
  const refused: Array<{ name: string; reason: string }> = []
  for (const attachment of added) {
    if (accepted.length >= MAX_ATTACHMENTS) {
      refused.push({ name: attachment.name, reason: `The desktop takes ${MAX_ATTACHMENTS} attachments per message.` })
      continue
    }
    const problem = attachmentProblem(attachment)
    if (problem) {
      refused.push({ name: attachment.name, reason: problem })
      continue
    }
    accepted.push(attachment)
  }
  return { accepted, refused }
}

/** The name a photo gets: a short stamp so several photos do not share one name. */
export const photoName = (at: number = Date.now()): string => `photo-${new Date(at).toISOString().replace(/[:.]/g, "-")}.jpg`

/** The pictures among the attachments, as inline data URLs the transcript can draw; other kinds have no preview. */
export const attachmentPreviews = (attachments: readonly PendingAttachment[]): ReadonlyArray<{ readonly name: string; readonly uri: string }> =>
  attachments.filter((item) => item.mime.startsWith("image/")).map((item) => ({ name: item.name, uri: `data:${item.mime};base64,${item.data}` }))
