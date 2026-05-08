import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Join } from '../../../src/pages/Join';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { inviteApi } from '../../../src/api/inviteApi';
import type { Invite } from '../../../src/types/invite';

// Mock the hooks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ inviteId: 'test-nano-id' }),
    };
});

const mockUseAuth = vi.fn();
vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

const mockUseAcceptInvite = vi.fn();
vi.mock('../../../src/hooks/useAcceptInvite', () => ({
    useAcceptInvite: () => mockUseAcceptInvite() as unknown,
}));

// Mock inviteApi
vi.mock('../../../src/api/inviteApi', () => ({
    inviteApi: {
        getInvite: vi.fn(),
    },
}));

describe('Join Page Logic', () => {
    const mockInvite: Invite = {
        nano_id: 'test-nano-id',
        invited_by: 'Admin',
        invitee_name: 'Luca Minudel',
        invitee_email_id: 'luca.minudel@gmail.com',
        invitee_role: 'CLUB_MANAGER',
        invitee_club: 'Morpeth',
        club_location: 'London',
        league: 'CLTTL',
        season: '2025-2026',
        created_at: 1715080000,
        accepted_at: null,
        invitee_already_registered: false,
    };

    // Helper to provide a complete useAuth mock
    const setAuthMock = (overrides = {}) => {
        mockUseAuth.mockReturnValue({
            isAuthenticated: false,
            email: null,
            username: null,
            activeSeasons: [],
            managedClubs: [],
            isPlayerOrCaptain: false,
            isClubManager: false,
            signOut: vi.fn(),
            refreshActiveSeasons: vi.fn(),
            ...overrides,
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        
        setAuthMock(); // Default unauthenticated state

        mockUseAcceptInvite.mockReturnValue({
            status: 'idle',
            error: null,
            acceptInvite: vi.fn(),
        });
    });

    const renderJoinPage = () => {
        return render(
            <MemoryRouter initialEntries={['/join/test-nano-id']}>
                <Routes>
                    <Route path="/join/:inviteId" element={<Join />} />
                </Routes>
            </MemoryRouter>
        );
    };

    it('shows "Join" in title and only "Register" button when user is NOT registered and NOT logged in', async () => {
        setAuthMock({
            isAuthenticated: false,
        });

        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            invitee_already_registered: false,
        });

        renderJoinPage();

        // Wait for loading to finish
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        // Check Title
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Join/i);

        // Check buttons
        expect(screen.getByTestId('join-register-button')).toBeInTheDocument();
        expect(screen.queryByTestId('join-login-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('join-accept-invite-button')).not.toBeInTheDocument();
    });

    it('shows "Accept" in title and only "Login & Accept" button when user IS registered but NOT logged in', async () => {
        setAuthMock({
            isAuthenticated: false,
        });

        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            invitee_already_registered: true,
        });

        renderJoinPage();

        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        // Check Title
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Accept/i);

        // Check buttons
        expect(screen.queryByTestId('join-register-button')).not.toBeInTheDocument();
        expect(screen.getByTestId('join-login-button')).toBeInTheDocument();
        expect(screen.queryByTestId('join-accept-invite-button')).not.toBeInTheDocument();
    });

    it('shows only "Accept Invite" button when user IS logged in with matching email', async () => {
        setAuthMock({
            isAuthenticated: true,
            email: 'luca.minudel@gmail.com',
            username: 'Luca',
        });

        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            invitee_already_registered: true,
        });

        renderJoinPage();

        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        // Check Title
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Accept/i);

        // Check buttons
        expect(screen.queryByTestId('join-register-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('join-login-button')).not.toBeInTheDocument();
        expect(screen.getByTestId('join-accept-invite-button')).toBeInTheDocument();
    });
});
