// src/pages/api/auth/[...auth].ts
import { auth } from "@/src/lib/auth";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Ensure we have proper headers for URL construction
  const host = req.headers.host || 'localhost:3001';
  const protocol = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');

  // Set proper headers for Better Auth
  if (!req.headers['x-forwarded-host']) {
    req.headers['x-forwarded-host'] = host;
  }
  if (!req.headers['x-forwarded-proto']) {
    req.headers['x-forwarded-proto'] = protocol;
  }

  return auth.handler(req as any);
}