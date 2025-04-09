// src/types/next-auth.d.ts
import { Session } from 'next-auth';
import { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  // Define specific role types for proper type checking
  type UserRole = 'user' | 'admin' | 'editor' | 'viewer' | 'manager' | 'member';

  interface Session {
    user: {
      id: string;
      roles: UserRole[];  // Properly typed roles array
      name?: string | null;
      email?: string | null;
      image?: string | null;
      isActive?: boolean;  // Flag for account status
      permissions?: string[];  // Optional fine-grained permissions
      lastLogin?: string;  // Timestamp of last login
    };
    expires: string;  // Session expiration timestamp
    token?: string;  // JWT token for WebSocket authentication
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    roles?: UserRole[];  // Match roles type with session
    isActive?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    roles?: UserRole[];  // Keep consistent with Session
    isActive?: boolean;
    email?: string | null;
    name?: string | null;
    exp?: number;  // Expiration timestamp
    iat?: number;  // Issued at timestamp
    jti?: string;  // JWT ID for token tracking
    token?: string;  // Serialized JWT string for WebSocket authentication
    organizations?: { organizationId: string; role: string }[];  // User's organizations
  }
}