// src/lib/email.ts
import { Resend } from "resend";

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Template per l'email di verifica del cambio email
const getEmailChangeTemplate = (name: string, verificationLink: string) => `
  <h1>Verifica il cambio email</h1>
  <p>Ciao ${name},</p>
  <p>Hai richiesto di cambiare il tuo indirizzo email. Per completare la modifica, clicca sul link seguente:</p>
  <a href="${verificationLink}">Verifica cambio email</a>
  <p>Il link scadrà tra 24 ore.</p>
  <p>Se non hai richiesto questa modifica, ignora questa email.</p>
`;

// Template per l'email di verifica del cambio password
const getPasswordChangeTemplate = (name: string, verificationLink: string) => `
  <h1>Verifica il cambio password</h1>
  <p>Ciao ${name},</p>
  <p>Hai richiesto di cambiare la tua password. Per completare la modifica, clicca sul link seguente:</p>
  <a href="${verificationLink}">Verifica cambio password</a>
  <p>Il link scadrà tra 24 ore.</p>
  <p>Se non hai richiesto questa modifica, contatta immediatamente il supporto.</p>
`;

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async ({ to, subject, html }: EmailOptions) => {
  try {
    const data = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to: [to],
      subject,
      html,
    });

    console.log('Email sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error };
  }
};

export const sendVerificationEmail = async (email: string, token: string) => {
  const verificationUrl = `${process.env.NEXTAUTH_URL}/auth/verify?token=${token}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #4f46e5; margin-bottom: 10px;">CAD/CAM FUN</h1>
        <h2 style="color: #374151; margin-top: 0;">Verify Your Email</h2>
      </div>
      
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
        <p style="color: white; font-size: 18px; margin-bottom: 25px;">
          Welcome to CAD/CAM FUN! Please verify your email address to get started.
        </p>
        <a href="${verificationUrl}" 
           style="display: inline-block; background: white; color: #4f46e5; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
          Verify Email Address
        </a>
      </div>
      
      <div style="color: #6b7280; font-size: 14px; line-height: 1.5;">
        <p><strong>What's next?</strong></p>
        <ul style="padding-left: 20px;">
          <li>Access advanced CAD/CAM tools</li>
          <li>Create 2D/3D designs with AI assistance</li>
          <li>Generate and visualize toolpaths</li>
          <li>Collaborate with your team</li>
        </ul>
        
        <p style="margin-top: 30px;">
          <small>This link will expire in 24 hours. If you didn't create this account, you can safely ignore this email.</small>
        </p>
        
        <p style="margin-top: 20px; text-align: center; color: #9ca3af;">
          © 2024 CAD/CAM FUN. All rights reserved.
        </p>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Verify your CAD/CAM FUN account',
    html
  });
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #4f46e5; margin-bottom: 10px;">CAD/CAM FUN</h1>
        <h2 style="color: #374151; margin-top: 0;">Reset Your Password</h2>
      </div>
      
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
        <p style="color: white; font-size: 18px; margin-bottom: 25px;">
          We received a request to reset your password. Click the button below to set a new password.
        </p>
        <a href="${resetUrl}" 
           style="display: inline-block; background: white; color: #dc2626; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
          Reset Password
        </a>
      </div>
      
      <div style="color: #6b7280; font-size: 14px; line-height: 1.5;">
        <p><strong>Security Note:</strong></p>
        <ul style="padding-left: 20px;">
          <li>This link will expire in 1 hour</li>
          <li>If you didn't request this reset, please ignore this email</li>
          <li>Your password won't change until you click the link above</li>
        </ul>
        
        <p style="margin-top: 30px;">
          <small>For security reasons, this password reset link will expire in 1 hour.</small>
        </p>
        
        <p style="margin-top: 20px; text-align: center; color: #9ca3af;">
          © 2024 CAD/CAM FUN. All rights reserved.
        </p>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Reset your CAD/CAM FUN password',
    html
  });
};

interface InvitationEmailProps {
  to: string;
  organizationName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}

export async function sendInvitationEmail({
  to,
  organizationName,
  inviterName,
  role,
  inviteUrl,
  expiresAt
}: InvitationEmailProps): Promise<void> {
  const formattedExpiryDate = expiresAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  await sendEmail({
    to: to,
    subject: `Invitation to join ${organizationName}`,
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
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .header {
              margin-bottom: 20px;
            }
            .button {
              display: inline-block;
              background-color: #0070f3;
              color: white;
              text-decoration: none;
              padding: 12px 24px;
              border-radius: 5px;
              margin: 20px 0;
              font-weight: 500;
            }
            .footer {
              margin-top: 30px;
              font-size: 14px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>You've been invited to ${organizationName}</h1>
            </div>
            
            <p>Hello,</p>
            
            <p>${inviterName} has invited you to join <strong>${organizationName}</strong> as a <strong>${role}</strong>.</p>
            
            <p>Click the button below to accept this invitation:</p>
            
            <a href="${inviteUrl}" class="button">Accept Invitation</a>
            
            <p>Or copy and paste this URL into your browser:</p>
            <p>${inviteUrl}</p>
            
            <p>This invitation will expire on ${formattedExpiryDate}.</p>
            
            <div class="footer">
              <p>If you did not expect this invitation, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `
  });
}
