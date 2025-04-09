// src/middleware/trackPageViews.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { logPageView } from '@/src/lib/activityTracking';

// Pages that should not be tracked (add more as needed)
const EXCLUDED_PATHS = [
  '/api/',
  '/_next/',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml'
];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  
  // Skip excluded paths
  if (EXCLUDED_PATHS.some(excludedPath => path.startsWith(excludedPath))) {
    return NextResponse.next();
  }
  
  try {
    // Get the user's session token
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    
    // If the user is authenticated, log the page view
    if (token && token.sub) { // token.sub contains the user ID
      // We need to make the API call to log, as middleware can't directly access the database
      const query = Object.fromEntries(req.nextUrl.searchParams.entries());
      
      // Using fetch to call our API endpoint
      fetch(`${process.env.NEXTAUTH_URL}/api/analytics/log-view`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Include the session token to authenticate the request
          'Authorization': `Bearer ${token.jwt || ''}`
        },
        body: JSON.stringify({
          userId: token.sub,
          path,
          query
        })
      }).catch(error => {
        // Log the error but don't block the request
        console.error('Failed to log page view:', error);
      });
    }
  } catch (error) {
    // Log the error but don't block the request
    console.error('Error in page view tracking middleware:', error);
  }
  
  // Continue with the request
  return NextResponse.next();
}

// Configure the middleware to run on specific paths
export const config = {
  matcher: [
    // Match all paths except excluded ones
    '/((?!api/|_next/|static/|public/|favicon.ico).*)'
  ]
};