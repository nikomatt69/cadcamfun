// lib/graphql/resolvers.ts
import { GraphQLScalarType, Kind } from "graphql";
import { GraphQLUpload } from "graphql-upload-minimal";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { GraphQLError } from "graphql";
// TODO: Update types to Better Auth session types
type Session = any; // Temporary replacement for NextAuth Session
type JWT = any; // Temporary replacement for NextAuth JWT
import { PrismaClient } from "@prisma/client";
import { PubSub } from "graphql-subscriptions";

// Define the context based on the new structure in pages/api/graphql.ts
const prisma = new PrismaClient();
const pubsub = new PubSub();

export interface Context {
  token: JWT | null;
  session: Session | null;
  userId: string | null;
  prisma: PrismaClient;
  pubsub: PubSub;
  user?: { id: string; email?: string | null;[key: string]: any };
}

// Helper to derive the old 'user' object if needed by isAuthenticated
const getUserFromContext = (context: Context): { id: string; email?: string | null } | null => {
  if (context.userId) {
    // Include email from session if available
    return {
      id: context.userId,
      email: context.session?.user?.email,
      ...(context.session?.user || {})
    };
  }
  return null;
};

// Check if user is authenticated using the new context structure
const isAuthenticated = (context: Context) => {
  const user = getUserFromContext(context);
  if (!user) {
    throw new GraphQLError("You must be logged in", {
      extensions: {
        code: "UNAUTHENTICATED"
      }
    });
  }
  return user;
};

// Check if user has access to organization
const hasOrganizationAccess = async (context: Context, organizationId: string) => {
  const user = isAuthenticated(context);

  const membership = await context.prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId
      }
    }
  });

  if (!membership) {
    throw new GraphQLError("You do not have access to this organization", {
      extensions: {
        code: "FORBIDDEN"
      }
    });
  }

  return { user, membership };
};

// Check if user has admin rights to organization
const isOrganizationAdmin = async (context: Context, organizationId: string) => {
  const { user, membership } = await hasOrganizationAccess(context, organizationId);

  if (membership.role !== UserRole.ADMIN) {
    throw new GraphQLError("You do not have admin rights to this organization", {
      extensions: {
        code: "FORBIDDEN"
      }
    });
  }

  return { user, membership };
};

// Custom scalars
const DateTime = new GraphQLScalarType({
  name: "DateTime",
  description: "DateTime custom scalar type",
  serialize(value: unknown): string | null {
    return value instanceof Date ? value.toISOString() : null;
  },
  parseValue(value: unknown): Date | null {
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      // Check if the date is valid
      return !isNaN(date.getTime()) ? date : null;
    }
    return null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  }
});

const Json = new GraphQLScalarType({
  name: "Json",
  description: "JSON custom scalar type",
  serialize(value) {
    return value;
  },
  parseValue(value) {
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return JSON.parse(ast.value);
    }
    return null;
  }
});

