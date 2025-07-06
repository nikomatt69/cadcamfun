import { NotificationService } from "@/src/lib/notificationService";
import type { NextApiRequest, NextApiResponse } from "next";
// Assuming you have a notification service in your main app

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ success: false, error: "Missing userId or message" });
    }

    // Call your main app's internal logic
    await NotificationService.createNotification(message);

    return res.status(200).json({ success: true, message: "Notification triggered." });
  } catch (error: unknown) {
    console.error("Error triggering notification:", error); // Log error in main app
    const errorMsg = error instanceof Error ? error.message : "Unknown internal server error";
    return res.status(500).json({ success: false, error: errorMsg });
  }
}
