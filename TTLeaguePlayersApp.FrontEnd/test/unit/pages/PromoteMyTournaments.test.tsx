import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PromoteMyTournaments } from '../../../src/pages/PromoteMyTournaments';
import { GeneralApiError } from '../../../src/api/api';
import { setUnitFixedClockTime } from '../TestClockUtils';
import type { EnvironmentConfig } from '../../../src/config/environment';

const mockNavigate = vi.fn();
const clubsApiMocks = vi.hoisted(() => ({
    getTournamentsForClub: vi.fn(),
    upsertTournament: vi.fn(),
    deleteTournament: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockUseAuth = vi.fn();
vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

const mockGetConfig = vi.fn();
vi.mock('../../../src/config/environment', () => ({
    getConfig: () => mockGetConfig() as EnvironmentConfig,
}));

vi.mock('../../../src/api/clubsApi', () => ({
    clubsApi: {
        getTournamentsForClub: clubsApiMocks.getTournamentsForClub,
        upsertTournament: clubsApiMocks.upsertTournament,
        deleteTournament: clubsApiMocks.deleteTournament,
    },
}));

describe('PromoteMyTournaments', () => {
    // The whole suite runs on this fixed clock. Anything year-sensitive must be derived from it and
    // never from the real wall-clock, or the expectations drift as calendar years pass.
    const FIXED_CLOCK = '2025-06-01T12:00:00Z';
    const FIXED_CLOCK_YEAR = new Date(FIXED_CLOCK).getFullYear();

    const managedClub = {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'Morpeth TTC',
        club_location: 'London',
        manager_name: 'Luca',
    };

    const sampleTournament = {
        tournament_name: 'London Open 2025',
        tournament_info: 'https://london-open.example.com',
        instagram: '@londonopen',
        facebook: 'https://facebook.com/londonopen',
        start_date: 1735689600, // 2025-01-01
        end_date: 1738281600, // 2025-01-31
    };

    const defaultConfig: EnvironmentConfig = {
        FrontEnd: { WebsiteBaseUrl: 'https://example.test' },
        ApiGateWay: {
            ApiBaseUrl: 'https://api.example.test',
            CreateInviteAutomaticallySendInviteEmail: false,
        },
        DynamoDB: {
            ServiceLocalUrl: '',
            'AWS.Profile': '',
            'AWS.Region': null,
        },
        Cognito: {
            UserPoolId: 'test-user-pool',
            ClientId: 'test-client',
            Domain: 'auth.example.test',
        },
        EmailForwarder: {
            InviteEmailAddress: 'invites@example.test',
            ContactUsEmailAddress: 'contact@example.test',
            ForwardToEmailAddress: 'admin@example.test',
        },
        active_seasons_data_source: [{
            league: 'CLTTL',
            season: '2025-2026',
            custom_processor: 'CLTTLActiveSeason2026Processor',
            custom_club_processor: 'CLTTLManagedClub2026Processor',
            registrations_start_date: 1735689600,
            ratings_end_date: 1767139200,
            division_fixtures: [],
            division_players: [],
            club_teams: [],
        }],
    };

    const renderPage = () => {
        render(
            <MemoryRouter initialEntries={['/promote-my-tournaments']}>
                <PromoteMyTournaments />
            </MemoryRouter>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        setUnitFixedClockTime(FIXED_CLOCK);

        mockUseAuth.mockReturnValue({
            isAuthenticated: true,
            email: 'manager@example.test',
            username: 'Luca',
            activeSeasons: [],
            managedClubs: [managedClub],
            isPlayerOrCaptain: false,
            isClubManager: true,
            signOut: vi.fn(),
            refreshActiveSeasons: vi.fn(),
        });

        mockGetConfig.mockReturnValue(defaultConfig);
        clubsApiMocks.getTournamentsForClub.mockResolvedValue([sampleTournament]);
        clubsApiMocks.upsertTournament.mockResolvedValue(sampleTournament);
        clubsApiMocks.deleteTournament.mockResolvedValue(undefined);
    });

    describe('when user has managed clubs', () => {
        it('renders the ManagedClubsCard component', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText('My Club: Morpeth TTC')).toBeInTheDocument();
            });
        });

        it('shows the promote tournaments message when a club is selected', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/Now you can promote tournaments for Morpeth TTC in London/)).toBeInTheDocument();
            });
        });

        it('auto-selects the first club when there is only one managed club', async () => {
            renderPage();

            // The club should be auto-selected and the effectiveManagedClub should be set
            await waitFor(() => {
                expect(screen.getByText('My Club: Morpeth TTC')).toBeInTheDocument();
            });
            await waitFor(() => {
                expect(screen.getByText(/Now you can promote tournaments for Morpeth TTC in London/)).toBeInTheDocument();
            });
        });

        it('discards an open edit form if club management disappears and does not reopen it if it returns', async () => {
            const page = render(
                <MemoryRouter initialEntries={['/promote-my-tournaments']}>
                    <PromoteMyTournaments />
                </MemoryRouter>
            );

            await screen.findByText(/London Open 2025/);
            fireEvent.click(screen.getByTitle('Edit'));
            expect(screen.getByText('Edit Tournament')).toBeInTheDocument();

            mockUseAuth.mockReturnValue({
                isAuthenticated: true,
                email: 'manager@example.test',
                username: 'Luca',
                activeSeasons: [],
                managedClubs: [],
                isPlayerOrCaptain: false,
                isClubManager: false,
                signOut: vi.fn(),
                refreshActiveSeasons: vi.fn(),
            });
            page.rerender(
                <MemoryRouter initialEntries={['/promote-my-tournaments']}>
                    <PromoteMyTournaments />
                </MemoryRouter>
            );
            await screen.findByText('⚠️ You are not currently registered as a club manager.');

            mockUseAuth.mockReturnValue({
                isAuthenticated: true,
                email: 'manager@example.test',
                username: 'Luca',
                activeSeasons: [],
                managedClubs: [managedClub],
                isPlayerOrCaptain: false,
                isClubManager: true,
                signOut: vi.fn(),
                refreshActiveSeasons: vi.fn(),
            });
            page.rerender(
                <MemoryRouter initialEntries={['/promote-my-tournaments']}>
                    <PromoteMyTournaments />
                </MemoryRouter>
            );
            await screen.findByText(/London Open 2025/);

            expect(screen.queryByText('Edit Tournament')).not.toBeInTheDocument();
        });

        it('renders with groupByLocation prop for club selection', async () => {
            renderPage();

            // When groupByLocation is true, it should show location-based buttons
            await waitFor(() => {
                expect(screen.getByText('My Club: Morpeth TTC')).toBeInTheDocument();
            });
        });
    });

    describe('when user has no managed clubs', () => {
        beforeEach(() => {
            mockUseAuth.mockReturnValue({
                isAuthenticated: true,
                email: 'user@example.test',
                username: 'User',
                activeSeasons: [],
                managedClubs: [],
                isPlayerOrCaptain: false,
                isClubManager: false,
                signOut: vi.fn(),
                refreshActiveSeasons: vi.fn(),
            });
        });

        it('shows the not registered as club manager message', () => {
            renderPage();

            expect(screen.getByText('⚠️ You are not currently registered as a club manager.')).toBeInTheDocument();
            expect(screen.getByText('Check your Inbox or Spam folder for the new season invite, or contact us.')).toBeInTheDocument();
            expect(screen.queryByText('ADD TOURNAMENT')).not.toBeInTheDocument();
        });

        it('does not render ManagedClubsCard when no managed clubs', () => {
            renderPage();

            expect(screen.queryByText('My Club:')).not.toBeInTheDocument();
        });
    });

    describe('managed clubs filtering', () => {
        it('filters out managed clubs with no matching config', async () => {
            const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

            const clubWithoutConfig = {
                league: 'OTHER_LEAGUE',
                season: '2025',
                club_name: 'Other Club',
                club_location: 'Manchester',
                manager_name: 'Other Manager',
            };

            mockUseAuth.mockReturnValue({
                isAuthenticated: true,
                email: 'manager@example.test',
                username: 'Luca',
                activeSeasons: [],
                managedClubs: [managedClub, clubWithoutConfig],
                isPlayerOrCaptain: false,
                isClubManager: true,
                signOut: vi.fn(),
                refreshActiveSeasons: vi.fn(),
            });

            renderPage();

            // Should only show the club with matching config
            await waitFor(() => {
                expect(screen.getByText('My Club: Morpeth TTC')).toBeInTheDocument();
            });
            expect(consoleInfoSpy).toHaveBeenCalledWith(
                '❌ Page event log processing managed club:',
                expect.objectContaining({ message: expect.stringContaining('Data source not found') as string })
            );
        });

        it('filters out managed clubs outside the time window', () => {
            setUnitFixedClockTime('2024-01-01T12:00:00Z'); // Before the start date

            renderPage();

            // Should not show any clubs as they're outside the time window
            expect(screen.queryByText('My Club:')).not.toBeInTheDocument();
            expect(screen.getByText('⚠️ You are not currently registered as a club manager.')).toBeInTheDocument();
        });
    });

    describe('multiple managed clubs', () => {
        // A manager cannot manage two clubs in the same league + season, so the second
        // club is registered under a different league (see FrontendActivelyManagedClubsDomainLogic.md).
        const secondManagedClub = {
            league: 'CLTTL2',
            season: '2025-2026',
            club_name: 'Another TTC',
            club_location: 'Manchester',
            manager_name: 'Another Manager',
        };

        beforeEach(() => {
            mockUseAuth.mockReturnValue({
                isAuthenticated: true,
                email: 'manager@example.test',
                username: 'Luca',
                activeSeasons: [],
                managedClubs: [managedClub, secondManagedClub],
                isPlayerOrCaptain: false,
                isClubManager: true,
                signOut: vi.fn(),
                refreshActiveSeasons: vi.fn(),
            });
            mockGetConfig.mockReturnValue({
                ...defaultConfig,
                active_seasons_data_source: [
                    ...defaultConfig.active_seasons_data_source,
                    { ...defaultConfig.active_seasons_data_source[0], league: secondManagedClub.league },
                ],
            });
        });

        it('renders club selection buttons for multiple clubs', () => {
            renderPage();

            expect(screen.getByText('My Club:')).toBeInTheDocument();
            // Should show both clubs as options
            expect(screen.getByText('London')).toBeInTheDocument();
            expect(screen.getByText('Manchester')).toBeInTheDocument();
        });

        it('does not auto-select when there are multiple clubs', () => {
            renderPage();

            // With multiple clubs, it should not auto-select
            // The promote message should not appear until a club is selected
            expect(screen.queryByText(/Now you can promote tournaments/)).not.toBeInTheDocument();
            expect(screen.queryByText('ADD TOURNAMENT')).not.toBeInTheDocument();
        });

        it('does not carry a delete confirmation from one club to another after access changes', async () => {
            const page = render(
                <MemoryRouter initialEntries={['/promote-my-tournaments']}>
                    <PromoteMyTournaments />
                </MemoryRouter>
            );
            fireEvent.click(screen.getByText('London'));
            await screen.findByText(/London Open 2025/);
            fireEvent.click(screen.getByTitle('Delete'));
            expect(screen.getByTestId('delete-confirm-title')).toHaveTextContent('London Open 2025');

            mockUseAuth.mockReturnValue({
                isAuthenticated: true,
                email: 'manager@example.test',
                username: 'Luca',
                activeSeasons: [],
                managedClubs: [],
                isPlayerOrCaptain: false,
                isClubManager: false,
                signOut: vi.fn(),
                refreshActiveSeasons: vi.fn(),
            });
            page.rerender(
                <MemoryRouter initialEntries={['/promote-my-tournaments']}>
                    <PromoteMyTournaments />
                </MemoryRouter>
            );
            await screen.findByText('⚠️ You are not currently registered as a club manager.');

            mockUseAuth.mockReturnValue({
                isAuthenticated: true,
                email: 'manager@example.test',
                username: 'Luca',
                activeSeasons: [],
                managedClubs: [secondManagedClub],
                isPlayerOrCaptain: false,
                isClubManager: true,
                signOut: vi.fn(),
                refreshActiveSeasons: vi.fn(),
            });
            page.rerender(
                <MemoryRouter initialEntries={['/promote-my-tournaments']}>
                    <PromoteMyTournaments />
                </MemoryRouter>
            );
            await screen.findByText(/Now you can promote tournaments for Another TTC in Manchester/);

            expect(screen.queryByTestId('delete-confirm-title')).not.toBeInTheDocument();
        });

        it('keeps the selected club results when an earlier club request resolves later', async () => {
            let resolveLondon!: (value: typeof sampleTournament[]) => void;
            clubsApiMocks.getTournamentsForClub.mockImplementation((location: string) =>
                location === 'London'
                    ? new Promise<typeof sampleTournament[]>((resolve) => { resolveLondon = resolve; })
                    : Promise.resolve([{ ...sampleTournament, tournament_name: 'Manchester Open' }])
            );
            renderPage();
            fireEvent.click(screen.getByText('London'));
            fireEvent.click(screen.getByText('Manchester'));
            expect(await screen.findByText(/Manchester Open/)).toBeInTheDocument();
            await act(async () => {
                resolveLondon([sampleTournament]);
                await Promise.resolve();
            });
            expect(screen.getByText(/Manchester Open/)).toBeInTheDocument();
            expect(screen.queryByText(/London Open 2025/)).not.toBeInTheDocument();
        });

        it('ignores an obsolete load failure while the selected club is still loading', async () => {
            let rejectLondon!: (reason: unknown) => void;
            let resolveManchester!: (value: typeof sampleTournament[]) => void;
            clubsApiMocks.getTournamentsForClub.mockImplementation((location: string) =>
                location === 'London'
                    ? new Promise<typeof sampleTournament[]>((_resolve, reject) => { rejectLondon = reject; })
                    : new Promise<typeof sampleTournament[]>((resolve) => { resolveManchester = resolve; })
            );
            renderPage();
            fireEvent.click(screen.getByText('London'));
            fireEvent.click(screen.getByText('Manchester'));
            await act(async () => {
                rejectLondon(new Error('Old club failed'));
                await Promise.resolve();
            });
            expect(screen.getByText('Loading tournaments…')).toBeInTheDocument();
            expect(screen.queryByTestId('main-error')).not.toBeInTheDocument();
            await act(async () => {
                resolveManchester([{ ...sampleTournament, tournament_name: 'Manchester Open' }]);
                await Promise.resolve();
            });
            expect(screen.getByText(/Manchester Open/)).toBeInTheDocument();
        });

        it('clears previous club results and shows a fallback for a non-Error load failure', async () => {
            clubsApiMocks.getTournamentsForClub
                .mockResolvedValueOnce([sampleTournament])
                .mockRejectedValueOnce('offline');
            renderPage();
            fireEvent.click(screen.getByText('London'));
            expect(await screen.findByText(/London Open 2025/)).toBeInTheDocument();
            fireEvent.click(screen.getByText('Manchester'));
            expect(await screen.findByTestId('main-error')).toHaveTextContent('Failed to load tournaments.');
            expect(screen.queryByText(/London Open 2025/)).not.toBeInTheDocument();
        });

        it('fetches tournaments once per club selection, not for every managed club at once', async () => {
            renderPage();

            fireEvent.click(screen.getByText('London'));
            await waitFor(() => {
                expect(clubsApiMocks.getTournamentsForClub).toHaveBeenCalledWith(managedClub.club_location, managedClub.club_name);
            });

            fireEvent.click(screen.getByText('Manchester'));
            await waitFor(() => {
                expect(clubsApiMocks.getTournamentsForClub).toHaveBeenCalledWith(secondManagedClub.club_location, secondManagedClub.club_name);
            });

            expect(clubsApiMocks.getTournamentsForClub).toHaveBeenCalledTimes(2);
        });
    });

    describe('tournament data grid', () => {
        it('displays tournaments in a data grid when club is selected', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            expect(screen.getByTestId('tournament-link')).toBeInTheDocument();
            expect(screen.getByText(/1 - 31 Jan/)).toBeInTheDocument();
            expect(screen.getByTestId('tournament-link')).toHaveAttribute('href', sampleTournament.tournament_info);
        });

        it('shows instagram icon when instagram is present', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const instagramLink = screen.getByTestId('tournament-instagram-link');
            expect(instagramLink).toBeInTheDocument();
        });

        it('shows facebook icon when facebook is present', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const facebookLink = screen.getByTestId('tournament-facebook-link');
            expect(facebookLink).toBeInTheDocument();
        });

        it('shows loading state while fetching tournaments', () => {
            clubsApiMocks.getTournamentsForClub.mockImplementation(() => new Promise(() => { /* never resolves */ }));

            renderPage();

            expect(screen.getByText('Loading tournaments…')).toBeInTheDocument();
            expect(screen.queryByText('ADD TOURNAMENT')).not.toBeInTheDocument();
        });

        it('shows error message when tournament fetch fails', async () => {
            clubsApiMocks.getTournamentsForClub.mockRejectedValue(new Error('API Error'));

            renderPage();

            await waitFor(() => {
                expect(screen.getByTestId('main-error')).toBeInTheDocument();
            });
        });

        it('shows no tournaments message when club has no tournaments', async () => {
            clubsApiMocks.getTournamentsForClub.mockResolvedValue([]);

            renderPage();

            await waitFor(() => {
                expect(screen.getByText('No tournaments found. Add your first tournament below.')).toBeInTheDocument();
            });
        });

        it('loads tournaments for the selected club via getTournamentsForClub', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            expect(clubsApiMocks.getTournamentsForClub).toHaveBeenCalledWith(
                managedClub.club_location,
                managedClub.club_name
            );
        });

        it('renders tournaments even though the club info has not been created', async () => {
            // The club's own profile (homepage/social links) was never PUT — only its tournament exists.
            // getTournamentsForClub must still return the tournament rather than an empty/error state.
            clubsApiMocks.getTournamentsForClub.mockResolvedValue([sampleTournament]);

            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            expect(screen.queryByText('No tournaments found. Add your first tournament below.')).not.toBeInTheDocument();
            expect(screen.queryByTestId('main-error')).not.toBeInTheDocument();
        });
    });

    describe('tournament grid column layout', () => {
        it('renders the Actions column first with no header label, followed by Tournament and Social', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const headers = screen.getAllByRole('columnheader');
            expect(headers.map((header) => header.textContent)).toEqual(['', 'Tournament Link', 'Social']);
        });

        it('does not render separate Link or Date Range columns', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            expect(screen.queryByText('Tournament Name', { selector: 'th' })).not.toBeInTheDocument();
            expect(screen.queryByText('Link', { selector: 'th' })).not.toBeInTheDocument();
            expect(screen.queryByText('Date Range', { selector: 'th' })).not.toBeInTheDocument();
        });

        it('places the Edit/Delete actions in the first cell of the row', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const row = screen.getByTitle('Edit').closest('tr');
            expect(row).not.toBeNull();
            const firstCell = row?.querySelector('td');
            expect(firstCell).toContainElement(screen.getByTitle('Edit'));
            expect(firstCell).toContainElement(screen.getByTitle('Delete'));
        });
    });

    describe('tournament date range formatting', () => {
        // formatTournamentDateRange compares against getClockTime(), so "current year" here means the
        // year of the fixed test clock. The assertions below match the link text exactly rather than by
        // substring: a substring match cannot tell "15 Jul" from "15 Jul, 2026", which is precisely the
        // elision rule these cases exist to protect.
        const localEpoch = (year: number, month: number, day: number) =>
            Math.floor(new Date(year, month - 1, day, 12, 0, 0).getTime() / 1000);

        const renderWithTournamentDates = async (start_date: number, end_date: number) => {
            clubsApiMocks.getTournamentsForClub.mockResolvedValue([{ ...sampleTournament, start_date, end_date }]);
            renderPage();
            await waitFor(() => {
                expect(screen.getByTestId('tournament-link')).toBeInTheDocument();
            });
        };

        it('shows only the end date, with no leading range, when start and end are the same day in the current year', async () => {
            const sameDay = localEpoch(FIXED_CLOCK_YEAR, 7, 15);

            await renderWithTournamentDates(sameDay, sameDay);

            const link = screen.getByTestId('tournament-link');
            expect(link.textContent).toBe(`${sampleTournament.tournament_name}, 15 Jul`);
            expect(link.textContent).not.toContain('-');
        });

        it('hides the start month and the year when start/end share month and the current year, but keeps the differing day', async () => {
            const start = localEpoch(FIXED_CLOCK_YEAR, 7, 1);
            const end = localEpoch(FIXED_CLOCK_YEAR, 7, 20);

            await renderWithTournamentDates(start, end);

            expect(screen.getByTestId('tournament-link').textContent).toBe(`${sampleTournament.tournament_name}, 1 - 20 Jul`);
        });

        it('shows both days when different months have the same day number', async () => {
            await renderWithTournamentDates(localEpoch(FIXED_CLOCK_YEAR, 3, 5), localEpoch(FIXED_CLOCK_YEAR, 4, 5));
            expect(screen.getByTestId('tournament-link')).toHaveTextContent(`${sampleTournament.tournament_name}, 5 Mar - 5 Apr`);
        });

        it('shows both days when different years have the same month and day number', async () => {
            await renderWithTournamentDates(localEpoch(FIXED_CLOCK_YEAR, 3, 5), localEpoch(FIXED_CLOCK_YEAR + 1, 3, 5));
            expect(screen.getByTestId('tournament-link')).toHaveTextContent(
                `${sampleTournament.tournament_name}, 5, ${String(FIXED_CLOCK_YEAR)} - 5 Mar, ${String(FIXED_CLOCK_YEAR + 1)}`
            );
        });

        it('shows the year once, on the end date, when start and end share a year different from the current year', async () => {
            const year = FIXED_CLOCK_YEAR + 1;
            const start = localEpoch(year, 3, 5);
            const end = localEpoch(year, 6, 10);

            await renderWithTournamentDates(start, end);

            expect(screen.getByTestId('tournament-link').textContent).toBe(`${sampleTournament.tournament_name}, 5 Mar - 10 Jun, ${String(year)}`);
        });

        it('shows both years when start and end fall in different years', async () => {
            const startYear = FIXED_CLOCK_YEAR + 1;
            const endYear = startYear + 1;
            const start = localEpoch(startYear, 12, 30);
            const end = localEpoch(endYear, 1, 3);

            await renderWithTournamentDates(start, end);

            expect(screen.getByTestId('tournament-link').textContent).toBe(
                `${sampleTournament.tournament_name}, 30 Dec, ${String(startYear)} - 3 Jan, ${String(endYear)}`
            );
        });
    });

    describe('tournament edit functionality', () => {
        it('opens edit modal when edit button is clicked', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const editButton = screen.getByTitle('Edit');
            fireEvent.click(editButton);

            expect(screen.getByText('Edit Tournament')).toBeInTheDocument();
            expect(screen.getByLabelText('Start Date')).toHaveValue('2025-01-01');
            expect(screen.getByLabelText('End Date')).toHaveValue('2025-01-31');
        });

        it('allows saving an existing one-day tournament without changing equal dates', async () => {
            vi.stubEnv('TZ', 'UTC');
            const sameDate = Date.parse('2030-01-15T00:00:00Z') / 1000;
            clubsApiMocks.getTournamentsForClub.mockResolvedValue([{
                ...sampleTournament,
                instagram: '',
                facebook: '',
                start_date: sameDate,
                end_date: sameDate,
            }]);

            try {
                renderPage();
                await screen.findByText(/London Open 2025/);
                fireEvent.click(screen.getByTitle('Edit'));
                clubsApiMocks.upsertTournament.mockResolvedValue(sampleTournament);
                fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }));
                expect(screen.queryByText('Start date cannot be earlier than today.')).not.toBeInTheDocument();
                expect(screen.queryByText('End date must be on or after start date.')).not.toBeInTheDocument();

                await waitFor(() => {
                    expect(clubsApiMocks.upsertTournament).toHaveBeenCalledWith(
                        managedClub.club_location,
                        managedClub.club_name,
                        sampleTournament.tournament_name,
                        expect.objectContaining({ start_date: sameDate, end_date: sameDate })
                    );
                });
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it('prefills trimmed existing social values and saves the normalized Facebook handle', async () => {
            clubsApiMocks.getTournamentsForClub.mockResolvedValue([{
                ...sampleTournament, instagram: '  https://www.instagram.com/p/example  ', facebook: '  @club  ',
            }]);
            renderPage();
            await screen.findByText(/London Open 2025/);
            fireEvent.click(screen.getByTitle('Edit'));
            expect(screen.getByLabelText('Instagram Post')).toHaveValue('https://www.instagram.com/p/example');
            expect(screen.getByLabelText('Facebook Post')).toHaveValue('https://www.facebook.com/club');
            const year = new Date().getFullYear() + 1;
            fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: `${String(year)}-07-01` } });
            fireEvent.change(screen.getByLabelText('End Date'), { target: { value: `${String(year)}-07-05` } });
            fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }));
            await waitFor(() => {
                expect(clubsApiMocks.upsertTournament).toHaveBeenCalledWith(
                    managedClub.club_location, managedClub.club_name, sampleTournament.tournament_name,
                    expect.objectContaining({ instagram: 'https://www.instagram.com/p/example', facebook: 'https://www.facebook.com/club' })
                );
            });
        });

        it('prefills a stored bare Facebook handle as a link when editing', async () => {
            clubsApiMocks.getTournamentsForClub.mockResolvedValue([{ ...sampleTournament, facebook: 'club-page' }]);
            renderPage();
            await screen.findByText(/London Open 2025/);
            fireEvent.click(screen.getByTitle('Edit'));
            expect(screen.getByLabelText('Facebook Post')).toHaveValue('https://www.facebook.com/club-page');
        });

        it.each(['!club-page', 'club-page!'])(
            'preserves an invalid stored Facebook handle instead of converting the valid substring: %s',
            async (facebook) => {
                clubsApiMocks.getTournamentsForClub.mockResolvedValue([{ ...sampleTournament, facebook }]);
                renderPage();
                await screen.findByText(/London Open 2025/);
                fireEvent.click(screen.getByTitle('Edit'));
                expect(screen.getByLabelText('Facebook Post')).toHaveValue(facebook);
            }
        );

        it('opens an existing tournament for editing when optional social links are absent', async () => {
            clubsApiMocks.getTournamentsForClub.mockResolvedValue([
                { ...sampleTournament, instagram: null, facebook: null },
            ]);
            renderPage();

            await screen.findByText(/London Open 2025/);
            fireEvent.click(screen.getByTitle('Edit'));

            expect(screen.getByLabelText('Instagram Post')).toHaveValue('');
            expect(screen.getByLabelText('Facebook Post')).toHaveValue('');
        });

        it('closes edit modal when cancel is clicked', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const editButton = screen.getByTitle('Edit');
            fireEvent.click(editButton);

            const cancelButton = screen.getByText('Cancel');
            fireEvent.click(cancelButton);

            expect(screen.queryByText('Edit Tournament')).not.toBeInTheDocument();
        });

        it('disables the Tournament Name field when editing, since renaming is not supported by the API', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const editButton = screen.getByTitle('Edit');
            fireEvent.click(editButton);

            const nameField = screen.getByLabelText('Tournament Name');
            expect(nameField).toBeDisabled();
            // Same greyed-out locked styling as the invite-bound email field on Login and Register
            expect(nameField).toHaveClass('!bg-gray-400', '!text-gray-800', 'cursor-not-allowed', '!opacity-100');
        });

        it('keeps the Tournament Name field enabled when adding a new tournament', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const addButton = screen.getByText('ADD TOURNAMENT');
            fireEvent.click(addButton);

            const nameField = screen.getByLabelText('Tournament Name');
            expect(nameField).toBeEnabled();
            expect(nameField).not.toHaveClass('!bg-gray-400');
        });

        it('moves focus to the Tournament Info URL field when editing, since the name is locked', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            fireEvent.click(screen.getByTitle('Edit'));

            await waitFor(() => {
                expect(screen.getByLabelText('Tournament Info URL')).toHaveFocus();
            });
        });

        it('does not pull focus back to Tournament Info URL while typing in another field', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            fireEvent.click(screen.getByTitle('Edit'));
            await waitFor(() => {
                expect(screen.getByLabelText('Tournament Info URL')).toHaveFocus();
            });

            const instagramField = screen.getByLabelText('Instagram Post');
            instagramField.focus();
            fireEvent.change(instagramField, { target: { value: 'https://instagram.com/p/abc' } });

            expect(instagramField).toHaveFocus();
        });

        it('moves focus to the Tournament Name field when adding, where the name is editable', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            fireEvent.click(screen.getByText('ADD TOURNAMENT'));

            await waitFor(() => {
                expect(screen.getByLabelText('Tournament Name')).toHaveFocus();
            });
            expect(screen.getByLabelText('Tournament Info URL')).not.toHaveFocus();
        });

        it('does not pull focus back to Tournament Name while typing in another field when adding', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            fireEvent.click(screen.getByText('ADD TOURNAMENT'));
            await waitFor(() => {
                expect(screen.getByLabelText('Tournament Name')).toHaveFocus();
            });

            const infoField = screen.getByLabelText('Tournament Info URL');
            infoField.focus();
            fireEvent.change(infoField, { target: { value: 'https://example.com/new' } });

            expect(infoField).toHaveFocus();
        });

        it('saves an edited tournament and reflects the change in the grid without duplicating rows', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const today = new Date();
            const nextYear = today.getFullYear() + 1;
            const updatedTournament = {
                ...sampleTournament,
                tournament_info: 'https://london-open.example.com/updated',
            };
            clubsApiMocks.upsertTournament.mockResolvedValue(updatedTournament);

            const editButton = screen.getByTitle('Edit');
            fireEvent.click(editButton);

            // sampleTournament.instagram ('@londonopen') is not a valid instagram.com URL, and
            // handleEditTournament only trims it rather than converting it — so it must be
            // replaced with a valid URL here or the pre-existing value fails validation on submit.
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const instagramInput = screen.getByLabelText('Instagram Post');
            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');
            fireEvent.change(infoInput, { target: { value: updatedTournament.tournament_info } });
            fireEvent.change(instagramInput, { target: { value: 'https://www.instagram.com/p/londonopen' } });
            fireEvent.change(startDateInput, { target: { value: `${String(nextYear)}-07-01` } });
            fireEvent.change(endDateInput, { target: { value: `${String(nextYear)}-07-05` } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(clubsApiMocks.upsertTournament).toHaveBeenCalledWith(
                    managedClub.club_location,
                    managedClub.club_name,
                    sampleTournament.tournament_name,
                    expect.objectContaining({ tournament_info: updatedTournament.tournament_info })
                );
            });

            await waitFor(() => {
                expect(screen.getByTestId('tournament-link')).toHaveAttribute('href', updatedTournament.tournament_info);
            });
            expect(screen.getAllByTestId('tournament-link')).toHaveLength(1);
        });
    });

    describe('tournament delete functionality', () => {
        it('opens delete confirmation modal when delete button is clicked', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const deleteButton = screen.getByTitle('Delete');
            fireEvent.click(deleteButton);

            const title = screen.getByTestId('delete-confirm-title');
            expect(title).toHaveTextContent('Confirm Removal');
            expect(title).toHaveTextContent(`of ${sampleTournament.tournament_name}`);
        });

        it('closes delete modal when cancel is clicked', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const deleteButton = screen.getByTitle('Delete');
            fireEvent.click(deleteButton);

            const cancelButton = screen.getByText('Cancel');
            fireEvent.click(cancelButton);

            expect(screen.queryByTestId('delete-confirm-title')).not.toBeInTheDocument();
        });

        it('deletes tournament when confirm is clicked', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const deleteButton = screen.getByTitle('Delete');
            fireEvent.click(deleteButton);

            const confirmButton = screen.getByText('Confirm Remove');
            fireEvent.click(confirmButton);

            await waitFor(() => {
                expect(clubsApiMocks.deleteTournament).toHaveBeenCalledWith(
                    managedClub.club_location,
                    managedClub.club_name,
                    sampleTournament.tournament_name
                );
            });

            expect(screen.queryByText(/London Open 2025/)).not.toBeInTheDocument();
        });

        it('keeps the confirmation modal open and shows an error when delete fails', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const apiError = new GeneralApiError('Deletion failed', 500);
            clubsApiMocks.deleteTournament.mockRejectedValue(apiError);

            const deleteButton = screen.getByTitle('Delete');
            fireEvent.click(deleteButton);

            const confirmButton = screen.getByText('Confirm Remove');
            fireEvent.click(confirmButton);

            const errorElement = await screen.findByTestId('delete-error');
            expect(errorElement).toHaveTextContent('Deletion failed');
            expect(screen.getByTestId('delete-confirm-title')).toBeInTheDocument();
            // The tournament is still in the grid — the failed delete never removed it.
            // (getByText would match the grid row AND the modal's "of London Open 2025" title.)
            expect(screen.getByTestId('tournament-link')).toBeInTheDocument();
        });

        it('shows structured deletion errors and allows retry after a failure', async () => {
            clubsApiMocks.deleteTournament
                .mockRejectedValueOnce(new GeneralApiError('Deletion failed', 400, undefined, ['first reason', 'second reason']))
                .mockResolvedValueOnce(undefined);
            renderPage();
            await screen.findByText(/London Open 2025/);
            fireEvent.click(screen.getByTitle('Delete'));
            fireEvent.click(screen.getByText('Confirm Remove'));
            expect(await screen.findByTestId('delete-error')).toHaveTextContent('Deletion failed ( first reason, second reason )');
            expect(screen.getByTestId('delete-confirm-title')).toBeInTheDocument();
            expect(screen.getByText('Confirm Remove')).toBeEnabled();
            expect(screen.getByText('Cancel')).toBeEnabled();
            fireEvent.click(screen.getByText('Confirm Remove'));
            await waitFor(() => {
                expect(screen.queryByTestId('delete-confirm-title')).not.toBeInTheDocument();
                expect(screen.queryByTestId('tournament-link')).not.toBeInTheDocument();
            });
            expect(clubsApiMocks.deleteTournament).toHaveBeenCalledTimes(2);
        });

        it('does not append empty parentheses when a deletion error has no validation details', async () => {
            clubsApiMocks.deleteTournament.mockRejectedValue(
                new GeneralApiError('Deletion failed', 400, undefined, [])
            );
            renderPage();
            await screen.findByText(/London Open 2025/);
            fireEvent.click(screen.getByTitle('Delete'));
            fireEvent.click(screen.getByText('Confirm Remove'));

            expect(await screen.findByTestId('delete-error')).toHaveTextContent('Deletion failed');
            expect(screen.getByTestId('delete-error')).not.toHaveTextContent('(');
            expect(screen.getByTestId('delete-confirm-title')).toBeInTheDocument();
        });

        it('shows a fallback and keeps the tournament when deletion rejects with null', async () => {
            clubsApiMocks.deleteTournament.mockRejectedValue(null);
            renderPage();
            await screen.findByText(/London Open 2025/);
            fireEvent.click(screen.getByTitle('Delete'));
            fireEvent.click(screen.getByText('Confirm Remove'));
            expect(await screen.findByTestId('delete-error')).toHaveTextContent('The tournament could not be deleted. Please try again.');
            expect(screen.getByTestId('tournament-link')).toBeInTheDocument();
        });

        it('does not call deleteTournament when cancel is clicked', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const deleteButton = screen.getByTitle('Delete');
            fireEvent.click(deleteButton);

            const cancelButton = screen.getByText('Cancel');
            fireEvent.click(cancelButton);

            expect(clubsApiMocks.deleteTournament).not.toHaveBeenCalled();
        });
    });

    describe('tournament add functionality', () => {
        it('opens add tournament modal when ADD TOURNAMENT button is clicked', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const addButton = screen.getByText('ADD TOURNAMENT');
            fireEvent.click(addButton);

            expect(screen.getByText('Add Tournament')).toBeInTheDocument();
        });
    });

    describe('tournament form input validation', () => {
        const openAddModal = async () => {
            renderPage();
            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });
            const addButton = screen.getByText('ADD TOURNAMENT');
            fireEvent.click(addButton);
            expect(screen.getByText('Add Tournament')).toBeInTheDocument();
        };

        it('displays required validation errors when submitting an empty form', async () => {
            await openAddModal();

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            expect(screen.getByText('Tournament name is required.')).toBeInTheDocument();
            expect(screen.getByText('Tournament info URL is required.')).toBeInTheDocument();
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('shows validation error for invalid tournament info URL', async () => {
            await openAddModal();

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');

            fireEvent.change(nameInput, { target: { value: 'New Tournament' } });
            fireEvent.change(infoInput, { target: { value: 'invalid-url' } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            expect(screen.getByText('Please enter a valid tournament info URL.')).toBeInTheDocument();
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it.each([
            'ftp://example.com/info',
            'http://localhost/info',
            'https://club.local/info',
            'https://club/info',
            'https://127.0.0.1/info',
            'https://192.168.10.22/info',
            'http://[::1]/info',
        ])('rejects a tournament info URL with an unsupported protocol or host: %s', async (url) => {
            await openAddModal();
            fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'New Tournament' } });
            fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: url } });
            fireEvent.click(screen.getByRole('button', { name: /^(ADD|UPDATE)$/ }));
            expect(screen.getByText('Please enter a valid tournament info URL.')).toBeInTheDocument();
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('accepts a public hostname with numeric labels resembling an IPv4 address', async () => {
            const url = 'https://192.168.10.22.example.com/info';
            await openAddModal();
            const year = new Date().getFullYear() + 1;
            fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'Numeric label tournament' } });
            fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: url } });
            fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: `${String(year)}-07-01` } });
            fireEvent.change(screen.getByLabelText('End Date'), { target: { value: `${String(year)}-07-05` } });
            fireEvent.click(screen.getByRole('button', { name: 'ADD' }));

            await waitFor(() => {
                expect(clubsApiMocks.upsertTournament).toHaveBeenCalledWith(
                    managedClub.club_location,
                    managedClub.club_name,
                    'Numeric label tournament',
                    expect.objectContaining({ tournament_info: url })
                );
            });
        });

        it('accepts a bare authority URL and equal start and end dates', async () => {
            await openAddModal();
            const year = new Date().getFullYear() + 1;
            const date = `${String(year)}-07-05`;
            fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'One Day' } });
            fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: 'https://example.com' } });
            fireEvent.change(screen.getByLabelText('Facebook Post'), { target: { value: 'club-page' } });
            fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: date } });
            fireEvent.change(screen.getByLabelText('End Date'), { target: { value: date } });
            fireEvent.click(screen.getByRole('button', { name: /^(ADD|UPDATE)$/ }));
            await waitFor(() => {
                expect(clubsApiMocks.upsertTournament).toHaveBeenCalledWith(
                    managedClub.club_location, managedClub.club_name, 'One Day', expect.objectContaining({
                        tournament_info: 'https://example.com',
                        facebook: 'https://www.facebook.com/club-page',
                        start_date: new Date(year, 6, 5).getTime() / 1000,
                        end_date: new Date(year, 6, 6).getTime() / 1000 - 1,
                    })
                );
            });
        });

        it('shows validation error for invalid Instagram post URL', async () => {
            await openAddModal();

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const instagramInput = screen.getByLabelText('Instagram Post');

            fireEvent.change(nameInput, { target: { value: 'New Tournament' } });
            fireEvent.change(infoInput, { target: { value: 'https://example.com/info' } });
            fireEvent.change(instagramInput, { target: { value: 'https://twitter.com/post' } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            expect(screen.getByText('Please enter a valid Instagram post URL (e.g. https://www.instagram.com/p/...).')).toBeInTheDocument();
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('shows validation error for invalid Facebook link', async () => {
            await openAddModal();

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const facebookInput = screen.getByLabelText('Facebook Post');

            fireEvent.change(nameInput, { target: { value: 'New Tournament' } });
            fireEvent.change(infoInput, { target: { value: 'https://example.com/info' } });
            fireEvent.change(facebookInput, { target: { value: 'https://other-site.com/invalid' } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            expect(screen.getByText('Please enter a valid Facebook link.')).toBeInTheDocument();
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it.each(['https://other-site.com/page', 'https://other-site.com'])(
            'does not suggest a canonical but wrong-network Facebook URL: %s',
            async (url) => {
                await openAddModal();
                fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'New Tournament' } });
                fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: 'https://example.com/info' } });
                fireEvent.change(screen.getByLabelText('Facebook Post'), { target: { value: url } });
                fireEvent.click(screen.getByRole('button', { name: /^(ADD|UPDATE)$/ }));

                const error = screen.getByText('Please enter a valid Facebook link.');
                expect(error).not.toHaveTextContent('Did you mean:');
                expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
            }
        );

        it('rejects a facebook URL with a backslash and suggests the normalised form', async () => {
            await openAddModal();

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const facebookInput = screen.getByLabelText('Facebook Post');

            fireEvent.change(nameInput, { target: { value: 'New Tournament' } });
            fireEvent.change(infoInput, { target: { value: 'https://example.com/info' } });
            fireEvent.change(facebookInput, { target: { value: 'http://facebook.com\\whaat' } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            const errorEl = screen.getByText(/Please enter a valid Facebook link/);
            expect(errorEl).toHaveTextContent('Did you mean: http://facebook.com/whaat?');
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('rejects a tournament info URL with a backslash and suggests the normalised form', async () => {
            await openAddModal();

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');

            fireEvent.change(nameInput, { target: { value: 'New Tournament' } });
            fireEvent.change(infoInput, { target: { value: 'http://example.com\\info' } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            const errorEl = screen.getByText(/Please enter a valid tournament info URL/);
            expect(errorEl).toHaveTextContent('Did you mean: http://example.com/info?');
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('does not suggest a normalized URL when its hostname is still disallowed', async () => {
            await openAddModal();
            fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'New Tournament' } });
            fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: 'http://localhost\\info' } });
            fireEvent.click(screen.getByRole('button', { name: /^(ADD|UPDATE)$/ }));

            const error = screen.getByText('Please enter a valid tournament info URL.');
            expect(error).not.toHaveTextContent('Did you mean:');
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('rejects an instagram URL with a backslash and suggests the normalised form', async () => {
            await openAddModal();

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const instagramInput = screen.getByLabelText('Instagram Post');

            fireEvent.change(nameInput, { target: { value: 'New Tournament' } });
            fireEvent.change(infoInput, { target: { value: 'https://example.com/info' } });
            fireEvent.change(instagramInput, { target: { value: 'http://instagram.com\\p\\abc123' } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            const errorEl = screen.getByText(/Please enter a valid Instagram post URL/);
            expect(errorEl).toHaveTextContent('Did you mean: http://instagram.com/p/abc123?');
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('suggests the normalized HTTPS tournament URL when it contains a backslash', async () => {
            await openAddModal();
            fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'New Tournament' } });
            fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: 'https://example.com\\info' } });
            fireEvent.click(screen.getByRole('button', { name: 'ADD' }));
            expect(screen.getByText(/Please enter a valid tournament info URL/)).toHaveTextContent(
                'Did you mean: https://example.com/info?'
            );
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('shows validation error when start date is earlier than today', async () => {
            await openAddModal();

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const startDateInput = screen.getByLabelText('Start Date');

            fireEvent.change(nameInput, { target: { value: 'New Tournament' } });
            fireEvent.change(infoInput, { target: { value: 'https://example.com/info' } });
            fireEvent.change(startDateInput, { target: { value: '2025-05-31' } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            expect(screen.getByText('Start date cannot be earlier than today.')).toBeInTheDocument();
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('rejects yesterday and accepts today as a tournament start date', async () => {
            await openAddModal();
            vi.stubEnv('TZ', 'UTC');
            vi.useFakeTimers();
            try {
                vi.setSystemTime(new Date('2030-01-15T12:00:00Z'));
                fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'Today Open' } });
                fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: 'https://example.com/info' } });
                fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2030-01-14' } });
                fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2030-01-15' } });
                fireEvent.click(screen.getByRole('button', { name: 'ADD' }));
                expect(screen.getByText('Start date cannot be earlier than today.')).toBeInTheDocument();
                expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
                fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2030-01-15' } });
                clubsApiMocks.upsertTournament.mockResolvedValue({ ...sampleTournament, tournament_name: 'Today Open' });
                fireEvent.click(screen.getByRole('button', { name: 'ADD' }));
                await act(async () => { await Promise.resolve(); });
                expect(clubsApiMocks.upsertTournament).toHaveBeenCalledWith(
                    managedClub.club_location, managedClub.club_name, 'Today Open',
                    expect.objectContaining({ start_date: Date.parse('2030-01-15') / 1000 })
                );
            } finally {
                vi.useRealTimers();
                vi.unstubAllEnvs();
            }
        });

        it('accepts the local current date as a tournament start date west of UTC', async () => {
            await openAddModal();
            vi.stubEnv('TZ', 'America/New_York');
            vi.useFakeTimers();
            try {
                vi.setSystemTime(new Date('2030-01-15T17:00:00Z'));
                fireEvent.click(screen.getByText('ADD TOURNAMENT'));
                expect(screen.getByLabelText('Start Date')).toHaveValue('2030-01-15');
                expect(screen.getByLabelText('End Date')).toHaveValue('2030-01-15');
                fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'Today Open' } });
                fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: 'https://example.com/info' } });
                fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2030-01-15' } });
                fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2030-01-15' } });
                clubsApiMocks.upsertTournament.mockResolvedValue({ ...sampleTournament, tournament_name: 'Today Open' });
                fireEvent.click(screen.getByRole('button', { name: 'ADD' }));
                await act(async () => { await Promise.resolve(); });
                expect(clubsApiMocks.upsertTournament).toHaveBeenCalledWith(
                    managedClub.club_location, managedClub.club_name, 'Today Open',
                    expect.objectContaining({
                        start_date: new Date(2030, 0, 15).getTime() / 1000,
                        end_date: new Date(2030, 0, 16).getTime() / 1000 - 1,
                    })
                );
            } finally {
                vi.useRealTimers();
                vi.unstubAllEnvs();
            }
        });

        it('accepts the default dates during the first hour of a UK summer day', async () => {
            vi.stubEnv('TZ', 'Europe/London');
            try {
                renderPage();
                await screen.findByText(/London Open 2025/);
                vi.useFakeTimers();
                vi.setSystemTime(new Date('2030-06-15T23:30:00Z'));
                fireEvent.click(screen.getByText('ADD TOURNAMENT'));
                expect(screen.getByLabelText('Start Date')).toHaveValue('2030-06-16');
                expect(screen.getByLabelText('End Date')).toHaveValue('2030-06-16');
                fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'Today Open' } });
                fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: 'https://example.com/info' } });
                clubsApiMocks.upsertTournament.mockResolvedValue({ ...sampleTournament, tournament_name: 'Today Open' });
                fireEvent.click(screen.getByRole('button', { name: 'ADD' }));
                await act(async () => { await Promise.resolve(); });

                expect(screen.queryByText('Start date cannot be earlier than today.')).not.toBeInTheDocument();
                expect(clubsApiMocks.upsertTournament).toHaveBeenCalledWith(
                    managedClub.club_location, managedClub.club_name, 'Today Open',
                    expect.objectContaining({
                        start_date: new Date(2030, 5, 16).getTime() / 1000,
                        end_date: new Date(2030, 5, 17).getTime() / 1000 - 1,
                    })
                );
            } finally {
                vi.useRealTimers();
                vi.unstubAllEnvs();
            }
        });

        it('shows validation error when end date is before start date', async () => {
            await openAddModal();

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');

            fireEvent.change(nameInput, { target: { value: 'New Tournament' } });
            fireEvent.change(infoInput, { target: { value: 'https://example.com/info' } });
            fireEvent.change(startDateInput, { target: { value: '2025-06-10' } });
            fireEvent.change(endDateInput, { target: { value: '2025-06-05' } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            expect(screen.getByText('End date must be on or after start date.')).toBeInTheDocument();
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('clears field validation error when user types into the field', async () => {
            await openAddModal();

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            expect(screen.getByText('Tournament name is required.')).toBeInTheDocument();
            expect(screen.getByText('Tournament info URL is required.')).toBeInTheDocument();

            const nameInput = screen.getByLabelText('Tournament Name');
            fireEvent.change(nameInput, { target: { value: 'New Tournament' } });

            expect(screen.queryByText('Tournament name is required.')).not.toBeInTheDocument();
            expect(screen.getByText('Tournament info URL is required.')).toBeInTheDocument();
        });

        it('successfully saves valid tournament data and normalizes social fields', async () => {
            await openAddModal();

            const today = new Date();
            const nextYear = today.getFullYear() + 1;
            const startDateStr = `${String(nextYear)}-07-01`;
            const endDateStr = `${String(nextYear)}-07-05`;

            clubsApiMocks.upsertTournament.mockResolvedValue({
                ...sampleTournament,
                tournament_name: 'Summer Grand Prix 2025',
                tournament_info: 'https://morpeth.example.com/summer-gp',
                instagram: 'https://www.instagram.com/p/C12345',
                facebook: 'https://www.facebook.com/morpeth_gp',
            });

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const instagramInput = screen.getByLabelText('Instagram Post');
            const facebookInput = screen.getByLabelText('Facebook Post');
            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');

            fireEvent.change(nameInput, { target: { value: 'Summer Grand Prix 2025' } });
            fireEvent.change(infoInput, { target: { value: 'https://morpeth.example.com/summer-gp' } });
            fireEvent.change(instagramInput, { target: { value: 'https://www.instagram.com/p/C12345' } });
            fireEvent.change(facebookInput, { target: { value: '@morpeth_gp' } });
            fireEvent.change(startDateInput, { target: { value: startDateStr } });
            fireEvent.change(endDateInput, { target: { value: endDateStr } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(clubsApiMocks.upsertTournament).toHaveBeenCalledWith(
                    managedClub.club_location,
                    managedClub.club_name,
                    'Summer Grand Prix 2025',
                    {
                        tournament_info: 'https://morpeth.example.com/summer-gp',
                        instagram: 'https://www.instagram.com/p/C12345',
                        facebook: 'https://www.facebook.com/morpeth_gp',
                        start_date: expect.any(Number) as number,
                        end_date: expect.any(Number) as number,
                    }
                );
            });
        });

        it('adds the new tournament to the rendered grid after a successful save', async () => {
            await openAddModal();

            const today = new Date();
            const nextYear = today.getFullYear() + 1;
            const newTournament = {
                ...sampleTournament,
                tournament_name: 'Summer Grand Prix 2025',
                tournament_info: 'https://morpeth.example.com/summer-gp',
            };
            clubsApiMocks.upsertTournament.mockResolvedValue(newTournament);

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');

            fireEvent.change(nameInput, { target: { value: newTournament.tournament_name } });
            fireEvent.change(infoInput, { target: { value: newTournament.tournament_info } });
            fireEvent.change(startDateInput, { target: { value: `${String(nextYear)}-07-01` } });
            fireEvent.change(endDateInput, { target: { value: `${String(nextYear)}-07-05` } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(screen.getAllByTestId('tournament-link')).toHaveLength(2);
            });

            expect(screen.getByText(new RegExp(sampleTournament.tournament_name))).toBeInTheDocument();
            expect(screen.getByText(new RegExp(newTournament.tournament_name))).toBeInTheDocument();
        });

        it('shows validation error when start date or end date is cleared', async () => {
            await openAddModal();

            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');

            fireEvent.change(startDateInput, { target: { value: '' } });
            fireEvent.change(endDateInput, { target: { value: '' } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            expect(screen.getByText('Start date is required.')).toBeInTheDocument();
            expect(screen.getByText('End date is required.')).toBeInTheDocument();
            expect(clubsApiMocks.upsertTournament).not.toHaveBeenCalled();
        });

        it('applies error border styles to invalid input fields', async () => {
            await openAddModal();

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');

            expect(nameInput.className).toContain('border-red-500');
            expect(infoInput.className).toContain('border-red-500');
        });
    });

    describe('multiple tournaments for a club', () => {
        const secondTournament = {
            tournament_name: 'Manchester Cup',
            tournament_info: 'https://manchester-cup.example.com',
            instagram: '',
            facebook: '',
            start_date: 1738368000, // 2025-02-01
            end_date: 1740787200, // 2025-03-01
        };

        beforeEach(() => {
            clubsApiMocks.getTournamentsForClub.mockResolvedValue([sampleTournament, secondTournament]);
        });

        it('updates only the edited tournament, leaving the other row unchanged', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/Manchester Cup/)).toBeInTheDocument();
            });

            const today = new Date();
            const nextYear = today.getFullYear() + 1;
            const updatedSecondTournament = {
                ...secondTournament,
                tournament_info: 'https://manchester-cup.example.com/updated',
            };
            clubsApiMocks.upsertTournament.mockResolvedValue(updatedSecondTournament);

            const editButtons = screen.getAllByTitle('Edit');
            fireEvent.click(editButtons[1]);

            const infoInput = screen.getByLabelText('Tournament Info URL');
            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');
            fireEvent.change(infoInput, { target: { value: updatedSecondTournament.tournament_info } });
            fireEvent.change(startDateInput, { target: { value: `${String(nextYear)}-07-01` } });
            fireEvent.change(endDateInput, { target: { value: `${String(nextYear)}-07-05` } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(clubsApiMocks.upsertTournament).toHaveBeenCalledWith(
                    managedClub.club_location,
                    managedClub.club_name,
                    secondTournament.tournament_name,
                    expect.objectContaining({ tournament_info: updatedSecondTournament.tournament_info })
                );
            });

            await waitFor(() => {
                expect(screen.getAllByTestId('tournament-link')).toHaveLength(2);
            });
            const links = screen.getAllByTestId('tournament-link');
            expect(links[0]).toHaveAttribute('href', sampleTournament.tournament_info);
            expect(links[1]).toHaveAttribute('href', updatedSecondTournament.tournament_info);
        });

        it('deletes only the selected tournament, leaving the other row in place', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/Manchester Cup/)).toBeInTheDocument();
            });

            const deleteButtons = screen.getAllByTitle('Delete');
            fireEvent.click(deleteButtons[1]);

            const title = screen.getByTestId('delete-confirm-title');
            expect(title).toHaveTextContent(`of ${secondTournament.tournament_name}`);

            const confirmButton = screen.getByText('Confirm Remove');
            fireEvent.click(confirmButton);

            await waitFor(() => {
                expect(clubsApiMocks.deleteTournament).toHaveBeenCalledWith(
                    managedClub.club_location,
                    managedClub.club_name,
                    secondTournament.tournament_name
                );
            });

            expect(screen.queryByText(/Manchester Cup/)).not.toBeInTheDocument();
            expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            expect(screen.getAllByTestId('tournament-link')).toHaveLength(1);
        });
    });

    describe('API error handling', () => {
        const openAddModal = async () => {
            render(
                <MemoryRouter initialEntries={['/promote-my-tournaments']}>
                    <PromoteMyTournaments />
                </MemoryRouter>
            );
            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });
            const addButton = screen.getByText('ADD TOURNAMENT');
            fireEvent.click(addButton);
            expect(screen.getByText('Add Tournament')).toBeInTheDocument();
        };

        it('shows a fallback when saving rejects with null', async () => {
            await openAddModal();
            clubsApiMocks.upsertTournament.mockRejectedValue(null);
            const year = new Date().getFullYear() + 1;
            fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'New Tournament' } });
            fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: 'https://example.com/info' } });
            fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: `${String(year)}-07-01` } });
            fireEvent.change(screen.getByLabelText('End Date'), { target: { value: `${String(year)}-07-05` } });
            fireEvent.click(screen.getByRole('button', { name: 'ADD' }));
            expect(await screen.findByTestId('delete-error')).toHaveTextContent('The tournament could not be saved. Please try again.');
        });

        it('appends the validation errors array from GeneralApiError to the error message when saving', async () => {
            await openAddModal();

            const apiError = new GeneralApiError('Validation failed', 400, undefined, [
                'facebook must be a valid absolute URI',
                'end_date must be on or after start_date',
            ]);
            clubsApiMocks.upsertTournament.mockRejectedValue(apiError);

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');

            const today = new Date();
            const nextYear = today.getFullYear() + 1;
            fireEvent.change(nameInput, { target: { value: 'Summer Grand Prix 2025' } });
            fireEvent.change(infoInput, { target: { value: 'https://morpeth.example.com/summer-gp' } });
            fireEvent.change(startDateInput, { target: { value: `${String(nextYear)}-07-01` } });
            fireEvent.change(endDateInput, { target: { value: `${String(nextYear)}-07-05` } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            const errorElement = await screen.findByTestId('delete-error');
            expect(errorElement).toHaveTextContent(
                'Validation failed ( facebook must be a valid absolute URI, end_date must be on or after start_date )'
            );
        });

        it('does not append empty parentheses when a save error has no validation details', async () => {
            await openAddModal();
            clubsApiMocks.upsertTournament.mockRejectedValue(
                new GeneralApiError('Validation failed', 400, undefined, [])
            );
            const nextYear = new Date().getFullYear() + 1;
            fireEvent.change(screen.getByLabelText('Tournament Name'), { target: { value: 'Summer Grand Prix' } });
            fireEvent.change(screen.getByLabelText('Tournament Info URL'), { target: { value: 'https://example.com/info' } });
            fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: `${String(nextYear)}-07-01` } });
            fireEvent.change(screen.getByLabelText('End Date'), { target: { value: `${String(nextYear)}-07-05` } });
            fireEvent.click(screen.getByRole('button', { name: 'ADD' }));

            expect(await screen.findByTestId('delete-error')).toHaveTextContent('Validation failed');
            expect(screen.getByTestId('delete-error')).not.toHaveTextContent('(');
        });

        it('clears the API error when Cancel is clicked after a save failure', async () => {
            await openAddModal();

            const apiError = new GeneralApiError('Validation failed', 400, undefined, ['facebook must be a valid absolute URI']);
            clubsApiMocks.upsertTournament.mockRejectedValue(apiError);

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');

            const today = new Date();
            const nextYear = today.getFullYear() + 1;
            fireEvent.change(nameInput, { target: { value: 'Summer Grand Prix 2025' } });
            fireEvent.change(infoInput, { target: { value: 'https://morpeth.example.com/summer-gp' } });
            fireEvent.change(startDateInput, { target: { value: `${String(nextYear)}-07-01` } });
            fireEvent.change(endDateInput, { target: { value: `${String(nextYear)}-07-05` } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            // Wait for the error to appear in the modal
            await screen.findByTestId('delete-error');

            // Click Cancel — the modal closes and the error must be gone
            const cancelButton = screen.getByText('Cancel');
            fireEvent.click(cancelButton);

            expect(screen.queryByTestId('delete-error')).not.toBeInTheDocument();
            expect(screen.queryByTestId('footer-error')).not.toBeInTheDocument();
            expect(screen.queryByTestId('main-error')).not.toBeInTheDocument();
        });

        it('shows the API error when updating an existing tournament fails', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const apiError = new GeneralApiError('Validation failed', 400, undefined, ['facebook must be a valid absolute URI']);
            clubsApiMocks.upsertTournament.mockRejectedValue(apiError);

            const editButton = screen.getByTitle('Edit');
            fireEvent.click(editButton);

            const today = new Date();
            const nextYear = today.getFullYear() + 1;
            // sampleTournament.instagram ('@londonopen') is not a valid instagram.com URL, and
            // handleEditTournament only trims it rather than converting it — so it must be
            // replaced with a valid URL here or the pre-existing value fails validation on submit.
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const instagramInput = screen.getByLabelText('Instagram Post');
            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');
            fireEvent.change(infoInput, { target: { value: 'https://london-open.example.com/updated' } });
            fireEvent.change(instagramInput, { target: { value: 'https://www.instagram.com/p/londonopen' } });
            fireEvent.change(startDateInput, { target: { value: `${String(nextYear)}-07-01` } });
            fireEvent.change(endDateInput, { target: { value: `${String(nextYear)}-07-05` } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            const errorElement = await screen.findByTestId('delete-error');
            expect(errorElement).toHaveTextContent(/facebook must be a valid absolute URI/i);
            expect(screen.getByText('Edit Tournament')).toBeInTheDocument();
        });

        it('clears the API error when a field is edited after a save failure', async () => {
            await openAddModal();

            const apiError = new GeneralApiError('Validation failed', 400, undefined, ['facebook must be a valid absolute URI']);
            clubsApiMocks.upsertTournament.mockRejectedValue(apiError);

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');

            const today = new Date();
            const nextYear = today.getFullYear() + 1;
            fireEvent.change(nameInput, { target: { value: 'Summer Grand Prix 2025' } });
            fireEvent.change(infoInput, { target: { value: 'https://morpeth.example.com/summer-gp' } });
            fireEvent.change(startDateInput, { target: { value: `${String(nextYear)}-07-01` } });
            fireEvent.change(endDateInput, { target: { value: `${String(nextYear)}-07-05` } });

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            await screen.findByTestId('delete-error');

            fireEvent.change(infoInput, { target: { value: 'https://morpeth.example.com/summer-gp-2' } });

            expect(screen.queryByTestId('delete-error')).not.toBeInTheDocument();
        });
    });

    describe('in-flight save and delete states', () => {
        it('disables Cancel and shows the Saving state while an add is in flight', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            const addButton = screen.getByText('ADD TOURNAMENT');
            fireEvent.click(addButton);

            const nameInput = screen.getByLabelText('Tournament Name');
            const infoInput = screen.getByLabelText('Tournament Info URL');
            const startDateInput = screen.getByLabelText('Start Date');
            const endDateInput = screen.getByLabelText('End Date');

            const today = new Date();
            const nextYear = today.getFullYear() + 1;
            fireEvent.change(nameInput, { target: { value: 'New Tournament' } });
            fireEvent.change(infoInput, { target: { value: 'https://example.com/info' } });
            fireEvent.change(startDateInput, { target: { value: `${String(nextYear)}-07-01` } });
            fireEvent.change(endDateInput, { target: { value: `${String(nextYear)}-07-05` } });

            let resolveUpsert: (value: typeof sampleTournament) => void = () => undefined;
            clubsApiMocks.upsertTournament.mockReturnValue(new Promise(resolve => {
                resolveUpsert = resolve;
            }));

            const submitButton = screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });
            fireEvent.click(submitButton);

            const savingButton = await screen.findByRole('button', { name: 'Saving...' });
            expect(savingButton).toBeDisabled();
            expect(screen.getByText('Cancel')).toBeDisabled();

            // Resolve with a distinct tournament_name — reusing sampleTournament's name here would
            // give the grid two rows with the same key ('London Open 2025'), which React warns about.
            resolveUpsert({ ...sampleTournament, tournament_name: 'New Tournament' });

            await waitFor(() => {
                expect(screen.queryByText('Add Tournament')).not.toBeInTheDocument();
            });
        });

        it('disables Cancel and shows the Removing state while a delete is in flight', async () => {
            renderPage();

            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });

            let resolveDelete: () => void = () => undefined;
            clubsApiMocks.deleteTournament.mockReturnValue(new Promise<void>(resolve => {
                resolveDelete = resolve;
            }));

            const deleteButton = screen.getByTitle('Delete');
            fireEvent.click(deleteButton);

            const confirmButton = screen.getByText('Confirm Remove');
            fireEvent.click(confirmButton);

            const removingButton = await screen.findByRole('button', { name: 'Removing...' });
            expect(removingButton).toBeDisabled();
            expect(screen.getByText('Cancel')).toBeDisabled();

            resolveDelete();

            await waitFor(() => {
                expect(screen.queryByTestId('delete-confirm-title')).not.toBeInTheDocument();
            });
        });
    });

    describe('test links', () => {
        const openAddModal = async () => {
            renderPage();
            await waitFor(() => {
                expect(screen.getByText(/London Open 2025/)).toBeInTheDocument();
            });
            const addButton = screen.getByText('ADD TOURNAMENT');
            fireEvent.click(addButton);
            expect(screen.getByText('Add Tournament')).toBeInTheDocument();
        };

        const getFieldControl = (label: string) => {
            const input = screen.getByLabelText(label);
            const wrapper = input.closest('div');
            if (!wrapper) throw new Error(`${label} field control wrapper missing`);
            return wrapper;
        };

        it.each([
            ['Tournament Info URL', 'https://example.com/info', 'https://example.com/info'],
            ['Instagram Post', 'https://www.instagram.com/p/abc123', 'https://www.instagram.com/p/abc123'],
            ['Facebook Post', 'https://facebook.com/tournament', 'https://facebook.com/tournament'],
            ['Facebook Post', 'club-page', 'https://www.facebook.com/club-page'],
        ])('renders a Test link for valid %s input', async (label, value, expectedHref) => {
            await openAddModal();

            const input = screen.getByLabelText(label);
            fireEvent.change(input, { target: { value } });

            const fieldControl = getFieldControl(label);
            const testLink = within(fieldControl).getByRole('link', { name: 'Test' });
            expect(testLink).toHaveAttribute('href', expectedHref);
            expect(testLink).toHaveAttribute('target', '_blank');
            expect(testLink).toHaveAttribute('rel', 'noreferrer');
        });

        it.each([
            ['Tournament Info URL', 'not-a-url'],
            ['Instagram Post', 'https://twitter.com/post'],
            ['Facebook Post', 'https://other-site.com/page'],
            ['Facebook Post', '!club'],
            ['Facebook Post', 'club!'],
        ])('renders a disabled Test control for invalid %s input', async (label, value) => {
            await openAddModal();

            const input = screen.getByLabelText(label);
            fireEvent.change(input, { target: { value } });

            const fieldControl = getFieldControl(label);
            expect(within(fieldControl).queryByRole('link', { name: 'Test' })).not.toBeInTheDocument();
            expect(within(fieldControl).getByText('Test').tagName).toBe('SPAN');
        });
    });
});

