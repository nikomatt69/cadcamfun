import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          className={`w-full h-10 px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-md
            outline-none transition-colors duration-200
            border-gray-300 dark:border-gray-600 
            focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
            ${className}`}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input'; 