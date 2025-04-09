// src/components/ui/ErrorMessage.tsx
import React from 'react';
import { AlertTriangle } from 'react-feather';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div className="bg-red-50 border border-red-200 rounded-md p-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">Errore</h3>
          <div className="mt-2 text-sm text-red-700">{message}</div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 px-3 py-1 text-sm font-medium text-red-600 hover:text-red-500 bg-red-100 hover:bg-red-200 rounded-md"
            >
              Riprova
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorMessage;