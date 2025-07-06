// src/middleware/trackPageViews.ts
import { NextRequest, NextResponse } from "next/server";
// TODO: Implement Better Auth token validation for middleware
// import { getToken } from "next-auth/jwt";
import { logPageView } from "@/src/lib/activityTracking";

// Pages that should not be tracked (add more as needed)
const EXCLUDED_PATHS = ["/api/", "/_next/", "/favicon.ico", "/robots.txt", "/sitemap.xml"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Skip excluded paths
  if (EXCLUDED_PATHS.some(excludedPath => path.startsWith(excludedPath))) {
    return NextResponse.next();
  }

  try {
    // TODO: Implement Better Auth token validation in middleware
    // For now, page view tracking is disabled in middleware
    // It will be handled at the component level instead
    /*
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (token && token.sub) {
      const query = Object.fromEntries(req.nextUrl.searchParams.entries());

      fetch(`${process.env.NEXTAUTH_URL}/api/analytics/log-view`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token.jwt || ""}`
        },
        body: JSON.stringify({
          userId: token.sub,
          path,
          query
        })
      }).catch(error => {
        console.error("Failed to log page view:", error);
      });
    }
    */
  } catch (error) {
    // Log the error but don't block the request
    console.error("Error in page view tracking middleware:", error);
  }

  // Continue with the request
  return NextResponse.next();
}

// Configure the middleware to run on specific paths
export const config = {
  matcher: [
    // Match all paths except excluded ones
    "/((?!api/|_next/|static/|public/|favicon.ico).*)"
  ]
};
