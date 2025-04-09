import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { ensureAuthenticated } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  // Get the token from the URL
  const { token } = req.query;
  
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ message: 'Invalid invitation token' });
  }
  
  // Check if user is authenticated
  const { authenticated, userId } = await ensureAuthenticated(req, res);
  
  if (!authenticated || !userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  try {
    // Get the user's information
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Find the invitation
    const invitation = await prisma.organizationInvitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    // Validate the invitation
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found or has already been used' });
    }
    
    // Check if invitation is expired
    if (new Date() > new Date(invitation.expiresAt)) {
      return res.status(400).json({ message: 'Invitation has expired' });
    }
    
    // Check if the authenticated user's email matches the invitation email
    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({ 
        message: 'You are not authorized to accept this invitation'
      });
    }
    
    // Check if the user is already a member of the organization
    const existingMembership = await prisma.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: invitation.organizationId
        }
      }
    });
    
    if (existingMembership) {
      return res.status(400).json({ 
        message: 'You are already a member of this organization'
      });
    }
    
    // Execute the transaction to accept the invitation
    await prisma.$transaction([
      // Add user to the organization with the specified role
      prisma.userOrganization.create({
        data: {
          userId,
          organizationId: invitation.organizationId,
          role: invitation.role
        }
      }),
      
      // Delete the invitation after it's accepted
      prisma.organizationInvitation.delete({
        where: { id: invitation.id }
      })
    ]);
    
    // Send success response
    return res.status(200).json({
      message: 'Invitation accepted successfully',
      organization: {
        id: invitation.organizationId,
        name: invitation.organization.name
      }
    });
    
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return res.status(500).json({ message: 'Failed to accept invitation' });
  }
} 