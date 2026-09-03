import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KudosStandings } from '../../../src/pages/KudosStandings';
import { STANDINGS_INFO_MODAL_GUID } from '../../../src/components/common/infoModalMessages';

const mockUseAuth = vi.fn();
vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

const kudosApiMocks = vi.hoisted(() => ({
    getCachedPlayerKudos: vi.fn(),
    getCachedTeamKudos: vi.fn(),
    getCachedKudosStandings: vi.fn(),
}));
vi.mock('../../../src/api/cachedKudosApi', () => ({
    getCachedPlayerKudos: kudosApiMocks.getCachedPlayerKudos,
    getCachedTeamKudos: kudosApiMocks.getCachedTeamKudos,
    getCachedKudosStandings: kudosApiMocks.getCachedKudosStandings,
}));

describe('KudosStandings info modal', () => {
    const ACTIVE_SEASON = {
        league: 'CLTTL',
        season: '2025-2026',
        team_name: 'Walworth 2',
        team_division: 'Division 4',
        person_name: 'Test Person',
        role: 'player',
        latest_kudos: [],
    };

    const renderPage = () => render(
        <MemoryRouter initialEntries={[{ pathname: '/kudos-standings', state: null }]}>
            <KudosStandings />
        </MemoryRouter>
    );

    let consoleErrorSpy: MockInstance;
    let consoleDebugSpy: MockInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        mockUseAuth.mockReturnValue({
            isAuthenticated: true,
            userId: 'test-user-sub',
            activeSeasons: [ACTIVE_SEASON],
            managedClubs: [],
        });
        kudosApiMocks.getCachedPlayerKudos.mockResolvedValue([]);
        kudosApiMocks.getCachedTeamKudos.mockResolvedValue([]);
        kudosApiMocks.getCachedKudosStandings.mockResolvedValue({
            positive_kudos_table: [],
            neutral_kudos_table: [],
            negative_kudos_table: [],
        });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleDebugSpy.mockRestore();
    });

    it('shows the modal after a successful Awarded load', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument();
        });
    });

    it('does NOT show the modal when the Awarded load rejects', async () => {
        kudosApiMocks.getCachedPlayerKudos.mockRejectedValue(new Error('boom'));

        renderPage();

        await waitFor(() => {
            expect(kudosApiMocks.getCachedPlayerKudos).toHaveBeenCalled();
        });

        expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
    });

    it('does NOT show the modal when the preference is already suppressed', async () => {
        localStorage.setItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`, 'true');

        renderPage();

        await waitFor(() => {
            expect(kudosApiMocks.getCachedPlayerKudos).toHaveBeenCalled();
        });

        expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
    });

    it('shows only once across a tab switch, even though the Team tab also loads successfully', async () => {
        renderPage();

        await waitFor(() => { expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument(); });
        fireEvent.click(screen.getByTestId('standings-info-modal-ok'));
        expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText("Team's"));

        await waitFor(() => { expect(kudosApiMocks.getCachedTeamKudos).toHaveBeenCalled(); });
        expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
    });

    // "Once per visit" means once per mount (D1): a remount is a new visit, and the modal must
    // reappear. Do NOT "fix" this by making the once-per-visit guard persistent.
    it('shows again after the page is unmounted and remounted', async () => {
        const { unmount } = renderPage();

        await waitFor(() => { expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument(); });
        fireEvent.click(screen.getByTestId('standings-info-modal-ok'));
        unmount();
        cleanup();

        renderPage();

        await waitFor(() => { expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument(); });
    });
});
