import React from 'react';

interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Switch({ 
  id, 
  checked = false, 
  onCheckedChange, 
  disabled = false, 
  className = '',
  size = 'md'
}: SwitchProps) {
  const baseStyles = 'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50';
  
  const sizeStyles = {
    sm: 'h-[20px] w-[36px]',
    md: 'h-[24px] w-[44px]',
    lg: 'h-[30px] w-[56px]'
  };
  
  const thumbSizeStyles = {
    sm: 'h-[16px] w-[16px] translate-x-0.5',
    md: 'h-[20px] w-[20px] translate-x-0.5',
    lg: 'h-[26px] w-[26px] translate-x-0.5'
  };
  
  const thumbActiveStyles = {
    sm: 'translate-x-[19px]',
    md: 'translate-x-[23px]',
    lg: 'translate-x-[29px]'
  };
  
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`
        ${baseStyles}
        ${sizeStyles[size]}
        ${checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}
        ${className}
      `}
    >
      <span
        className={`
          ${thumbSizeStyles[size]}
          ${checked ? thumbActiveStyles[size] : ''}
          pointer-events-none block rounded-full bg-white shadow-lg ring-0 transition-transform
        `}
      />
    </button>
  );
} 