import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KudosStandings } from '../../../src/pages/KudosStandings';
import { STANDINGS_INFO_MODAL_GUID, WEBSITE_INFO_MODAL_GUID } from '../../../src/components/common/infoModalMessages';

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
            expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));

        await waitFor(() => {
            expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument();
        });
    });

    it('does NOT show either modal when the Awarded load rejects', async () => {
        kudosApiMocks.getCachedPlayerKudos.mockRejectedValue(new Error('boom'));

        renderPage();

        await waitFor(() => {
            expect(kudosApiMocks.getCachedPlayerKudos).toHaveBeenCalled();
        });

        expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
        expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
    });

    it('shows the website modal when only the disputes preference is already suppressed', async () => {
        localStorage.setItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`, 'true');

        renderPage();

        await waitFor(() => {
            expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
    });

    it('shows the pair only once across a tab switch, even though the Team tab also loads successfully', async () => {
        renderPage();

        await waitFor(() => { expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument(); });
        fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));
        await waitFor(() => { expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument(); });
        fireEvent.click(screen.getByTestId('standings-info-modal-ok'));
        expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
        expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText("Team's"));

        await waitFor(() => { expect(kudosApiMocks.getCachedTeamKudos).toHaveBeenCalled(); });
        expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
        expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
    });

    // "Once per visit" means once per mount (D1): a remount is a new visit, and the pair must
    // reappear. Do NOT "fix" this by making the once-per-visit guard persistent.
    it('shows the pair again after the page is unmounted and remounted', async () => {
        const { unmount } = renderPage();

        await waitFor(() => { expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument(); });
        fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));
        await waitFor(() => { expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument(); });
        fireEvent.click(screen.getByTestId('standings-info-modal-ok'));
        unmount();
        cleanup();

        renderPage();

        await waitFor(() => { expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument(); });
    });

    describe('suppression combinations', () => {
        it('neither suppressed: shows the website modal, then the disputes modal, in that order', async () => {
            renderPage();

            await waitFor(() => { expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument(); });
            expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();

            fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));

            await waitFor(() => { expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument(); });
            expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
        });

        it('website suppressed: the disputes modal opens directly on load', async () => {
            localStorage.setItem(`hide_modal_${WEBSITE_INFO_MODAL_GUID}_test-user-sub`, 'true');

            renderPage();

            await waitFor(() => { expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument(); });
            expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
        });

        it('disputes suppressed: the website modal opens and its OK closes everything', async () => {
            localStorage.setItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`, 'true');

            renderPage();

            await waitFor(() => { expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument(); });

            fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));

            expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
            expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
        });

        it('both suppressed: nothing opens', async () => {
            localStorage.setItem(`hide_modal_${WEBSITE_INFO_MODAL_GUID}_test-user-sub`, 'true');
            localStorage.setItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`, 'true');

            renderPage();

            await waitFor(() => {
                expect(kudosApiMocks.getCachedPlayerKudos).toHaveBeenCalled();
            });

            expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
            expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
        });
    });

    // Guards E6: rendering both modals from one JSX position would let React preserve InfoModal's
    // internal `dontShowAgain` state across the two, carrying a tick on the website modal into the
    // disputes modal and silently suppressing a message the user never agreed to hide.
    it('does not carry a ticked "don\'t show again" checkbox from the website modal into the disputes modal', async () => {
        renderPage();

        await waitFor(() => { expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument(); });
        fireEvent.click(screen.getByTestId('standings-website-info-modal-dont-show-again'));
        fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));

        await waitFor(() => { expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument(); });
        expect(screen.getByTestId('standings-info-modal-dont-show-again')).not.toBeChecked();

        fireEvent.click(screen.getByTestId('standings-info-modal-ok'));

        expect(localStorage.getItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`)).toBeNull();
    });
});
