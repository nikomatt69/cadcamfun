// src/pages/api/organizations/[id]/invite.ts
import { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';
import { sendInvitationEmail } from 'src/lib/email';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authenticate the request
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // Validate the organization ID
  const { id: organizationId } = req.query;
  if (!organizationId || typeof organizationId !== 'string') {
    return res.status(400).json({ message: 'Organization ID is required' });
  }
  
  // Verify the user has permission to invite members
  const userOrganization = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId
      }
    }
  });
  
  if (!userOrganization || !['ADMIN', 'MANAGER'].includes(userOrganization.role)) {
    return res.status(403).json({ message: 'You do not have permission to invite members' });
  }
  
  // Only handle POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    const { email, role = 'MEMBER' } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    // Managers can only invite members
    if (userOrganization.role === 'MANAGER' && role === 'ADMIN') {
      return res.status(403).json({ message: 'Managers cannot invite Admins' });
    }
    
    // Check if user already exists and is already a member
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      const existingMembership = await prisma.userOrganization.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId
          }
        }
      });
      
      if (existingMembership) {
        return res.status(400).json({ message: 'User is already a member of this organization' });
      }
    }
    
    // Get organization and inviter details
    const [organization, inviter] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId }
      }),
      prisma.user.findUnique({
        where: { id: userId }
      })
    ]);
    
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    
    // Generate a secure token and expiration date (7 days)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    // Check for existing invitation and update or create as needed
    const existingInvitation = await prisma.organizationInvitation.findFirst({
      where: {
        email,
        organizationId
      }
    });
    
    const invitation = existingInvitation
      ? await prisma.organizationInvitation.update({
          where: { id: existingInvitation.id },
          data: { role, token, expiresAt }
        })
      : await prisma.organizationInvitation.create({
          data: {
            email,
            role,
            token,
            organizationId,
            expiresAt
          }
        });
    
    // Send the invitation email
    const inviterName = inviter?.name || 'Someone';
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invitations/${token}`;
    
    try {
      await sendInvitationEmail({
        to: email,
        organizationName: organization.name,
        inviterName,
        role: role.toLowerCase(),
        inviteUrl,
        expiresAt
      });
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      // Continue with the API response since the invitation was created
    }
    
    return res.status(existingInvitation ? 200 : 201).json({
      message: existingInvitation ? 'Invitation updated and sent' : 'Invitation created and sent',
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt
      }
    });
    
  } catch (error) {
    console.error('Failed to send invitation:', error);
    return res.status(500).json({ message: 'Failed to send invitation' });
  }
}