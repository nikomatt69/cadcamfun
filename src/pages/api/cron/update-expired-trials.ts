import { NextApiRequest, NextApiResponse } from "next";
import { updateExpiredTrials } from "@/src/lib/updateExpiredTrials";

// This endpoint should be called by a cron job service (e.g., Vercel Cron, GitHub Actions, etc.)
// It processes expired trials and downgrades users to the free plan

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow both GET and POST requests for Vercel cron compatibility
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // For Vercel cron jobs, we can verify using Vercel's cron secret or check headers
  const isVercelCron = req.headers["user-agent"]?.includes("vercel");
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.authorization?.replace("Bearer ", "") || req.query.secret;

  // If we have a cron secret configured, verify it (for external cron services)
  // For Vercel cron, we trust the platform's internal security
  if (!isVercelCron && cronSecret && cronSecret !== providedSecret) {
    console.log("Unauthorized cron request");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log(`[${new Date().toISOString()}] Starting expired trials update cron job`);
    
    const result = await updateExpiredTrials();
    
    if (result.success) {
      console.log(`[${new Date().toISOString()}] Cron job completed successfully. Updated ${result.updatedCount} trials.`);
      return res.status(200).json({
        success: true,
        updatedCount: result.updatedCount,
        message: `Successfully updated ${result.updatedCount} expired trials`,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error(`[${new Date().toISOString()}] Cron job failed:`, result.error);
      return res.status(500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Cron job error:`, error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}

// Disable body parsing for this endpoint to reduce overhead
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};