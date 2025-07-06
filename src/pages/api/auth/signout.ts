// src/pages/api/auth/signout.ts
import { NextApiRequest, NextApiResponse } from "next";
import { auth } from "@/src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Use Better Auth sign out with proper request context
    const result = await auth.api.signOut({
      headers: req.headers as HeadersInit,
    });

    // Clear session cookies manually to ensure proper logout
    const cookieOptions = process.env.NODE_ENV === "production" 
      ? 'HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0'
      : 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
    
    res.setHeader('Set-Cookie', [
      `better-auth.session_token=; ${cookieOptions}`,
      `better-auth.csrf_token=; ${cookieOptions}`,
      `better-auth.state=; ${cookieOptions}`,
    ]);

    console.log('Better Auth signout successful');
    return res.status(200).json({ success: true, message: 'Signed out successfully' });
  } catch (error) {
    console.error('Sign out error:', error);
    
    // Still clear cookies even if Better Auth signout fails
    const cookieOptions = process.env.NODE_ENV === "production" 
      ? 'HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0'
      : 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
    
    res.setHeader('Set-Cookie', [
      `better-auth.session_token=; ${cookieOptions}`,
      `better-auth.csrf_token=; ${cookieOptions}`,
      `better-auth.state=; ${cookieOptions}`,
    ]);
    
    // Return success even if Better Auth fails, as we cleared cookies
    return res.status(200).json({ success: true, message: 'Signed out successfully (with fallback)' });
  }
}