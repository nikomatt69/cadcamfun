// src/lib/email.ts
import { Resend } from "resend";

// RIMOZIONE DELL'ISTANZA GLOBALE DI RESEND
// const resend = new Resend(process.env.RESEND_API_KEY!);

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

// Template per l'email di verifica del cambio email
const getEmailChangeTemplate = (name: string, verificationLink: string) => `
  <h1>Verifica il cambio email</h1>
  <p>Ciao ${name},</p>
  <p>Hai richiesto di cambiare il tuo indirizzo email. Per completare la modifica, clicca sul link seguente:</p>
  <a href="${verificationLink}">Verifica cambio email</a>
  <p>Il link scadrà tra 24 ore.</p>
  <p>Se non hai richiesto questa modifica, ignora questa email.</p>
`;

export interface InvitationEmailProps {
  to: string;
  organizationName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}

// Production-ready email sending with comprehensive error handling
export const sendEmail = async ({ to, subject, html }: EmailOptions) => {
  try {
    // Validate environment
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    if (!process.env.EMAIL_FROM) {
      throw new Error("EMAIL_FROM is not configured");
    }

    // Crea l'istanza di Resend QUI, solo quando la funzione viene chiamata sul server.
    const resend = new Resend(process.env.RESEND_API_KEY);

    const data = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      html,
      // Production settings
      tags: [
        { name: 'service', value: 'auth' },
        { name: 'environment', value: process.env.NODE_ENV || 'development' }
      ],
    });

    console.log(`✅ Email sent successfully to ${to}:`, data);
    return { success: true, data };
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
    return { success: false, error };
  }
};

