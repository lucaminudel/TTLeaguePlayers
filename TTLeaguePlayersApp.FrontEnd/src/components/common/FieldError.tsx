import React from 'react';

export interface FieldErrorProps {
  children: React.ReactNode;
  testId?: string;
  className?: string;
}

/**
 * Standard inline (field-level) validation error.
 * Uses the global `.field-error` styles from `src/index.css`.
 */
export const FieldError: React.FC<FieldErrorProps> = ({ children, testId, className = '' }) => (
  <p className={`field-error ${className}`} data-testid={testId}>
    {children}
  </p>
);
