import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClubsAndTournaments } from '../../../src/pages/ClubsAndTournaments';
import { GeneralApiError } from '../../../src/api/api';
import { setUnitFixedClockTime } from '../TestClockUtils';
import type { ClubWithTournaments } from '../../../src/api/clubsApi';
import type { EnvironmentConfig } from '../../../src/config/environment';

const mockNavigate = vi.fn();
const cachedClubsApiMocks = vi.hoisted(() => ({
    getCachedAllClubsWithTournaments: vi.fn(),
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

vi.mock('../../../src/api/cachedClubsApi', () => ({
    getCachedAllClubsWithTournaments: cachedClubsApiMocks.getCachedAllClubsWithTournaments,
}));

describe('ClubsAndTournaments', () => {
    // The whole suite runs on this fixed clock, and formatTournamentDateRange compares against
    // getClockTime(), so dates are built relative to the fixed clock's year rather than the real one.
    const FIXED_CLOCK = '2026-06-01T12:00:00Z';
    const FIXED_CLOCK_YEAR = new Date(FIXED_CLOCK).getFullYear();

    const localEpoch = (year: number, month: number, day: number) =>
        Math.floor(new Date(year, month - 1, day, 12, 0, 0).getTime() / 1000);

    const nextYear = FIXED_CLOCK_YEAR + 1;

    // The API returns clubs already ordered by location, then club name, then tournament start date.
    const buildClub = (overrides: Partial<ClubWithTournaments> = {}): ClubWithTournaments => ({
        location: 'London',
        club_name: 'Battersea TTC',
        homepage: 'https://battersea.example.com',
        tournaments: [],
        ...overrides,
    });

    const buildTournament = (overrides = {}) => ({
        tournament_name: 'Battersea Winter Cup',
        tournament_info: 'https://battersea.example.com/winter-cup',
        start_date: localEpoch(nextYear, 8, 7),
        end_date: localEpoch(nextYear, 8, 10),
        ...overrides,
    });

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
        active_seasons_data_source: [],
    };

    const renderPage = () => {
        render(
            <MemoryRouter initialEntries={['/clubs-and-tournaments']}>
                <ClubsAndTournaments />
            </MemoryRouter>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        setUnitFixedClockTime(FIXED_CLOCK);

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
        });

        mockGetConfig.mockReturnValue(defaultConfig);
        cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockResolvedValue([]);
    });

    describe('page states', () => {
        it('shows the loading state while fetching', () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockImplementation(() => new Promise(() => { /* never resolves */ }));

            renderPage();

            expect(screen.getByText('Loading clubs and tournaments…')).toBeInTheDocument();
        });

        it('shows an error message when the fetch fails', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockRejectedValue(new Error('API Error'));

            renderPage();

            await waitFor(() => {
                expect(screen.getByTestId('main-error')).toBeInTheDocument();
            });
        });

        it('shows a server error message when the API returns a 500', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockRejectedValue(
                new GeneralApiError('Failed to fetch /clubs: 500 Internal Server Error', 500)
            );

            renderPage();

            await waitFor(() => {
                expect(screen.getByTestId('main-error')).toHaveTextContent(
                    'The server is having trouble right now. Please try again in a few minutes.'
                );
            });
        });

        it('appends validation errors to the error message when the API returns them', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockRejectedValue(
                new GeneralApiError('Validation failed', 400, undefined, ['location is required'])
            );

            renderPage();

            await waitFor(() => {
                expect(screen.getByTestId('main-error')).toHaveTextContent('location is required');
            });
        });

        it('shows empty-state messages in both sections when there is no data', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockResolvedValue([]);

            renderPage();

            await waitFor(() => {
                expect(screen.getByText('No upcoming tournaments found.')).toBeInTheDocument();
            });
            expect(screen.getByText('No clubs found.')).toBeInTheDocument();
        });
    });

    describe('tournaments section', () => {
        it('flattens tournaments across clubs and groups them by location', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockResolvedValue([
                buildClub({
                    location: 'Birmingham',
                    club_name: 'Rally Point',
                    tournaments: [buildTournament({ tournament_name: 'Midlands Masters' })],
                }),
                buildClub({
                    location: 'London',
                    club_name: 'Battersea TTC',
                    tournaments: [
                        buildTournament({ tournament_name: 'Battersea Winter Cup' }),
                        buildTournament({ tournament_name: 'Battersea Junior Series' }),
                    ],
                }),
                buildClub({
                    location: 'London',
                    club_name: 'Crystal Palace TT',
                    tournaments: [buildTournament({ tournament_name: 'Palace Open' })],
                }),
            ]);

            renderPage();

            await waitFor(() => {
                expect(screen.getAllByTestId('tournament-row')).toHaveLength(4);
            });

            const groups = screen.getAllByTestId('tournaments-location-group');
            expect(groups).toHaveLength(2);

            expect(within(groups[0]).getByTestId('tournaments-location')).toHaveTextContent('Birmingham');
            expect(within(groups[0]).getAllByTestId('tournament-row')).toHaveLength(1);

            // Both London clubs' tournaments land in a single London group
            expect(within(groups[1]).getByTestId('tournaments-location')).toHaveTextContent('London');
            expect(within(groups[1]).getAllByTestId('tournament-row')).toHaveLength(3);
        });

        it('renders each tournament as a link to its info page with the formatted date range', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockResolvedValue([
                buildClub({
                    tournaments: [buildTournament({
                        tournament_name: 'Midlands Masters',
                        tournament_info: 'https://midlands.example.com',
                        start_date: localEpoch(nextYear, 9, 9),
                        end_date: localEpoch(nextYear, 9, 12),
                    })],
                }),
            ]);

            renderPage();

            await waitFor(() => {
                expect(screen.getByTestId('tournament-link')).toBeInTheDocument();
            });

            const link = screen.getByTestId('tournament-link');
            // Exact match, not a substring: only an exact match can tell an elided year from a shown one.
            expect(link.textContent).toBe(`Midlands Masters, 9 - 12 Sep, ${String(nextYear)}`);
            expect(link).toHaveAttribute('href', 'https://midlands.example.com');
        });

        it('shows only the social links a tournament actually has', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockResolvedValue([
                buildClub({
                    tournaments: [buildTournament({ instagram: 'https://instagram.com/cup', facebook: null })],
                }),
            ]);

            renderPage();

            await waitFor(() => {
                expect(screen.getByTestId('tournament-instagram-link')).toBeInTheDocument();
            });
            expect(screen.queryByTestId('tournament-facebook-link')).not.toBeInTheDocument();
        });
    });

    describe('clubs section', () => {
        it('groups clubs by location and links each one to its homepage', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockResolvedValue([
                buildClub({ location: 'Birmingham', club_name: 'Rally Point', homepage: 'https://rally.example.com' }),
                buildClub({ location: 'London', club_name: 'Battersea TTC', homepage: 'https://battersea.example.com' }),
                buildClub({ location: 'London', club_name: 'Crystal Palace TT', homepage: 'https://palace.example.com' }),
            ]);

            renderPage();

            await waitFor(() => {
                expect(screen.getAllByTestId('club-row')).toHaveLength(3);
            });

            const groups = screen.getAllByTestId('clubs-location-group');
            expect(groups).toHaveLength(2);
            expect(within(groups[0]).getByTestId('clubs-location')).toHaveTextContent('Birmingham');
            expect(within(groups[1]).getAllByTestId('club-row')).toHaveLength(2);

            expect(screen.getAllByTestId('club-link')[0]).toHaveAttribute('href', 'https://rally.example.com');
        });

        it('shows the club social links, including youtube', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockResolvedValue([
                buildClub({
                    instagram: 'https://instagram.com/battersea',
                    facebook: 'https://facebook.com/battersea',
                    youtube: 'https://youtube.com/@battersea',
                }),
            ]);

            renderPage();

            await waitFor(() => {
                expect(screen.getByTestId('club-youtube-link')).toBeInTheDocument();
            });
            expect(screen.getByTestId('club-instagram-link')).toBeInTheDocument();
            expect(screen.getByTestId('club-facebook-link')).toBeInTheDocument();
        });

        it('omits a club with no homepage from the Clubs section but still lists its tournaments', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockResolvedValue([
                buildClub({
                    location: 'Manchester',
                    club_name: 'Never Promoted TTC',
                    homepage: undefined,
                    tournaments: [buildTournament({ tournament_name: 'Orphan Cup' })],
                }),
                buildClub({ location: 'London', club_name: 'Battersea TTC' }),
            ]);

            renderPage();

            await waitFor(() => {
                expect(screen.getAllByTestId('club-row')).toHaveLength(1);
            });

            // The unpromoted club has no link to show, so it is not listed under Clubs...
            expect(screen.getByTestId('club-link')).toHaveTextContent('Battersea TTC');
            expect(screen.queryByText('Never Promoted TTC')).not.toBeInTheDocument();

            // ...but its tournament is still announced under Tournaments.
            expect(screen.getByTestId('tournament-link')).toHaveTextContent('Orphan Cup');
            expect(screen.getByTestId('tournaments-location')).toHaveTextContent('Manchester');
        });

        it('shows the clubs empty state when every club is unpromoted', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockResolvedValue([
                buildClub({ club_name: 'Never Promoted TTC', homepage: null, tournaments: [buildTournament()] }),
            ]);

            renderPage();

            await waitFor(() => {
                expect(screen.getByText('No clubs found.')).toBeInTheDocument();
            });
            expect(screen.getAllByTestId('tournament-row')).toHaveLength(1);
        });
    });

    describe('caching', () => {
        it('fetches through the cached clubs API rather than calling clubsApi directly', async () => {
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockResolvedValue([buildClub()]);

            renderPage();

            await waitFor(() => {
                expect(cachedClubsApiMocks.getCachedAllClubsWithTournaments).toHaveBeenCalledTimes(1);
            });
        });

        it('re-renders with the fresh data when the stale-while-revalidate background refresh completes', async () => {
            let onDataUpdate: ((data: ClubWithTournaments[]) => void) | undefined;
            cachedClubsApiMocks.getCachedAllClubsWithTournaments.mockImplementation(
                (callback?: (data: ClubWithTournaments[]) => void) => {
                    onDataUpdate = callback;
                    // Simulates a stale cache hit: stale data is returned immediately...
                    return Promise.resolve([buildClub({ club_name: 'Stale Club' })]);
                }
            );

            renderPage();

            await waitFor(() => {
                expect(screen.getByText('Stale Club')).toBeInTheDocument();
            });

            // ...and the background refresh later delivers fresh data through the callback.
            expect(onDataUpdate).toBeDefined();
            act(() => {
                onDataUpdate?.([buildClub({ club_name: 'Fresh Club' })]);
            });

            await waitFor(() => {
                expect(screen.getByText('Fresh Club')).toBeInTheDocument();
            });
            expect(screen.queryByText('Stale Club')).not.toBeInTheDocument();
        });
    });
});
