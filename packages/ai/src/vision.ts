import { z } from "zod"
export const visionCaptureSchema = z.object({
  requestId: z.string().uuid(), projectId: z.string().min(1), mode: z.enum(["cad", "cam"]),
  capturedAt: z.number().finite(), mime: z.literal("image/png"),
  data: z.string().min(1).max(4_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  sceneRevision: z.string().regex(/^[a-f0-9]{64}$/),
  programRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  width: z.number().int().positive().max(1600), height: z.number().int().positive().max(1600),
  camera: z.object({ position: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]), target: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]) }).optional(),
  context: z.record(z.string(), z.unknown()),
  spatial: z.record(z.string(), z.unknown()).optional()
})
export type VisionCapture = z.infer<typeof visionCaptureSchema>
