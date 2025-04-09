// src/lib/email.ts
import { Resend } from 'resend';

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
  to: string[];
  subject: string;
  html: string;
  from?: string;
}

// Funzione per inviare email
export async function sendEmail({ to, subject, html, from }: EmailOptions) {
  try {
    const { data, error } = await resend.emails.send({
      from: from || process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to,
      subject,
      html,
    });

    if (error) {
      console.error('Error sending email:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Funzione per inviare email di verifica cambio email
export const sendEmailChangeVerification = async (
  name: string,
  email: string,
  token: string
) => {
  const verificationLink = `${process.env.NEXTAUTH_URL}/api/user/verify-change?token=${token}&type=email`;
  
  return sendEmail({
    to: [email],
    subject: 'Verifica cambio email - CAD/CAM FUN',
    html: getEmailChangeTemplate(name, verificationLink),
  });
};

// Funzione per inviare email di verifica cambio password
export const sendPasswordChangeVerification = async (
  name: string,
  email: string,
  token: string
) => {
  const verificationLink = `${process.env.NEXTAUTH_URL}/api/user/verify-change?token=${token}&type=password`;
  
  return sendEmail({
    to: [email],
    subject: 'Verifica cambio password - CAD/CAM FUN',
    html: getPasswordChangeTemplate(name, verificationLink),
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
  const formattedExpiryDate = expiresAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  await sendEmail({
    to: [to],
    subject: `Invitation to join ${organizationName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
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
