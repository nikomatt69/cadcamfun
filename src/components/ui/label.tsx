import React, { forwardRef } from 'react';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ children, className = '', required = false, ...props }, ref) => {
    return (
      <label
        className={`block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 ${className}`}
        ref={ref}
        {...props}
      >
        {children}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
    );
  }
);

Label.displayName = 'Label'; 