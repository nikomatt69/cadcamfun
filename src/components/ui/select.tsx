import React, { createContext, useContext, useState, forwardRef } from 'react';

type SelectContextType = {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SelectContext = createContext<SelectContextType | undefined>(undefined);

function useSelectContext() {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error('Select components must be used within a Select component');
  }
  return context;
}

interface SelectProps {
  children: React.ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

export function Select({
  children,
  defaultValue,
  value,
  onValueChange,
  disabled = false,
}: SelectProps) {
  const [selectedValue, setSelectedValue] = useState(value || defaultValue || '');
  const [open, setOpen] = useState(false);

  const handleValueChange = (newValue: string) => {
    if (!value) {
      setSelectedValue(newValue);
    }
    onValueChange?.(newValue);
    setOpen(false);
  };

  return (
    <SelectContext.Provider
      value={{
        value: value || selectedValue,
        onValueChange: handleValueChange,
        open,
        setOpen,
      }}
    >
      <div className={`relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

interface SelectTriggerProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  children: React.ReactNode;
  className?: string;
}

export const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ children, className = '', ...props }, ref) => {
    const { value, open, setOpen } = useSelectContext();

    return (
      <button
        type="button"
        className={`w-full flex items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${className}`}
        onClick={() => setOpen(!open)}
        ref={ref}
        {...props}
      >
        {children}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    );
  }
);

SelectTrigger.displayName = 'SelectTrigger';

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = useSelectContext();
  return <span>{value || placeholder}</span>;
}

export function SelectContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { open } = useSelectContext();

  if (!open) return null;

  return (
    <div className="relative">
      <div
        className={`absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 shadow-lg rounded-md py-1 text-sm overflow-auto max-h-60 focus:outline-none border border-gray-200 dark:border-gray-700 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export function SelectItem({ value, children, className = '', disabled = false, ...props }: SelectItemProps) {
  const { value: selectedValue, onValueChange } = useSelectContext();
  const isSelected = selectedValue === value;

  return (
    <div
      className={`px-3 py-2 cursor-pointer flex items-center hover:bg-gray-100 dark:hover:bg-gray-700 
        ${isSelected ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : ''} 
        ${disabled ? 'opacity-50 pointer-events-none' : ''} 
        ${className}`}
      onClick={() => !disabled && onValueChange(value)}
      {...props}
    >
      {isSelected && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 mr-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      <span className={isSelected ? 'font-medium' : ''}>{children}</span>
    </div>
  );
} 