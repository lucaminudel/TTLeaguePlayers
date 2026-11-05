import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../../../../src/components/common/Button';
import { ErrorMessage } from '../../../../src/components/common/ErrorMessage';
import { FieldError } from '../../../../src/components/common/FieldError';
import { FormField } from '../../../../src/components/common/FormField';
import {
    DISPUTES_INFO_TITLE,
    DisputesInfoBody,
    RATE_INFO_MODAL_GUID,
    STANDINGS_INFO_MODAL_GUID,
    WEBSITE_INFO_MODAL_GUID,
    WEBSITE_INFO_TITLE,
    WebsiteInfoBody,
} from '../../../../src/components/common/infoModalMessages';

describe('shared form and message components', () => {
    it('defaults buttons to non-submit and preserves explicit type and state props', () => {
        const { rerender } = render(<Button>Save</Button>);
        const button = screen.getByRole('button', { name: 'Save' });
        expect(button).toHaveAttribute('type', 'button');
        expect(button).not.toHaveClass('w-full');

        rerender(<Button type="submit" fullWidth disabled className="extra">Save</Button>);
        expect(button).toHaveAttribute('type', 'submit');
        expect(button).toBeDisabled();
        expect(button).toHaveClass('w-full', 'button-disabled', 'extra');
    });

    it('renders page and field errors with their semantics, ids and caller classes', () => {
        render(<>
            <ErrorMessage testId="page-error" className="extra">Could not load</ErrorMessage>
            <FieldError testId="field-error" className="extra">Required</FieldError>
        </>);
        expect(screen.getByTestId('page-error')).toHaveTextContent('Could not load');
        expect(screen.getByTestId('page-error')).toHaveClass('error-message', 'extra');
        expect(screen.getByTestId('field-error').tagName).toBe('P');
        expect(screen.getByTestId('field-error')).toHaveClass('field-error', 'extra');
    });

    it('keeps the base error styles when the optional className is omitted', () => {
        render(<><ErrorMessage>Page error</ErrorMessage><FieldError>Field error</FieldError></>);
        expect(screen.getByText('Page error')).toHaveClass('error-message');
        expect(screen.getByText('Field error')).toHaveClass('field-error');
        expect(screen.getByText('Field error')).not.toHaveClass('Stryker was here!');
    });

    it('associates a label with its control and renders optional hint and error', () => {
        render(<FormField htmlFor="team" label="Team" hint="Choose your team" error={<span>Required</span>}>
            <input id="team" />
        </FormField>);
        expect(screen.getByLabelText('Team')).toBeInTheDocument();
        expect(screen.getByText('Choose your team')).toHaveClass('text-sm', 'text-secondary-text', 'mb-2');
        expect(screen.getByText('Required')).toBeInTheDocument();
    });

    it('does not add an empty hint container when no hint is provided', () => {
        const { container } = render(<FormField htmlFor="team" label="Team"><input id="team" /></FormField>);
        expect(container.querySelector('.text-secondary-text.mb-2')).toBeNull();
    });

    it('keeps modal identifiers and required guidance stable', () => {
        expect(RATE_INFO_MODAL_GUID).toBe('3732bda6-ce5f-407e-95d7-8f638cb333cc');
        expect(STANDINGS_INFO_MODAL_GUID).toBe('b61b3cb1-0513-4b46-960d-c8c423004c55');
        expect(WEBSITE_INFO_MODAL_GUID).toBe('8f2c5ac0-c61a-4c62-8592-fbef32af8949');
        expect(DISPUTES_INFO_TITLE).toBe('Match disputes & Kudos');
        expect(WEBSITE_INFO_TITLE).toBe('Please be aware that:');
        const { rerender } = render(<DisputesInfoBody />);
        expect(screen.getByText(/direct match disputes to the league officials/)).toBeInTheDocument();
        expect(screen.getByText(/not responsible for resolving disputes related to Kudos/)).toBeInTheDocument();
        rerender(<WebsiteInfoBody />);
        expect(screen.getByText(/business and reporting remain centralised on the league website/)).toBeInTheDocument();
        expect(screen.getByText(/refer to the league website/)).toBeInTheDocument();
    });
});
