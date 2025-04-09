// src/pages/api/auth/websocket-token.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req });
  
  if (!session || !session.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  // Create a minimal token with just the necessary data
  const payload = {
    sub: session.user.id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };
  
  const token = jwt.sign(payload, process.env.NEXTAUTH_SECRET || '');
  
  return res.status(200).json({ token });
}