// src/lib/api/rbac.ts

import { prisma } from '../prisma';

export type Role = 'ADMIN' | 'MANAGER' | 'MEMBER' | 'USER';

/**
 * Check if a user has organization access with a specific role
 */
export async function hasOrganizationRole(
  userId: string, 
  organizationId: string, 
  roles: Role[] = ['ADMIN', 'MANAGER', 'MEMBER']
): Promise<boolean> {
  const userOrg = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId
      }
    }
  });
  
  return !!userOrg && roles.includes(userOrg.role as Role);
}

/**
 * Check if user has admin or manager role in organization
 */
export async function canManageOrganization(
  userId: string, 
  organizationId: string
): Promise<boolean> {
  return hasOrganizationRole(userId, organizationId, ['ADMIN', 'MANAGER']);
}

/**
 * Check if user has admin role in organization
 */
export async function isOrganizationAdmin(
  userId: string, 
  organizationId: string
): Promise<boolean> {
  return hasOrganizationRole(userId, organizationId, ['ADMIN']);
}

/**
 * Check if user has project access
 */
export async function hasProjectAccess(
  userId: string,
  projectId: string
): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { ownerId: userId },
        {
          organization: {
            users: {
              some: {
                userId
              }
            }
          }
        }
      ]
    }
  });
  
  return !!project;
}