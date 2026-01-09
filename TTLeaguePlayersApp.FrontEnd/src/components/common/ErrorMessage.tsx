import React from 'react';

export interface ErrorMessageProps {
  children: React.ReactNode;
  testId?: string;
  className?: string;
}

/**
 * Standard page-level error message.
 * Uses the global `.error-message` styles from `src/index.css`.
 */
export const ErrorMessage: React.FC<ErrorMessageProps> = ({ children, testId, className = '' }) => (
  <div className={`error-message ${className}`} data-testid={testId}>
    {children}
  </div>
);
