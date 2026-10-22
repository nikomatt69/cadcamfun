import { z } from "zod"

/**
 * What a desktop sends back when the assistant asks to see the screen.
 *
 * The image is the viewport the user is looking at, or the program sheet that stands in for it
 * while the CAM editor hides the 3D preview (`kind` says which). The program sheet is the G-code
 * and the toolpaths as an image; the G-code itself travels as text (`gcode`), because text is read
 * exactly and a picture of it is not.
 */
export const visionCaptureSchema = z.object({
  requestId: z.string().uuid(), projectId: z.string().min(1), mode: z.enum(["cad", "cam"]),
  capturedAt: z.number().finite(), mime: z.literal("image/png"),
  data: z.string().min(1).max(4_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  /** What the image shows: the live viewport, or the program sheet. */
  kind: z.enum(["viewport", "sheet"]).optional(),
  sceneRevision: z.string().regex(/^[a-f0-9]{64}$/),
  programRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  width: z.number().int().positive().max(1600), height: z.number().int().positive().max(1600),
  camera: z.object({ position: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]), target: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]) }).optional(),
  context: z.record(z.string(), z.unknown()),
  spatial: z.record(z.string(), z.unknown()).optional(),
  /** The program the CAM editor shows, as text. */
  gcode: z.string().max(400_000).optional(),
  /** The program text was longer than the capture carries. */
  programTruncated: z.boolean().optional(),
  /** The program sheet, when the image is the viewport. */
  sheet: z.object({
    mime: z.literal("image/png"),
    data: z.string().min(1).max(4_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    width: z.number().int().positive().max(1600), height: z.number().int().positive().max(1600)
  }).optional()
})
export type VisionCapture = z.infer<typeof visionCaptureSchema>
