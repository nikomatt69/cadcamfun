// Unified signup endpoint for both web and desktop
import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Password strength validation
function validatePassword(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  
  if (!/(?=.*\d)/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  
  return { valid: true, message: '' };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, password } = req.body;
    const platform = req.headers['x-platform'] || 'web';
    
    // Input validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Name, email and password are required' 
      });
    }

    // Validate name
    if (name.length < 2 || name.length > 50) {
      return res.status(400).json({ 
        success: false,
        error: 'Name must be between 2 and 50 characters' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid email format' 
      });
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        success: false,
        error: passwordValidation.message 
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        error: 'An account with this email already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user and account in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          name: name.trim(),
          email: email.toLowerCase(),
          emailVerified: new Date(), // Auto-verify for now
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
        },
      });

      // Create account with credentials
      await tx.account.create({
        data: {
          userId: newUser.id,
          accountId: newUser.email!, // Better Auth expects email as accountId for credentials
          providerId: 'credential', // Better Auth uses providerId instead of provider
          password: hashedPassword,
        },
      });

      return newUser;
    });

    // Create JWT token for auto-signin
    const sessionId = `${result.id}-${Date.now()}`;
    const token = jwt.sign(
      { 
        userId: result.id, 
        email: result.email,
        sessionId,
        platform,
        iat: Math.floor(Date.now() / 1000),
        iss: 'cadcamfun',
        aud: platform === 'desktop' ? 'desktop-app' : 'web-app'
      },
      process.env.NEXTAUTH_SECRET!,
      { expiresIn: '7d' }
    );

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Platform-specific cookie settings
    const cookieOptions = platform === 'desktop' 
      ? 'HttpOnly; SameSite=Lax; Path=/' 
      : 'HttpOnly; SameSite=Lax; Secure; Path=/';
    
    const maxAge = 60 * 60 * 24 * 7; // 7 days
    
    // Set session cookie (auto-signin after signup)
    res.setHeader('Set-Cookie', [
      `better-auth.session_token=${token}; ${cookieOptions}; Max-Age=${maxAge}`,
    ]);

    // Log successful signup
    console.log(`New user registered: ${result.id} from ${platform} platform`);

    return res.status(201).json({ 
      success: true, 
      user: {
        id: result.id,
        name: result.name,
        email: result.email,
        image: result.image,
        roles: [],
      },
      sessionId,
      platform,
      message: 'Account created successfully'
    });
  } catch (error) {
    console.error('Sign up error:', error);
    
    // Handle specific database errors
    if ((error as any).code === 'P2002') {
      return res.status(409).json({ 
        success: false,
        error: 'An account with this email already exists' 
      });
    }
    
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
}