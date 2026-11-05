import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AboutAndContactUs } from '../../../src/pages/AboutAndContactUs';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    getAppVersion: vi.fn(),
}));

vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => mocks.useAuth() as unknown,
}));

vi.mock('../../../src/config/environment', () => ({
    getAppVersion: () => mocks.getAppVersion() as unknown,
}));

describe('AboutAndContactUs', () => {
    beforeEach(() => {
        mocks.useAuth.mockReturnValue({
            isAuthenticated: false,
            isPlayerOrCaptain: false,
            isClubManager: false,
            isCaptain: false,
            username: null,
            activeSeasons: [],
            managedClubs: [],
            userAttributesLoadFailed: false,
            signOut: vi.fn(),
        });
        mocks.getAppVersion.mockReturnValue({
            version: '2.0.3',
            buildDate: '05-Nov-2026',
            buildSeconds: '50000',
        });
    });

    const renderPage = () => render(
        <MemoryRouter>
            <AboutAndContactUs />
        </MemoryRouter>
    );

    it('presents the about page and its contact email link', () => {
        renderPage();

        expect(screen.getByRole('heading', { name: 'About & Contact Us' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Built by Players, for Players' })).toBeInTheDocument();
        expect(screen.getByText(/fair play, positive, inclusive behaviour/)).toBeInTheDocument();

        const emailLink = screen.getByTestId('about-email-link');
        expect(emailLink).toHaveTextContent('contact_us@ttleagueplayers.uk');
        expect(emailLink).toHaveAttribute('href', 'mailto:contact_us@ttleagueplayers.uk');
        expect(emailLink.parentElement?.textContent).toBe(
            'For technical support, general questions, or media enquiries, email us at: contact_us@ttleagueplayers.uk'
        );
    });

    it('shows the application version and build stamp supplied by the environment', () => {
        renderPage();

        expect(mocks.getAppVersion).toHaveBeenCalled();
        expect(screen.getByTestId('about-app-version')).toHaveTextContent(
            'App. Ver.2.0.3 (50000) — 05-Nov-2026'
        );
    });
});
