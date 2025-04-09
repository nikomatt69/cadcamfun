/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          '50': '#eff6ff',
          '100': '#dbeafe',
          '200': '#bfdbfe',
          '300': '#93c5fd',
          '400': '#60a5fa',
          '500': '#3b82f6',
          '600': '#2563eb',
          '700': '#1d4ed8',
          '800': '#1e40af',
          '900': '#1e3a8a',
          '950': '#172554'
        },
        gray: {
          '50': '#f9fafb',
          '100': '#f3f4f6',
          '200': '#e5e7eb',
          '300': '#d1d5db',
          '400': '#9ca3af',
          '500': '#6b7280',
          '600': '#4b5563',
          '700': '#374151',
          '800': '#1f2937',
          '900': '#111827',
          '950': '#030712',
        },
        success: {
          '50': '#ecfdf5',
          '100': '#d1fae5',
          '500': '#10b981',
          '600': '#059669',
          '700': '#047857',
        },
        danger: {
          '50': '#fef2f2',
          '100': '#fee2e2',
          '500': '#ef4444',
          '600': '#dc2626',
          '700': '#b91c1c',
        },
        warning: {
          '50': '#fffbeb',
          '100': '#fef3c7',
          '500': '#f59e0b',
          '600': '#d97706',
          '700': '#b45309',
        },
      },
      spacing: {
        '72': '18rem',
        '80': '20rem',
        '96': '24rem',
      },
      borderRadius: {
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace', 
          'SFMono-Regular', 
          'Menlo', 
          'Monaco', 
          'Consolas', 
          '"Liberation Mono"', 
          '"Courier New"', 
          'monospace'
        ],
      },
      fontSize: {
        'xs': '0.75rem',
        'sm': '0.875rem',
        'base': '1rem',
        'lg': '1.125rem',
        'xl': '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
      },
      zIndex: {
        '0': 0,
        '10': 10,
        '20': 20,
        '30': 30,
        '40': 40,
        '50': 50,
        '60': 60,
        'auto': 'auto',
      },
    }
  },
  variants: { 
    extend: {
      opacity: ['disabled'],
      cursor: ['disabled'],
      backgroundColor: ['active', 'disabled'],
      textColor: ['active', 'disabled'],
    } 
  }
};