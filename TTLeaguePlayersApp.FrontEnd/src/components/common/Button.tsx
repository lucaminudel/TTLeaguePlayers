import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    fullWidth = false,
    className = '',
    type,
    ...props
}) => {
    // In HTML, <button> defaults to type="submit" when used inside a <form>.
    // For safety (avoid accidental submissions), default to type="button" unless explicitly set.
    const resolvedType: React.ButtonHTMLAttributes<HTMLButtonElement>['type'] = type ?? 'button';

    return (
        <button
            type={resolvedType}
            className={`
        bg-action-accent hover:bg-red-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-colors duration-200 text-base sm:text-lg
        flex items-center justify-center
        ${fullWidth ? 'w-full' : ''}
        ${props.disabled ? 'button-disabled' : ''}
        ${className}
      `}
            {...props}
        >
            {children}
        </button>
    );
};
