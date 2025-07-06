// src/pages/api/auth/magic-link/store.ts
import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { createHash } from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, url } = req.body;
    
    if (!email || !url) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and URL are required' 
      });
    }

    // Extract token from URL
    const urlParams = new URL(url);
    const token = urlParams.searchParams.get('token');
    
    if (!token) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid magic link URL' 
      });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Store magic link for UI retrieval (expires in 15 minutes)
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Delete any existing magic link tokens for this user
    await prisma.token.deleteMany({
      where: {
        userId: user.id,
        type: 'magic-link'
      }
    });

    // Create new magic link token
    await prisma.token.create({
      data: {
        userId: user.id,
        token: hashedToken,
        type: 'magic-link',
        expiresAt,
        metadata: {
          email,
          originalUrl: url,
          platform: 'web'
        }
      }
    });

    console.log(`✅ Magic link stored for ${email} - expires at ${expiresAt.toISOString()}`);

    return res.status(200).json({ 
      success: true,
      message: 'Magic link stored successfully',
      link: url,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    console.error('Magic link store error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
}