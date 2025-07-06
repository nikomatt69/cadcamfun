// src/components/auth/AuthWrapper.tsx
import React, { useEffect } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useAuthLoading } from '@/src/contexts/AuthLoadingContext';

interface AuthWrapperProps {
  children: React.ReactNode;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { showLoading, hideLoading } = useAuthLoading();

  useEffect(() => {
    if (authLoading) {
      showLoading('Checking authentication...');
    } else {
      hideLoading();
    }
  }, [authLoading, showLoading, hideLoading]);

  return <>{children}</>;
};

export default AuthWrapper;