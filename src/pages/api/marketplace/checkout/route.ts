import { NextApiRequest, NextApiResponse } from "next";
import { NextRequest } from "next/server";
import { Checkout } from "@polar-sh/nextjs";
import { POLAR_CONFIG } from "@/src/lib/polar/config";

export const GET = Checkout({
  accessToken: POLAR_CONFIG.accessToken,
  successUrl: `${process.env.NEXTAUTH_URL}/marketplace/purchase/success`,
  server: POLAR_CONFIG.baseUrl as "production" | "sandbox",
});

// Fallback for pages router
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    // Convert to NextRequest object for App Router compatibility
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const request = new NextRequest(url, {
      method: "GET",
      headers: req.headers as any,
    });

    const response = await GET(request);

    // Handle redirect response
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        return res.redirect(response.status, location);
      }
    }

    return res.status(response.status).json(await response.json());
  }

  res.setHeader("Allow", ["GET"]);
  res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}
