import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/src/lib/prisma';
import { hash } from 'bcrypt';
import crypto from 'crypto';
import { sendEmail } from '@/src/lib/email';
import { requireAuth } from '@/src/lib/api/auth';
import { getSession } from 'next-auth/react';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req });
  const userId = await requireAuth(req, res);
  if (!userId) return;

  // Only handles GET requests for token verification
  if (req.method === 'GET') {
    const { token, type, password } = req.query;

    if (!token || typeof token !== 'string' || !type || typeof type !== 'string') {
      return res.status(400).json({ message: 'Token and verification type are required' });
    }

    try {
      // Find token in database
      const inviteToken = await prisma.token.findUnique({
        where: { token },
      });

      if (!inviteToken) {
        return res.status(404).json({ message: 'Invalid or expired token' });
      }

      // Verify token hasn't expired (24 hours)
      if (inviteToken.expiresAt < new Date()) {
        await prisma.token.delete({ where: { token } });
        return res.status(400).json({ message: 'Token has expired' });
      }

      // Verify token type is correct
      if (inviteToken.type !== type) {
        return res.status(400).json({ message: 'Invalid token type' });
      }

      // Update user based on verification type
      if (type === 'email') {
        await prisma.user.update({
          where: { id: inviteToken.userId },
          data: {
            email: session?.user?.email,
            emailVerified: new Date()
          }
        });
      } else if (type === 'password') {
        if (!password || typeof password !== 'string') {
          return res.status(400).json({ message: 'Password is required for password update' });
        }

        const hashedPassword = await hash(password, 10);
        
        await prisma.user.update({
          where: { id: inviteToken.userId },
          data: {
            password: hashedPassword,
            updatedAt: new Date()
          }
        });
      }

      // Delete token after use
      await prisma.token.delete({ where: { token } });

      return res.status(200).json({ 
        message: type === 'email' ? 'Email updated successfully' : 'Password updated successfully'
      });
    } catch (error) {
      console.error('Verification error:', error);
      return res.status(500).json({ message: 'Error during verification' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
} 