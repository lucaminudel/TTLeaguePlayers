import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Input } from '../../../../src/components/common/Input';

const LOCKED_CLASSES = ['!bg-gray-400', '!text-gray-800', 'cursor-not-allowed', '!opacity-100'];

describe('Input', () => {
    describe('password visibility', () => {
        it('toggles a password input between masked and visible and back', () => {
            render(<Input aria-label="Password" type="password" showPasswordToggle />);

            const input = screen.getByLabelText('Password');
            expect(input).toHaveAttribute('type', 'password');
            fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
            expect(input).toHaveAttribute('type', 'text');
            fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
            expect(input).toHaveAttribute('type', 'password');
        });

        it('does not render a toggle for a non-password input', () => {
            render(<Input aria-label="Email" type="email" showPasswordToggle />);

            expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
            expect(screen.queryByRole('button', { name: /password/i })).not.toBeInTheDocument();
        });
    });

    describe('locked', () => {
        it('disables a text input and greys it out', () => {
            render(<Input aria-label="Email" type="email" value="a@b.com" onChange={() => undefined} locked />);

            const input = screen.getByLabelText('Email');
            expect(input).toBeDisabled();
            expect(input).toHaveClass(...LOCKED_CLASSES);
            expect(input).toHaveStyle({ color: '#1f2937', opacity: '1' });
        });

        it('disables a password input with the visibility toggle and greys it out', () => {
            render(<Input aria-label="Password" type="password" showPasswordToggle locked />);

            const input = screen.getByLabelText('Password');
            expect(input).toBeDisabled();
            expect(input).toHaveClass(...LOCKED_CLASSES);
        });

        it('keeps the caller classes alongside the locked ones', () => {
            render(<Input aria-label="Name" className="border-red-500" locked />);

            expect(screen.getByLabelText('Name')).toHaveClass('border-red-500', ...LOCKED_CLASSES);
        });
    });

    describe('not locked', () => {
        it('is enabled and not greyed out', () => {
            render(<Input aria-label="Email" type="email" />);

            const input = screen.getByLabelText('Email');
            expect(input).toBeEnabled();
            expect(input).not.toHaveClass('!bg-gray-400');
        });

        it('still honours an explicit disabled', () => {
            render(<Input aria-label="Email" type="email" disabled />);

            const input = screen.getByLabelText('Email');
            expect(input).toBeDisabled();
            expect(input).not.toHaveClass('!bg-gray-400');
        });
    });
});
