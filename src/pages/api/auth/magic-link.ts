// src/pages/api/auth/magic-link.ts
import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { createHash, randomBytes } from "crypto";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    // Input validation
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
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

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // For security, don't reveal if user doesn't exist
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a magic link has been sent.'
      });
    }

    // Generate magic link token
    const token = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(token).digest('hex');

    // Store token in database (expires in 15 minutes)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.token.create({
      data: {
        token: hashedToken,
        type: 'magic-link',
        expiresAt,
        userId: user.id,
        metadata: {
          email: user.email,
          platform: req.headers['x-platform'] || 'web'
        }
      }
    });

    // Create magic link URL
    const baseURL = process.env.NEXTAUTH_URL || (process.env.NODE_ENV === "production"
      ? "https://cadcamfun.xyz"
      : "http://localhost:3000");

    const magicLinkUrl = `${baseURL}/auth/magic-link/verify?token=${token}&email=${encodeURIComponent(email)}`;

    // Send magic link email
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'CAD/CAM FUN <no-reply@invite.cadcamfun.xyz>',
      to: [email],
      subject: 'Sign in to CAD/CAM FUN',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0;">CAD/CAM FUN</h1>
            <p style="color: #6B7280; margin: 10px 0 0 0;">Secure sign-in link</p>
          </div>
          
          <div style="background: #F9FAFB; border-radius: 8px; padding: 30px; text-align: center; margin-bottom: 30px;">
            <h2 style="color: #111827; margin: 0 0 15px 0;">Sign in to your account</h2>
            <p style="color: #6B7280; margin: 0 0 25px 0;">Click the button below to securely sign in to your CAD/CAM FUN account.</p>
            
            <a href="${magicLinkUrl}" 
               style="display: inline-block; background: #4F46E5; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; margin: 10px 0;">
              Sign In Now
            </a>
            
            <p style="color: #9CA3AF; font-size: 14px; margin: 20px 0 0 0;">
              This link expires in 15 minutes and can only be used once.
            </p>
          </div>
          
          <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center;">
            <p style="color: #6B7280; font-size: 14px; margin: 0;">
              If you didn't request this sign-in link, you can safely ignore this email.
            </p>
            <p style="color: #9CA3AF; font-size: 12px; margin: 10px 0 0 0;">
              This email was sent to ${email}
            </p>
          </div>
        </div>
      `,
      text: `
        Sign in to CAD/CAM FUN
        
        Click the link below to sign in to your account:
        ${magicLinkUrl}
        
        This link expires in 15 minutes and can only be used once.
        
        If you didn't request this sign-in link, you can safely ignore this email.
      `
    });

    if (error) {
      console.error('Failed to send magic link email:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to send magic link email'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Magic link sent to your email address'
    });

  } catch (error) {
    console.error('Magic link error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}