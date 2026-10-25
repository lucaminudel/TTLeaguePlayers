import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { act, render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
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
    it.each(['Awarded', "Team's", 'Table'])('updates the open %s tab after a background refresh', async (tab) => {
        localStorage.setItem(`hide_modal_${WEBSITE_INFO_MODAL_GUID}_test-user-sub`, 'true');
        localStorage.setItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`, 'true');
        const view = renderPage();
        await waitFor(() => { expect(screen.getByText('No kudos awarded yet.')).toBeTruthy(); });
        if (tab !== 'Awarded') fireEvent.click(screen.getByText(tab));
        const mock = tab === 'Awarded' ? kudosApiMocks.getCachedPlayerKudos
            : tab === "Team's" ? kudosApiMocks.getCachedTeamKudos : kudosApiMocks.getCachedKudosStandings;
        await waitFor(() => { expect(mock).toHaveBeenCalled(); });
        const expectedRequest = tab === 'Table'
            ? { league: ACTIVE_SEASON.league, season: ACTIVE_SEASON.season, teamDivision: ACTIVE_SEASON.team_division }
            : { league: ACTIVE_SEASON.league, season: ACTIVE_SEASON.season, teamDivision: ACTIVE_SEASON.team_division,
                teamName: ACTIVE_SEASON.team_name, ...(tab === 'Awarded' ? { giver_person_name: ACTIVE_SEASON.person_name, giverPersonSub: 'test-user-sub' } : {}) };
        expect(mock).toHaveBeenLastCalledWith(expectedRequest, expect.any(Function));
        const update = mock.mock.calls.at(-1)?.[1] as (data: unknown) => void;
        const match = {
            league: 'CLTTL', season: '2025-2026', division: 'Division 4', receiving_team: 'Walworth 2',
            home_team: 'Walworth 2', away_team: 'Fresh Opponent', match_date_time: 1786000000,
        };
        const data = tab === 'Awarded' ? [{ ...match, receiving_team: 'Fresh Opponent', kudos_value: 1,
            giver_team: 'Walworth 2', giver_person_name: 'Test Person', giver_person_sub: 'test-user-sub' }]
            : tab === "Team's" ? [{ ...match, positive_kudos_count: 1, neutral_kudos_count: 0, negative_kudos_count: 0, item_type: 'summary' }]
                : { positive_kudos_table: [{ team_name: 'Fresh Opponent', count: 5 }], neutral_kudos_table: [], negative_kudos_table: [] };
        act(() => { update(data); });
        expect(screen.getByText('Fresh Opponent')).toBeTruthy();
        act(() => { update(tab === 'Table' ? { positive_kudos_table: [], neutral_kudos_table: [], negative_kudos_table: [] } : []); });
        expect(screen.queryByText('Fresh Opponent')).toBeNull();
        view.unmount();
        act(() => { update(data); });
        expect(screen.queryByText('Fresh Opponent')).toBeNull();
    });

    it.each([
        ["Team's", 'Failed to fetch team kudos'],
        ['Table', 'Failed to fetch kudos standings'],
    ])('shows a load error for the %s tab', async (tab, message) => {
        localStorage.setItem(`hide_modal_${WEBSITE_INFO_MODAL_GUID}_test-user-sub`, 'true');
        localStorage.setItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`, 'true');
        const api = tab === "Team's" ? kudosApiMocks.getCachedTeamKudos : kudosApiMocks.getCachedKudosStandings;
        api.mockRejectedValue(new Error('Current request failed'));
        renderPage();
        await waitFor(() => { expect(screen.getByText('No kudos awarded yet.')).toBeTruthy(); });
        fireEvent.click(screen.getByText(tab));
        await waitFor(() => { expect(screen.getByText(message)).toBeTruthy(); });
    });

    describe.each([
        ['Awarded', "Team's"], ["Team's", 'Table'], ['Table', 'Awarded'],
    ])('%s to %s pending request switch', (oldTab, nextTab) => {
        it.each(['success', 'failure'])('ignores the discarded %s until the current tab finishes', async (outcome) => {
            const apiFor = (tab: string) => tab === 'Awarded' ? kudosApiMocks.getCachedPlayerKudos
                : tab === "Team's" ? kudosApiMocks.getCachedTeamKudos : kudosApiMocks.getCachedKudosStandings;
            let resolveOld!: (data: unknown) => void;
            let rejectOld!: (error: Error) => void;
            let resolveCurrent!: (data: unknown) => void;
            const oldApi = apiFor(oldTab);
            oldApi.mockReturnValue(new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; }));
            if (oldTab !== 'Awarded') kudosApiMocks.getCachedPlayerKudos.mockRejectedValue(new Error('Initial awarded unavailable'));
            renderPage();
            if (oldTab !== 'Awarded') {
                await waitFor(() => { expect(screen.getByText('Failed to fetch kudos history')).toBeTruthy(); });
                fireEvent.click(screen.getByText(oldTab));
            }
            await waitFor(() => { expect(oldApi).toHaveBeenCalled(); });
            const currentApi = apiFor(nextTab);
            const callsBeforeSwitch = currentApi.mock.calls.length;
            currentApi.mockReturnValue(new Promise((resolve) => { resolveCurrent = resolve; }));
            fireEvent.click(screen.getByText(nextTab));
            await waitFor(() => { expect(currentApi.mock.calls.length).toBeGreaterThan(callsBeforeSwitch); });
            await act(async () => {
                if (outcome === 'failure') rejectOld(new Error('Discarded request failed'));
                else resolveOld(oldTab === 'Table' ? { positive_kudos_table: [], neutral_kudos_table: [], negative_kudos_table: [] } : []);
                await Promise.resolve();
            });
            expect(screen.getByText('Loading...')).toBeTruthy();
            expect(screen.queryByTestId('standings-website-info-modal')).toBeNull();
            expect(screen.queryByText(/Failed to fetch/)).toBeNull();
            await act(async () => {
                resolveCurrent(nextTab === 'Table' ? { positive_kudos_table: [], neutral_kudos_table: [], negative_kudos_table: [] } : []);
                await Promise.resolve();
            });
            const message = nextTab === 'Awarded' ? 'No kudos awarded yet.'
                : nextTab === "Team's" ? 'No kudos received yet.' : 'No standings data available.';
            await waitFor(() => { expect(screen.getByText(message)).toBeTruthy(); });
            await waitFor(() => { expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument(); });
        });
    });

    it('shows an error when the current Awarded request fails', async () => {
        kudosApiMocks.getCachedPlayerKudos.mockRejectedValue(new Error('Current request failed'));
        renderPage();
        await waitFor(() => { expect(screen.getByText('Failed to fetch kudos history')).toBeTruthy(); });
    });

    it.each(["Team's", 'Table'])('shows information after the first successful load is the %s tab', async (tab) => {
        kudosApiMocks.getCachedPlayerKudos.mockReturnValue(new Promise(() => undefined));
        renderPage();
        await waitFor(() => { expect(kudosApiMocks.getCachedPlayerKudos).toHaveBeenCalled(); });
        fireEvent.click(screen.getByText(tab));
        await waitFor(() => { expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument(); });
    });

});
