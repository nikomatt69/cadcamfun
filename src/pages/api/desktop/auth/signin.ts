import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import * as jose from 'jose';
import * as bcrypt from 'bcryptjs';
import { rateLimiters } from '../../../../lib/rateLimit';

interface DesktopSignInRequest {
  email: string;
  password: string;
  deviceId?: string;
  platform?: string;
}

interface DesktopSignInResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
  error?: string;
  syncData?: {
    lastSync: string;
    version: string;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DesktopSignInResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Rate limiting per IP
    const identifier = req.headers['x-forwarded-for'] as string || req.connection?.remoteAddress || 'anonymous';
    const rateLimitResult = await rateLimiters.auth.isAllowed(req);
    const rateLimitSuccess = rateLimitResult.allowed;
    
    if (!rateLimitSuccess) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.'
      });
    }

    const { email, password, deviceId, platform }: DesktopSignInRequest = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Trova l'utente nel database
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        password: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Verifica la password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Genera JWT per desktop
    const jwtSecret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT secret not configured');
    }

    const secret = new TextEncoder().encode(jwtSecret);
    const token = await new jose.SignJWT({
      userId: user.id,
      email: user.email,
      name: user.name,
      platform: 'desktop',
      deviceId: deviceId || 'unknown',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    // Log dell'accesso desktop
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        itemId: user.id,
        itemType: 'desktop_signin',
        action: 'signin',
        details: {
          platform: platform || 'desktop',
          deviceId: deviceId || 'unknown',
          ip: req.headers['x-forwarded-for'] as string || req.connection?.remoteAddress || 'anonymous',
          userAgent: req.headers['user-agent'],
        }
      }
    }).catch(console.error); // Non bloccare se fallisce il log

    // Informazioni di sincronizzazione
    const syncData = {
      lastSync: new Date().toISOString(),
      version: '1.0.0'
    };

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
      syncData
    });

  } catch (error) {
    console.error('Desktop signin error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}