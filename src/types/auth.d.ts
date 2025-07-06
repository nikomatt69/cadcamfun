// src/types/auth.d.ts
// Better Auth type definitions

export type UserRole = "user" | "admin" | "editor" | "viewer" | "manager" | "member";

export interface AuthUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  emailVerified?: boolean | null;
  roles?: UserRole[];
  isActive?: boolean;
  permissions?: string[];
  lastLogin?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthSession {
  user: AuthUser;
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
}

// Better Auth API types
export interface AuthResult {
  data?: AuthSession;
  error?: string;
}

export interface SignInData {
  email: string;
  password: string;
  usePasskey?: boolean;
}

export interface SignUpData {
  name: string;
  email: string;
  password: string;
}

// Passkey types
export interface PasskeyCredential {
  id: string;
  credentialID: string;
  credentialPublicKey: Uint8Array;
  counter: number;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  transports?: string[];
}