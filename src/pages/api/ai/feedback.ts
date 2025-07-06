import type { NextApiRequest, NextApiResponse } from "next";

interface FeedbackPayload {
  messageId: string;
  rating: "good" | "bad";
  comment?: string;
  // Potentially add more context: userId, timestamp, conversationHistory, etc.
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { messageId, rating, comment }: FeedbackPayload = req.body;

    if (!messageId || !rating) {
      return res.status(400).json({ error: "Missing required fields: messageId and rating" });
    }

    // --- Production Storage Logic ---
    // In a real application, you would store this feedback in a database
    // or send it to a logging/analytics service.
    // Example (replace with your actual storage):
    console.log("--- AI Feedback Received ---");
    console.log("Message ID:", messageId);
    console.log("Rating:", rating);
    console.log("Comment:", comment || "N/A");
    console.log("Timestamp:", new Date().toISOString());
    console.log("---------------------------");
    // await database.saveFeedback({ messageId, rating, comment, timestamp: new Date() });
    // await analyticsService.track('ai_feedback', { messageId, rating, hasComment: !!comment });
    // --- End Production Storage Logic ---

    // Send a success response
    return res.status(200).json({ success: true, message: "Feedback received" });
  } catch (error) {
    console.error("Error processing AI feedback:", error);
    // Avoid sending detailed internal errors to the client
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
}
