// src/components/auth/AuthWrapper.tsx
import React from 'react';

interface AuthWrapperProps {
  children: React.ReactNode;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  return <>{children}</>;
};

export default AuthWrapper;
