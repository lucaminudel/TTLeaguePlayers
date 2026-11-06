import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageContainer } from '../../../../src/components/layout/PageContainer';

describe('PageContainer', () => {
    it('renders the title and content and updates the browser title', async () => {
        const { rerender } = render(
            <PageContainer title="Club details">
                <p>Club directory content</p>
            </PageContainer>
        );

        expect(screen.getByRole('heading', { level: 2, name: 'Club details' })).toBeInTheDocument();
        expect(screen.getByText('Club directory content')).toBeInTheDocument();
        await waitFor(() => { expect(document.title).toBe('Club details'); });
        expect(screen.getByText('Club directory content').parentElement).toHaveClass(
            'text-lg', 'sm:text-xl', 'text-secondary-text', 'leading-relaxed', 'px-4'
        );
        expect(screen.queryByText('Footer action')).not.toBeInTheDocument();

        rerender(
            <PageContainer title="Updated club details">
                <p>Updated club directory content</p>
            </PageContainer>
        );

        expect(screen.getByRole('heading', { level: 2, name: 'Updated club details' })).toBeInTheDocument();
        await waitFor(() => { expect(document.title).toBe('Updated club details'); });
    });

    it('keeps the footer pinned and forwards native form props without duplicating the class', () => {
        const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); });
        render(
            <PageContainer
                title="Edit club"
                footer={<button type="submit">Save club</button>}
                formProps={{ id: 'club-form', className: 'custom-form', onSubmit }}
            >
                <p>Form content</p>
            </PageContainer>
        );

        const form = screen.getByRole('button', { name: 'Save club' }).closest('form');
        if (!(form instanceof HTMLFormElement)) throw new Error('Expected Save club to be inside a form');
        expect(form).toHaveAttribute('id', 'club-form');
        expect(form.className).toBe('flex-1 flex flex-col w-full text-center mt-2 sm:mt-3 custom-form');
        expect(form).toHaveClass('flex-1', 'flex', 'flex-col', 'w-full', 'text-center', 'mt-2', 'sm:mt-3', 'custom-form');
        expect(form.className.match(/custom-form/g)).toHaveLength(1);
        expect(form.querySelector('div.mt-auto')).toHaveClass('w-full', 'px-6', 'sm:px-8', 'mt-auto', 'pb-4', 'sm:pb-8');

        fireEvent.submit(form);
        expect(onSubmit).toHaveBeenCalledOnce();
    });
});
