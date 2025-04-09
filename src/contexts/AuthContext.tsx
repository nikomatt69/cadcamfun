// src/contexts/AuthContext.tsx

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import { UserRole } from '@prisma/client';

type Role = 'ADMIN' | 'MANAGER' | 'MEMBER' | 'USER';

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  roles?: Role[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (role: Role[] | Role[]) => boolean;
  signIn: (credentials?: any) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [user, setUser] = useState<User | null>(null);
  
  useEffect(() => {
    if (session?.user) {
      setUser({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        roles: session.user.roles as unknown as Role[] ||  "USER" as unknown as Role[]
      });
    } else {
      setUser(null);
    }
  }, [session]);
  
  const hasRole = (role: Role | Role[]): boolean => {
    if (!user || !user.roles) return false;
    
    if (Array.isArray(role)) {
      return role.some(r => user.roles?.includes(r));
    }
    
    return user.roles.includes(role);
  };
  
  const handleSignIn = async (credentials?: any) => {
    try {
      await signIn('credentials', {
        redirect: false,
        ...credentials
      });
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };
  
  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/auth/signin' });
  };
  
  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: status === 'loading',
        isAuthenticated: !!user,
        hasRole,
        signIn: handleSignIn,
        signOut: handleSignOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};