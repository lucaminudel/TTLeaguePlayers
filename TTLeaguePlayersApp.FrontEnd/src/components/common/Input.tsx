import React from 'react';

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
}

const sizeClassName: Record<InputSize, string> = {
  sm: 'px-1.5 py-1 text-sm',
  md: 'px-3 py-2 text-base',
};

/**
 * Standard input textbox used across the app for consistent styling.
 */
export function Input({ uiSize = 'sm', className = '', ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
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
