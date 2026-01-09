import React from 'react';

export interface FormFieldProps {
  /**
   * Input id to link label -> control.
   */
  htmlFor: string;

  /**
   * Label text.
   */
  label: React.ReactNode;

  /**
   * The form control (e.g. <Input />) to render.
   */
  children: React.ReactNode;

  /**
   * Optional hint text rendered above the control.
   */
  hint?: React.ReactNode;

  /**
   * Optional wrapper className.
   */
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  htmlFor,
  label,
  children,
  hint,
  className = '',
}) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="block text-sm font-medium mb-1.5">
      {label}
    </label>
    {hint && <div className="text-sm text-secondary-text mb-2">{hint}</div>}
    {children}
  </div>
);