// Define resolvers
export const resolvers = {
  DateTime,
  Json,
  Upload: GraphQLUpload,

  Query: {
    // User queries
    me: (_: any, __: any, context: Context) => {
      return isAuthenticated(context);
    },

    user: async (_: any, { id }: { id: string }, context: Context) => {
      isAuthenticated(context);
      return context.prisma.user.findUnique({ where: { id } });
    },

    users: async (_: any, { skip = 0, take = 10 }: { skip?: number; take?: number }, context: Context) => {
      isAuthenticated(context);
      return context.prisma.user.findMany({ skip, take });
    },

    // Organization queries
    organization: async (_: any, { id }: { id: string }, context: Context) => {
      await hasOrganizationAccess(context, id);
      return context.prisma.organization.findUnique({ where: { id } });
    },

    organizations: async (_: any, { skip = 0, take = 10 }: { skip?: number; take?: number }, context: Context) => {
      isAuthenticated(context);
      return context.prisma.organization.findMany({ skip, take });
    },

    myOrganizations: async (_: any, __: any, context: Context) => {
      const user = isAuthenticated(context);

      const memberships = await context.prisma.userOrganization.findMany({
        where: { userId: user.id },
        include: { organization: true }
      });

      return memberships.map(m => m.organization);
    },

    // Project queries
    project: async (_: any, { id }: { id: string }, context: Context) => {
      const user = isAuthenticated(context);

      const project = await context.prisma.project.findUnique({
        where: { id },
        include: { organization: true }
      });

      if (!project) {
        throw new GraphQLError("Project not found", {
          extensions: { code: "NOT_FOUND" }
        });
      }

      // Check if user has access to project
      if (project.ownerId !== user.id && !project.isPublic) {
        if (project.organizationId) {
          await hasOrganizationAccess(context, project.organizationId);
        } else {
          throw new GraphQLError("You do not have access to this project", {
            extensions: { code: "FORBIDDEN" }
          });
        }
      }

      return project;
    },

    projects: async (
      _: any,
      { skip = 0, take = 10, organizationId }: { skip?: number; take?: number; organizationId?: string },
      context: Context
    ) => {
      const user = isAuthenticated(context);

      const where: any = {};

      if (organizationId) {
        await hasOrganizationAccess(context, organizationId);
        where.organizationId = organizationId;
      } else {
        where.OR = [
          { ownerId: user.id },
          { isPublic: true },
          {
            organizationId: {
              in: (
                await context.prisma.userOrganization.findMany({
                  where: { userId: user.id },
                  select: { organizationId: true }
                })
              ).map(org => org.organizationId)
            }
          }
        ];
      }

      return context.prisma.project.findMany({
        where,
        skip,
        take
      });
    },

    myProjects: async (_: any, __: any, context: Context) => {
      const user = isAuthenticated(context);

      return context.prisma.project.findMany({
        where: { ownerId: user.id }
      });
    },

    // Drawing queries
    drawing: async (_: any, { id }: { id: string }, context: Context) => {
      const user = isAuthenticated(context);

      const drawing = await context.prisma.drawing.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!drawing) {
        throw new GraphQLError("Drawing not found", {
          extensions: { code: "NOT_FOUND" }
        });
      }

      // Check if user has access to drawing via project
      if (drawing.project.ownerId !== user.id && !drawing.project.isPublic) {
        if (drawing.project.organizationId) {
          await hasOrganizationAccess(context, drawing.project.organizationId);
        } else {
          throw new GraphQLError("You do not have access to this drawing", {
            extensions: { code: "FORBIDDEN" }
          });
        }
      }

      return drawing;
    },

    drawings: async (
      _: any,
      { projectId, skip = 0, take = 10 }: { projectId: string; skip?: number; take?: number },
      context: Context
    ) => {
      const user = isAuthenticated(context);

      const project = await context.prisma.project.findUnique({
        where: { id: projectId }
      });

      if (!project) {
        throw new GraphQLError("Project not found", {
          extensions: { code: "NOT_FOUND" }
        });
      }

      // Check if user has access to project
      if (project.ownerId !== user.id && !project.isPublic) {
        if (project.organizationId) {
          await hasOrganizationAccess(context, project.organizationId);
        } else {
          throw new GraphQLError("You do not have access to this project", {
            extensions: { code: "FORBIDDEN" }
          });
        }
      }

      return context.prisma.drawing.findMany({
        where: { projectId },
        skip,
        take
      });
    },

    // Component queries
    component: async (_: any, { id }: { id: string }, context: Context) => {
      const user = isAuthenticated(context);

      const component = await context.prisma.component.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!component) {
        throw new GraphQLError("Component not found", {
          extensions: { code: "NOT_FOUND" }
        });
      }

      // If component is public, allow access
      if (component.isPublic) {
        return component;
      }

      // Check if user has access to component via project
      if (component.project.ownerId !== user.id) {
        if (component.project.organizationId) {
          await hasOrganizationAccess(context, component.project.organizationId);
        } else {
          throw new GraphQLError("You do not have access to this component", {
            extensions: { code: "FORBIDDEN" }
          });
        }
      }

      return component;
    },

    components: async (
      _: any,
      { projectId, skip = 0, take = 10 }: { projectId: string; skip?: number; take?: number },
      context: Context
    ) => {
      const user = isAuthenticated(context);

      const project = await context.prisma.project.findUnique({
        where: { id: projectId }
      });

      if (!project) {
        throw new GraphQLError("Project not found", {
          extensions: { code: "NOT_FOUND" }
        });
      }

      // Check if user has access to project
      if (project.ownerId !== user.id && !project.isPublic) {
        if (project.organizationId) {
          await hasOrganizationAccess(context, project.organizationId);
        } else {
          throw new GraphQLError("You do not have access to this project", {
            extensions: { code: "FORBIDDEN" }
          });
        }
      }

      return context.prisma.component.findMany({
        where: { projectId },
        skip,
        take
      });
    },

    publicComponents: async (_: any, { skip = 0, take = 10 }: { skip?: number; take?: number }, context: Context) => {
      return context.prisma.component.findMany({
        where: { isPublic: true },
        skip,
        take
      });
    }

    // Add more resolver implementations for other queries here
  },

  Mutation: {
    // User mutations
    updateUser: async (_: any, { input }: { input: any }, context: Context) => {
      const user = isAuthenticated(context);

      return context.prisma.user.update({
        where: { id: user.id },
        data: input
      });
    },

    updatePassword: async (
      _: any,
      { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
      context: Context
    ) => {
      const user = isAuthenticated(context);

      const dbUser = await context.prisma.user.findUnique({
        where: { id: user.id }
      });

      if (!dbUser || !dbUser.password) {
        throw new GraphQLError("User not found or no password set", {
          extensions: { code: "AUTHENTICATION_ERROR" }
        });
      }

      const isValid = await bcrypt.compare(currentPassword, dbUser.password);

      if (!isValid) {
        throw new GraphQLError("Current password is incorrect", {
          extensions: { code: "AUTHENTICATION_ERROR" }
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await context.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
      });

      return true;
    },

    deleteUser: async (_: any, __: any, context: Context) => {
      const user = isAuthenticated(context);

      await context.prisma.user.delete({
        where: { id: user.id }
      });

      return true;
    },

    // Organization mutations
    createOrganization: async (_: any, { input }: { input: any }, context: Context) => {
      const user = isAuthenticated(context);

      const organization = await context.prisma.organization.create({
        data: {
          name: input.name,
          description: input.description,
          users: {
            create: {
              userId: user.id,
              role: UserRole.ADMIN
            }
          }
        }
      });

      return organization;
    },

    updateOrganization: async (_: any, { id, input }: { id: string; input: any }, context: Context) => {
      await isOrganizationAdmin(context, id);

      return context.prisma.organization.update({
        where: { id },
        data: input
      });
    },

    deleteOrganization: async (_: any, { id }: { id: string }, context: Context) => {
      await isOrganizationAdmin(context, id);

      await context.prisma.organization.delete({
        where: { id }
      });

      return true;
    },

    inviteToOrganization: async (_: any, { input }: { input: any }, context: Context) => {
      await isOrganizationAdmin(context, input.organizationId);

      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

      return context.prisma.organizationInvitation.create({
        data: {
          email: input.email,
          role: input.role,
          token,
          expiresAt,
          organizationId: input.organizationId
        }
      });
    },

    joinOrganization: async (_: any, { token }: { token: string }, context: Context) => {
      const user = isAuthenticated(context);

      const invitation = await context.prisma.organizationInvitation.findUnique({
        where: { token }
      });

      if (!invitation) {
        throw new GraphQLError("Invalid invitation token", {
          extensions: { code: "BAD_REQUEST" }
        });
      }

      if (invitation.expiresAt < new Date()) {
        throw new GraphQLError("Invitation has expired", {
          extensions: { code: "BAD_REQUEST" }
        });
      }

      if (invitation.email !== user.email) {
        throw new GraphQLError("Invitation is for a different email address", {
          extensions: { code: "BAD_REQUEST" }
        });
      }

      const userOrganization = await context.prisma.userOrganization.create({
        data: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role
        }
      });

      // Delete the invitation after use
      await context.prisma.organizationInvitation.delete({
        where: { id: invitation.id }
      });

      // Notify other organization members
      context.pubsub.publish("MEMBER_JOINED", {
        memberJoined: {
          organizationId: invitation.organizationId,
          userId: user.id
        }
      });

      return userOrganization;
    }

    // Add more resolver implementations for other mutations here
  },

  Subscription: {
    notificationAdded: {
      subscribe: (_: any, __: any, context: Context) => {
        const user = isAuthenticated(context);
        // Fix: Cast pubsub to any to ensure asyncIterator is recognized without type errors
        return (context.pubsub as any).asyncIterator([`NOTIFICATION_${user.id}`]);
      }
    },

    messageAdded: {
      subscribe: async (_: any, { conversationId }: { conversationId: string }, context: Context) => {
        const user = isAuthenticated(context);

        // Check if user is participant in conversation
        const participant = await context.prisma.conversationParticipant.findUnique({
          where: {
            userId_conversationId: {
              userId: user.id,
              conversationId
            }
          }
        });

        if (!participant) {
          throw new GraphQLError("You are not a participant in this conversation", {
            extensions: { code: "FORBIDDEN" }
          });
        }

        // Fix: Cast pubsub to any to ensure asyncIterator is recognized without type errors
        return (context.pubsub as any).asyncIterator([`MESSAGE_ADDED_${conversationId}`]);
      }
    }
  },
  // Type resolvers for nested fields
  User: {
    organizations: (parent: any, _: any, context: Context) => {
      return context.prisma.userOrganization.findMany({
        where: { userId: parent.id }
      });
    },

    projects: (parent: any, _: any, context: Context) => {
      return context.prisma.project.findMany({
        where: { ownerId: parent.id }
      });
    },

    subscription: (parent: any, _: any, context: Context) => {
      return context.prisma.subscription.findUnique({
        where: { id: parent.id }
      });
    }

    // Add more field resolvers as needed
  }

  // Add more type resolvers as needed
};