// Production-ready verification email
export const sendVerificationEmail = async (email: string, token: string, callbackURL: string) => {
  // Rimuoviamo l'istanza da qui, perché la funzione `sendEmail` se ne occupa già.
  // const resend = new Resend(process.env.RESEND_API_KEY!);
  const verificationLink = `${callbackURL}?token=${token}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #4f46e5; margin-bottom: 8px; font-size: 28px; font-weight: 700;">CAD/CAM FUN</h1>
          <h2 style="color: #374151; margin: 0; font-size: 20px; font-weight: 600;">Verify Your Email Address</h2>
        </div>
        
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px; border-radius: 12px; text-align: center; margin-bottom: 32px;">
          <p style="color: white; font-size: 18px; margin: 0 0 24px 0; line-height: 1.5;">
            Welcome to CAD/CAM FUN! Click the button below to verify your email address and start creating amazing designs.
          </p>
          <a href="${verificationLink}" 
             style="display: inline-block; background: white; color: #4f46e5; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; transition: all 0.2s;">
            Verify Email Address
          </a>
        </div>
        
        <div style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
            <p style="margin: 0 0 12px 0; font-weight: 600; color: #374151;">🚀 What's waiting for you:</p>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Advanced CAD/CAM design tools</li>
              <li>AI-powered design assistance</li>
              <li>3D modeling and simulation</li>
              <li>Collaborative workspace features</li>
              <li>Professional toolpath generation</li>
            </ul>
          </div>
          
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="margin: 0; color: #dc2626; font-weight: 500;">🔒 Security Notice:</p>
            <p style="margin: 8px 0 0 0; color: #991b1b;">This verification link will expire in 24 hours. If you didn't create this account, you can safely ignore this email.</p>
          </div>
          
          <p style="text-align: center; margin: 0; color: #9ca3af; font-size: 12px;">
            © 2024 CAD/CAM FUN. All rights reserved.<br>
            Professional CAD/CAM solutions for modern manufacturing
          </p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: '🔐 Verify your CAD/CAM FUN account',
    html
  });
};

// Production-ready password reset email
export const sendPasswordResetEmail = async (email: string, token: string) => {
  // Rimuoviamo l'istanza da qui, perché la funzione `sendEmail` se ne occupa già.
  // const resend = new Resend(process.env.RESEND_API_KEY!);
  const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${token}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #4f46e5; margin-bottom: 8px; font-size: 28px; font-weight: 700;">CAD/CAM FUN</h1>
          <h2 style="color: #374151; margin: 0; font-size: 20px; font-weight: 600;">Reset Your Password</h2>
        </div>
        
        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 32px; border-radius: 12px; text-align: center; margin-bottom: 32px;">
          <p style="color: white; font-size: 18px; margin: 0 0 24px 0; line-height: 1.5;">
            We received a request to reset your password. Click the button below to create a new secure password.
          </p>
          <a href="${resetLink}" 
             style="display: inline-block; background: white; color: #dc2626; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Reset Password
          </a>
        </div>
        
        <div style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
            <p style="margin: 0 0 12px 0; font-weight: 600; color: #dc2626;">🔒 Security Information:</p>
            <ul style="margin: 0; padding-left: 20px; color: #991b1b;">
              <li>This reset link will expire in <strong>1 hour</strong></li>
              <li>If you didn't request this reset, please ignore this email</li>
              <li>Your password won't change until you complete the reset process</li>
              <li>For added security, consider enabling two-factor authentication</li>
            </ul>
          </div>
          
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="margin: 0; color: #0369a1; font-weight: 500;">💡 Password Security Tips:</p>
            <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #075985; font-size: 13px;">
              <li>Use at least 8 characters with a mix of letters, numbers, and symbols</li>
              <li>Avoid using personal information or common passwords</li>
              <li>Consider using a password manager for better security</li>
            </ul>
          </div>
          
          <p style="text-align: center; margin: 0; color: #9ca3af; font-size: 12px;">
            © 2024 CAD/CAM FUN. All rights reserved.<br>
            If you have security concerns, contact our support team immediately
          </p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: '🔑 Reset your CAD/CAM FUN password',
    html
  });
};

// Magic Link Email (specific template)
export const sendMagicLinkEmail = async (email: string, token: string) => {
  // Rimuoviamo l'istanza da qui, perché la funzione `sendEmail` se ne occupa già.
  // const resend = new Resend(process.env.RESEND_API_KEY!);
  const magicLink = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify-magic-link?token=${token}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #4f46e5; margin-bottom: 8px; font-size: 28px; font-weight: 700;">CAD/CAM FUN</h1>
          <h2 style="color: #374151; margin: 0; font-size: 20px; font-weight: 600;">🪄 Magic Link Sign In</h2>
        </div>
        
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px; border-radius: 12px; text-align: center; margin-bottom: 32px;">
          <p style="color: white; font-size: 18px; margin: 0 0 24px 0; line-height: 1.5;">
            Click the magic button below to sign in to your account instantly and securely.
          </p>
          <a href="${magicLink}" 
             style="display: inline-block; background: white; color: #4f46e5; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            ✨ Sign In with Magic Link
          </a>
        </div>
        
        <div style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
            <p style="margin: 0 0 12px 0; font-weight: 600; color: #dc2626;">🔒 Security Notice:</p>
            <ul style="margin: 0; padding-left: 20px; color: #991b1b;">
              <li>This magic link will expire in <strong>5 minutes</strong></li>
              <li>Only use this link if you requested it</li>
              <li>Never share this link with anyone</li>
              <li>Each magic link can only be used once</li>
            </ul>
          </div>
          
          <p style="text-align: center; margin: 0; color: #9ca3af; font-size: 12px;">
            © 2024 CAD/CAM FUN. All rights reserved.<br>
            Secure, passwordless authentication for modern workflows
          </p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: '✨ Your CAD/CAM FUN Magic Link',
    html
  });
};

// Two-Factor Authentication OTP Email
export const send2FAEmail = async (email: string, otp: string) => {
  // Rimuoviamo l'istanza da qui, perché la funzione `sendEmail` se ne occupa già.
  // const resend = new Resend(process.env.RESEND_API_KEY!);
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #4f46e5; margin-bottom: 8px; font-size: 28px; font-weight: 700;">CAD/CAM FUN</h1>
          <h2 style="color: #374151; margin: 0; font-size: 20px; font-weight: 600;">🛡️ Two-Factor Authentication</h2>
        </div>
        
        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 32px; border-radius: 12px; text-align: center; margin-bottom: 32px;">
          <p style="color: white; font-size: 18px; margin: 0 0 24px 0; line-height: 1.5;">
            Your 2FA verification code is:
          </p>
          <div style="background: white; color: #dc2626; padding: 24px; border-radius: 12px; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace; border: 2px solid #fecaca;">
            ${otp}
          </div>
        </div>
        
        <div style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
            <p style="margin: 0 0 12px 0; font-weight: 600; color: #dc2626;">⏱️ Time Sensitive:</p>
            <ul style="margin: 0; padding-left: 20px; color: #991b1b;">
              <li>This code will expire in <strong>3 minutes</strong></li>
              <li>Enter this code in the verification form</li>
              <li>Never share this code with anyone</li>
              <li>Contact support if you didn't request this code</li>
            </ul>
          </div>
          
          <p style="text-align: center; margin: 0; color: #9ca3af; font-size: 12px;">
            © 2024 CAD/CAM FUN. All rights reserved.<br>
            Enhanced security for your professional workspace
          </p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: '🛡️ Your CAD/CAM FUN 2FA Code',
    html
  });
};

// Organization invitation email (already existing, enhanced)
export async function sendInvitationEmail({
  to,
  organizationName,
  inviterName,
  role,
  inviteUrl,
  expiresAt
}: InvitationEmailProps): Promise<void> {
  // Rimuoviamo l'istanza da qui, perché la funzione `sendEmail` se ne occupa già.
  // const resend = new Resend(process.env.RESEND_API_KEY!);
  const formattedExpiryDate = expiresAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  await sendEmail({
    to: to,
    subject: `🏢 Invitation to join ${organizationName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=0.8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #ffffff;
              border-radius: 12px;
              padding: 40px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            }
            .header {
              margin-bottom: 24px;
              text-align: center;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-decoration: none;
              padding: 16px 32px;
              border-radius: 8px;
              margin: 24px 0;
              font-weight: 600;
              font-size: 16px;
            }
            .footer {
              margin-top: 32px;
              font-size: 14px;
              color: #666;
              text-align: center;
            }
            .info-box {
              background: #f0f9ff;
              border: 1px solid #bae6fd;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: #4f46e5;">🏢 Organization Invitation</h1>
              <h2>You've been invited to ${organizationName}</h2>
            </div>
            
            <p>Hello,</p>
            
            <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <strong>${role}</strong> in CAD/CAM FUN.</p>
            
            <div class="info-box">
              <p style="margin: 0;"><strong>🚀 As a ${role}, you'll have access to:</strong></p>
              <ul style="margin: 12px 0 0 0;">
                <li>Collaborative CAD/CAM workspace</li>
                <li>Shared project repositories</li>
                <li>Team communication tools</li>
                <li>Advanced manufacturing simulations</li>
                <li>Professional support and resources</li>
              </ul>
            </div>
            
            <div style="text-align: center;">
              <a href="${inviteUrl}" class="button">
                Accept Invitation
              </a>
            </div>
            
            <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin: 24px 0;">
              <p style="margin: 0; color: #dc2626; font-weight: 500;">⏰ Important:</p>
              <p style="margin: 8px 0 0 0; color: #991b1b;">This invitation will expire on <strong>${formattedExpiryDate}</strong>. Please accept it before this date.</p>
            </div>
            
            <p style="font-size: 14px; color: #666;">
              If you don't want to join this organization, you can safely ignore this email. The invitation will expire automatically.
            </p>
            
            <div class="footer">
              <p>© 2024 CAD/CAM FUN. All rights reserved.</p>
              <p style="font-size: 12px; color: #9ca3af;">
                Professional CAD/CAM collaboration platform
              </p>
            </div>
          </div>
        </body>
      </html>
    `
  });
}

export const sendEmailChangeVerification = async (email: string, name: string, token: string) => {
  const verificationLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify-email-change?token=${token}`;
  const htmlContent = getEmailChangeTemplate(name, verificationLink);

  await sendEmail({
    to: email,
    subject: "Verifica il tuo nuovo indirizzo email",
    html: htmlContent,
  });
};
