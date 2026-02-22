import React, { useState } from 'react';

export type InputSize = 'sm' | 'md';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Visual sizing preset.
   * Named `uiSize` to avoid clashing with the native `<input size={number}>` attribute.
   * - sm: tighter mobile-first inputs (default)
   * - md: slightly larger
   */
  uiSize?: InputSize;

  /**
   * Additional classes appended to the base styles.
   */
  className?: string;

  /**
   * React 19: pass `ref` as a normal prop.
   */
  ref?: React.Ref<HTMLInputElement>;

  /**
   * Show password visibility toggle for password inputs.
   */
  showPasswordToggle?: boolean;
}

const sizeClassName: Record<InputSize, string> = {
  sm: 'px-1.5 py-1 text-sm',
  md: 'px-3 py-2 text-base',
};

/**
 * Standard input textbox used across the app for consistent styling.
 */
export function Input({ uiSize = 'sm', className = '', ref, showPasswordToggle, type, ...props }: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  
  const isPasswordInput = type === 'password';
  const shouldShowToggle = showPasswordToggle && isPasswordInput;
  const inputType = shouldShowToggle && showPassword ? 'text' : type;

  if (shouldShowToggle) {
    return (
      <div className="relative">
        <input
          ref={ref}
          type={inputType}
          className={
            `w-full ${sizeClassName[uiSize]} border border-gray-300 rounded-md shadow-sm pr-10 `
            + 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 '
            + 'text-gray-900 bg-white '
            + className
          }
          {...props}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>
    );
  }

  return (
    <input
      ref={ref}
      type={inputType}
      className={
        `w-full ${sizeClassName[uiSize]} border border-gray-300 rounded-md shadow-sm `
        + 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 '
        + 'text-gray-900 bg-white '
        + className
      }
      {...props}
    />
  );
}
