// src/pages/api/analytics/log-view.ts
import { NextApiRequest, NextApiResponse } from "next";
import { logPageView } from "@/src/lib/activityTracking";
import { requireAuth } from "@/src/lib/api/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const { path, query } = req.body;

    // Log the page view
    await logPageView(userId, path, query);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to log page view:", error);
    return res.status(500).json({ message: "Failed to log page view" });
  }
}
