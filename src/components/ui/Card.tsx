import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div 
      className={`bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden ${className}`} 
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }: CardProps) {
  return (
    <div 
      className={`px-6 py-4 border-b border-gray-200 dark:border-gray-700 ${className}`} 
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '', ...props }: CardProps) {
  return (
    <h3 
      className={`text-xl font-bold text-gray-900 dark:text-white ${className}`} 
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = '', ...props }: CardProps) {
  return (
    <p 
      className={`mt-1 text-sm text-gray-500 dark:text-gray-400 ${className}`} 
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({ children, className = '', ...props }: CardProps) {
  return (
    <div 
      className={`px-6 py-4 ${className}`} 
      {...props}
    >
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '', ...props }: CardProps) {
  return (
    <div 
      className={`px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 ${className}`} 
      {...props}
    >
      {children}
    </div>
  );
} 