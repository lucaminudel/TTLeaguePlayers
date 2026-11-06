import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Join } from '../../../src/pages/Join';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { inviteApi } from '../../../src/api/inviteApi';
import type { Invite } from '../../../src/types/invite';

// Mock the hooks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: actual.useParams,
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

    afterEach(() => {
        vi.restoreAllMocks();
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

    it('renders the loading state before effects start the invite request', () => {
        const markup = renderToStaticMarkup(
            <MemoryRouter initialEntries={['/join/test-nano-id']}>
                <Routes>
                    <Route path="/join/:inviteId" element={<Join />} />
                </Routes>
            </MemoryRouter>
        );

        expect(markup).toContain('data-testid="join-loading-message"');
        expect(markup).not.toContain('data-testid="join-missing-invite-error"');
    });

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
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Join - Club Invite');
        expect(screen.getByTestId('join-invite-to')).toHaveTextContent('To Club Manager');
        expect(screen.getByTestId('join-invite-email')).toHaveTextContent(mockInvite.invitee_email_id);
        expect(screen.getByTestId('join-invite-club')).toHaveTextContent('Morpeth, London');
        expect(screen.queryByTestId('join-invite-team')).not.toBeInTheDocument();

        // Check buttons
        expect(screen.getByTestId('join-register-button')).toBeInTheDocument();
        expect(screen.queryByTestId('join-login-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('join-accept-invite-button')).not.toBeInTheDocument();
    });

    it.each([
        { role: 'PLAYER', displayedRole: 'Player' },
        { role: 'CAPTAIN', displayedRole: 'Team Captain' },
    ] as const)('shows the personal-invite details for a $role invite', async ({ role, displayedRole }) => {
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            invitee_role: role,
            invitee_team: 'Eagles',
            team_division: 'Division 1',
            invitee_already_registered: false,
        });

        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Join - Personal Invite');
        expect(screen.getByTestId('join-invite-to')).toHaveTextContent(`To ${displayedRole}`);
        expect(screen.getByTestId('join-invite-team')).toHaveTextContent('Eagles, Division 1');
        expect(screen.queryByTestId('join-invite-club')).not.toBeInTheDocument();
    });

    it('shows an unknown invite role without hiding its team details', async () => {
        const inviteWithNewRole = {
            ...mockInvite,
            invitee_role: 'COACH',
            invitee_team: 'Eagles',
            team_division: 'Division 1',
        } as unknown as Invite;
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue(inviteWithNewRole);

        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('join-invite-to')).toHaveTextContent('To COACH');
        expect(screen.getByTestId('join-invite-team')).toHaveTextContent('Eagles, Division 1');
    });

    it('shows its loading state until the invite request completes', async () => {
        let resolveInvite!: (invite: Invite) => void;
        vi.spyOn(inviteApi, 'getInvite').mockImplementation(() => new Promise<Invite>((resolve) => {
            resolveInvite = resolve;
        }));

        renderJoinPage();

        expect(screen.getByTestId('join-loading-message')).toHaveTextContent('Waiting for a response...');
        expect(screen.queryByTestId('join-invite-details')).not.toBeInTheDocument();

        resolveInvite(mockInvite);
        await waitFor(() => {
            expect(screen.getByTestId('join-invite-details')).toBeVisible();
        });
    });

    it('updates the browser title when the invite details arrive', async () => {
        let resolveInvite!: (invite: Invite) => void;
        vi.spyOn(inviteApi, 'getInvite').mockImplementation(() => new Promise<Invite>((resolve) => {
            resolveInvite = resolve;
        }));

        renderJoinPage();

        await waitFor(() => {
            expect(document.title).toBe('Join / Accept Invite');
        });

        await act(async () => {
            resolveInvite({
                ...mockInvite,
                invitee_role: 'PLAYER',
                invitee_team: 'Eagles',
                team_division: 'Division 1',
            });
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(document.title).toBe('Join - Personal Invite');
        });
    });

    it('shows a missing-invite message when the successful response has no invite', async () => {
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue(JSON.parse('null') as Invite);

        renderJoinPage();

        expect(await screen.findByTestId('join-missing-invite-error')).toHaveTextContent('Invite data is missing');
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
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Accept - Club Invite');

        // Check buttons
        expect(screen.queryByTestId('join-register-button')).not.toBeInTheDocument();
        expect(screen.getByTestId('join-login-button')).toBeInTheDocument();
        expect(screen.queryByTestId('join-accept-invite-button')).not.toBeInTheDocument();
    });

    it('sends an unregistered invitee to Register with the invite in navigation state', async () => {
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue(mockInvite);
        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('join-register-button'));

        expect(mockNavigate).toHaveBeenCalledWith('/register', { state: { invite: mockInvite } });
    });

    it('sends a registered invitee to Login with an encoded return URL and email', async () => {
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            invitee_already_registered: true,
        });
        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('join-login-button'));

        expect(mockNavigate).toHaveBeenCalledWith(
            '/login?returnUrl=%2Fjoin%2Ftest-nano-id&email=luca.minudel%40gmail.com'
        );
    });

    it('explains when the authenticated user email does not match the invite', async () => {
        setAuthMock({
            isAuthenticated: true,
            email: 'another.user@example.com',
        });
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue(mockInvite);
        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('join-email-mismatch-error')).toHaveTextContent(
            'This invite is for luca.minudel@gmail.com. It is not for you: another.user@example.com.'
        );
        expect(screen.queryByTestId('join-register-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('join-login-button')).not.toBeInTheDocument();
    });

    it.each([
        {
            description: 'malformed invite links',
            error: { status: 400, message: 'Bad Request', response: 'nano_id malformed' },
            message: 'Please check this invitation link; it appears to be incorrect, missing characters, or containing extra ones.',
            retry: false,
        },
        {
            description: 'missing invites',
            error: { status: 404, message: 'Not Found' },
            message: 'This invitation cannot be found. It may have expired, been canceled, or is no longer valid. If you believe this is an error, please contact us.',
            retry: false,
        },
        {
            description: 'status-only missing invites',
            error: { status: 404 },
            message: 'This invitation cannot be found. It may have expired, been canceled, or is no longer valid. If you believe this is an error, please contact us.',
            retry: false,
        },
        {
            description: 'status-only bad requests without the malformed-link marker',
            error: { status: 400 },
            message: 'An unexpected error occurred. Please try again.',
            retry: true,
        },
        {
            description: 'already-used invites',
            error: { status: 409, message: 'Conflict' },
            message: 'Invite already used. Have you already registered? Try logging in.',
            retry: false,
        },
        {
            description: 'HTTP 500 server failures',
            error: { status: 500, message: 'Internal Server Error' },
            message: 'The server is not available, retry later.',
            retry: true,
        },
        {
            description: 'server failures',
            error: { status: 503, message: 'Unavailable' },
            message: 'The server is not available, retry later.',
            retry: true,
        },
        {
            description: 'network failures',
            error: new Error('Connection error'),
            message: 'Network connection error. Make sure you are online and retry later.',
            retry: true,
        },
        {
            description: 'network failure after a retryable HTTP response',
            error: { status: 429, message: 'Connection error' },
            message: 'Network connection error. Make sure you are online and retry later.',
            retry: true,
        },
        {
            description: 'network failures reported by Cognito-style API errors',
            error: { status: 400, message: 'NetworkError: request failed' },
            message: 'Network connection error. Make sure you are online and retry later.',
            retry: true,
        },
        {
            description: 'fetch failures with a client status',
            error: { status: 400, message: 'Failed to fetch' },
            message: 'Network connection error. Make sure you are online and retry later.',
            retry: true,
        },
        {
            description: 'API errors with an unknown status',
            error: { message: 'The invite service could not be reached' },
            message: 'Network connection error. Make sure you are online and retry later.',
            retry: true,
        },
        {
            description: 'other client errors',
            error: { status: 400, message: 'The invite request was rejected' },
            message: 'The invite request was rejected',
            retry: true,
        },
        {
            description: 'API errors with an empty message',
            error: { status: 400, message: '' },
            message: 'An unexpected error occurred. Please try again.',
            retry: true,
        },
        {
            description: 'unexpected failures',
            error: 'unexpected rejection',
            message: 'An unexpected error occurred. Please try again.',
            retry: true,
        },
        {
            description: 'unexpected object rejections',
            error: {},
            message: 'An unexpected error occurred. Please try again.',
            retry: true,
        },
        {
            description: 'null rejections',
            error: null,
            message: 'An unexpected error occurred. Please try again.',
            retry: true,
        },
    ])('shows the correct error and retry action for $description', async ({ error, message, retry }) => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(inviteApi, 'getInvite').mockRejectedValue(error);

        renderJoinPage();

        expect(await screen.findByTestId('join-error-message')).toHaveTextContent(message);
        if (retry) {
            expect(screen.getByTestId('join-retry-button')).toBeVisible();
        } else {
            expect(screen.queryByTestId('join-retry-button')).not.toBeInTheDocument();
        }
        expect(consoleError).toHaveBeenCalledWith('Error fetching invite:', error);
    });

    it('reloads when the user selects Retry after a retryable invite error', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(inviteApi, 'getInvite').mockRejectedValue({
            status: 500,
            message: 'Internal Server Error',
        });
        renderJoinPage();

        const retryButton = await screen.findByTestId('join-retry-button');
        const reload = vi.fn();
        vi.stubGlobal('window', { location: { reload } });
        try {
            fireEvent.click(retryButton);
        } finally {
            vi.unstubAllGlobals();
        }

        expect(reload).toHaveBeenCalledOnce();
        expect(consoleError).toHaveBeenCalledWith('Error fetching invite:', {
            status: 500,
            message: 'Internal Server Error',
        });
    });

    it('keeps the latest invite when an earlier invite request resolves late', async () => {
        let resolveFirst!: (invite: Invite) => void;
        let resolveSecond!: (invite: Invite) => void;
        const getInvite = vi.spyOn(inviteApi, 'getInvite')
            .mockImplementationOnce(() => new Promise<Invite>((resolve) => { resolveFirst = resolve; }))
            .mockImplementationOnce(() => new Promise<Invite>((resolve) => { resolveSecond = resolve; }));

        render(
            <MemoryRouter initialEntries={['/join/first-invite']}>
                <Link to="/join/second-invite">Open second invite</Link>
                <Routes>
                    <Route path="/join/:inviteId" element={<Join />} />
                </Routes>
            </MemoryRouter>
        );
        await waitFor(() => {
            expect(getInvite).toHaveBeenCalledWith('first-invite', 5000, 3);
        });

        fireEvent.click(screen.getByRole('link', { name: 'Open second invite' }));
        await waitFor(() => {
            expect(getInvite).toHaveBeenCalledWith('second-invite', 5000, 3);
        });

        await act(async () => {
            resolveSecond({ ...mockInvite, nano_id: 'second-invite', invitee_name: 'Second invitee' });
            await Promise.resolve();
        });
        expect(await screen.findByText('Second invitee')).toBeVisible();

        await act(async () => {
            resolveFirst({ ...mockInvite, nano_id: 'first-invite', invitee_name: 'First invitee' });
            await Promise.resolve();
        });
        expect(screen.queryByText('First invitee')).not.toBeInTheDocument();
        expect(screen.getByText('Second invitee')).toBeVisible();
    });

    it('ignores a failure from an earlier invite request after the route changes', async () => {
        let rejectFirst!: (error: Error) => void;
        let resolveSecond!: (invite: Invite) => void;
        const getInvite = vi.spyOn(inviteApi, 'getInvite')
            .mockImplementationOnce(() => new Promise<Invite>((_resolve, reject) => { rejectFirst = reject; }))
            .mockImplementationOnce(() => new Promise<Invite>((resolve) => { resolveSecond = resolve; }));
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        render(
            <MemoryRouter initialEntries={['/join/first-invite']}>
                <Link to="/join/second-invite">Open second invite</Link>
                <Routes>
                    <Route path="/join/:inviteId" element={<Join />} />
                </Routes>
            </MemoryRouter>
        );
        await waitFor(() => {
            expect(getInvite).toHaveBeenCalledWith('first-invite', 5000, 3);
        });

        fireEvent.click(screen.getByRole('link', { name: 'Open second invite' }));
        await waitFor(() => {
            expect(getInvite).toHaveBeenCalledWith('second-invite', 5000, 3);
        });

        await act(async () => {
            rejectFirst(new Error('Stale request failed'));
            await Promise.resolve();
        });

        expect(screen.getByTestId('join-loading-message')).toBeVisible();
        expect(screen.queryByTestId('join-error-message')).not.toBeInTheDocument();
        expect(screen.queryByTestId('join-retry-button')).not.toBeInTheDocument();

        await act(async () => {
            resolveSecond({ ...mockInvite, nano_id: 'second-invite', invitee_name: 'Second invitee' });
            await Promise.resolve();
        });

        expect(await screen.findByText('Second invitee')).toBeVisible();
        expect(screen.queryByTestId('join-error-message')).not.toBeInTheDocument();
        expect(screen.queryByTestId('join-retry-button')).not.toBeInTheDocument();
        expect(consoleError).not.toHaveBeenCalled();
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
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Accept - Club Invite');

        // Check buttons
        expect(screen.queryByTestId('join-register-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('join-login-button')).not.toBeInTheDocument();
        expect(screen.getByTestId('join-accept-invite-button')).toBeInTheDocument();
    });

    it('shows the accept title and action for a matching authenticated invitee even when marked unregistered', async () => {
        setAuthMock({
            isAuthenticated: true,
            email: mockInvite.invitee_email_id,
        });
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            invitee_role: 'PLAYER',
            invitee_team: 'Eagles',
            team_division: 'Division 1',
            invitee_already_registered: false,
        });

        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Accept - Personal Invite');
        await waitFor(() => {
            expect(document.title).toBe('Accept - Personal Invite');
        });
        expect(screen.getByTestId('join-accept-invite-button')).toBeVisible();
        expect(screen.queryByTestId('join-email-mismatch-error')).not.toBeInTheDocument();
    });

    it('accepts the invite, refreshes account roles, and navigates home', async () => {
        const acceptInvite = vi.fn().mockResolvedValue(true);
        let finishRefresh: (() => void) | undefined;
        const refreshActiveSeasons = vi.fn(() => new Promise<void>((resolve) => {
            finishRefresh = resolve;
        }));
        setAuthMock({
            isAuthenticated: true,
            email: mockInvite.invitee_email_id,
            refreshActiveSeasons,
        });
        mockUseAcceptInvite.mockReturnValue({
            status: 'idle',
            error: null,
            acceptInvite,
        });
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            invitee_already_registered: true,
        });
        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('join-accept-invite-button'));

        await waitFor(() => {
            expect(refreshActiveSeasons).toHaveBeenCalledOnce();
        });
        expect(mockNavigate).not.toHaveBeenCalled();

        finishRefresh?.();
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });
        expect(acceptInvite).toHaveBeenCalledOnce();
        expect(acceptInvite).toHaveBeenCalledWith(mockInvite.nano_id);
    });

    it('shows the hook error and stays on the page when invite acceptance fails', async () => {
        const acceptInvite = vi.fn().mockImplementation(() => {
            mockUseAcceptInvite.mockReturnValue({
                status: 'failed',
                error: 'Operation failed. Please contact support to fix the problem.',
                acceptInvite,
            });
            return Promise.resolve(false);
        });
        const refreshActiveSeasons = vi.fn().mockResolvedValue(undefined);
        setAuthMock({
            isAuthenticated: true,
            email: mockInvite.invitee_email_id,
            refreshActiveSeasons,
        });
        mockUseAcceptInvite.mockReturnValue({
            status: 'idle',
            error: null,
            acceptInvite,
        });
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            invitee_already_registered: true,
        });
        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('join-accept-invite-button'));

        await waitFor(() => {
            expect(screen.getByTestId('join-accept-invite-error')).toHaveTextContent(
                'Operation failed. Please contact support to fix the problem.'
            );
        });
        expect(acceptInvite).toHaveBeenCalledWith(mockInvite.nano_id);
        expect(refreshActiveSeasons).not.toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('disables the accept button while the hook is pending and re-enables it afterward', async () => {
        let finishAccept: ((accepted: boolean) => void) | undefined;
        const acceptInvite = vi.fn(() => new Promise<boolean>((resolve) => {
            finishAccept = resolve;
        }));
        setAuthMock({
            isAuthenticated: true,
            email: mockInvite.invitee_email_id,
        });
        mockUseAcceptInvite.mockReturnValue({
            status: 'idle',
            error: null,
            acceptInvite,
        });
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            invitee_already_registered: true,
        });
        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        const acceptButton = screen.getByTestId('join-accept-invite-button');
        fireEvent.click(acceptButton);

        expect(acceptButton).toBeDisabled();
        expect(acceptButton).toHaveTextContent('Accepting invite...');

        finishAccept?.(false);
        await waitFor(() => {
            expect(acceptButton).toBeEnabled();
            expect(acceptButton).toHaveTextContent('Accept Invite');
        });
    });

    it('shows a disabled retrying button while the hook waits to retry', async () => {
        setAuthMock({
            isAuthenticated: true,
            email: mockInvite.invitee_email_id,
        });
        mockUseAcceptInvite.mockReturnValue({
            status: 'waiting_to_retry',
            error: null,
            acceptInvite: vi.fn(),
        });
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            invitee_already_registered: true,
        });
        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        const acceptButton = screen.getByTestId('join-accept-invite-button');
        expect(acceptButton).toBeDisabled();
        expect(acceptButton).toHaveTextContent('Retrying...');
    });

    it('disables acceptance and explains when the invite has already been redeemed', async () => {
        const acceptInvite = vi.fn();
        setAuthMock({
            isAuthenticated: true,
            email: mockInvite.invitee_email_id,
        });
        mockUseAcceptInvite.mockReturnValue({
            status: 'idle',
            error: null,
            acceptInvite,
        });
        vi.spyOn(inviteApi, 'getInvite').mockResolvedValue({
            ...mockInvite,
            accepted_at: 1715090000,
            invitee_already_registered: true,
        });
        renderJoinPage();
        await waitFor(() => {
            expect(screen.queryByTestId('join-loading-message')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('join-invite-redeemed-error')).toHaveTextContent('Invite already redeemed');
        expect(screen.getByTestId('join-accept-invite-button')).toBeDisabled();
        expect(screen.queryByTestId('join-invite-email')).not.toBeInTheDocument();
        expect(acceptInvite).not.toHaveBeenCalled();
    });
});
