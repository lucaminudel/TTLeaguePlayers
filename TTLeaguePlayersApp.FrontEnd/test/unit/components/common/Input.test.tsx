import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '../../../../src/components/common/Input';

const LOCKED_CLASSES = ['!bg-gray-400', '!text-gray-800', 'cursor-not-allowed', '!opacity-100'];

describe('Input', () => {
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
