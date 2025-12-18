import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    fullWidth = false,
    className = '',
    ...props
}) => {
    return (
        <button
            className={`
        bg-action-accent hover:bg-red-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-colors duration-200
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
            {...props}
        >
            {children}
        </button>
    );
};
