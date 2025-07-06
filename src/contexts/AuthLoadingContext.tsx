// src/contexts/AuthLoadingContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';
import AuthLoadingScreen from '@/src/components/auth/AuthLoadingScreen';

interface AuthLoadingContextType {
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  isLoading: boolean;
  message: string;
}

const AuthLoadingContext = createContext<AuthLoadingContextType | undefined>(undefined);

interface AuthLoadingProviderProps {
  children: ReactNode;
}

export function AuthLoadingProvider({ children }: AuthLoadingProviderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('Authenticating...');

  const showLoading = (customMessage?: string) => {
    if (customMessage) {
      setMessage(customMessage);
    }
    setIsLoading(true);
  };

  const hideLoading = () => {
    setIsLoading(false);
    setMessage('Authenticating...');
  };

  return (
    <AuthLoadingContext.Provider
      value={{
        showLoading,
        hideLoading,
        isLoading,
        message
      }}
    >
      {children}
      <AuthLoadingScreen 
        isVisible={isLoading} 
        message={message}
        showLogo={true}
      />
    </AuthLoadingContext.Provider>
  );
}

export const useAuthLoading = () => {
  const context = useContext(AuthLoadingContext);
  if (context === undefined) {
    throw new Error('useAuthLoading must be used within an AuthLoadingProvider');
  }
  return context;
};