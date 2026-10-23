import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ActiveSeasonCard } from '../../../../src/components/ui/ActiveSeasonCard';
import type { ActiveSeason } from '../../../../src/contexts/AuthContextDefinition';
import type { ActiveSeasonProcessor } from '../../../../src/service/active-season-processors/ActiveSeasonProcessor';
import type { Fixture } from '../../../../src/service/active-season-processors/ActiveSeasonProcessor';
import { DISPUTES_INFO_TITLE, RATE_INFO_MODAL_GUID } from '../../../../src/components/common/infoModalMessages';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate
}));

const mockUseAuth = vi.fn();
const mockIsSameDay = vi.fn<(date1: Date, date2: Date) => boolean>(() => false);

// Mock useAuth hook
vi.mock('../../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown
}));

// Mock DateUtils.
// formatFixtureDateTime is the one the component actually calls; without it here the factory
// leaves that export undefined and any test that renders a fixture blows up.
vi.mock('../../../../src/utils/DateUtils', () => ({
    getClockTime: () => new Date('2025-01-15T12:00:00Z'),
    formatFixtureDate: (date: Date) => date.toLocaleDateString(),
    formatFixtureDateTime: (date: Date) => date.toISOString(),
    isSameDay: (...args: [Date, Date]) => mockIsSameDay(...args)
}));

const createFixture = (overrides: Partial<Fixture> = {}): Fixture => ({
    homeTeam: 'Home Team',
    awayTeam: 'Away Team',
    startDateTime: new Date('2025-01-15T13:00:00Z'),
    venue: 'Test Venue',
    googleMapsUrl: null,
    ...overrides
});

const setActiveSeasons = (latestKudos: number[] = []) => {
    mockUseAuth.mockReturnValue({
        activeSeasons: [{
            league: 'TEST',
            season: '2025',
            team_name: 'Test Team',
            team_division: 'Division 1',
            person_name: 'Test Person',
            role: 'player',
            latest_kudos: latestKudos
        }],
        userId: 'test-user-sub'
    });
};

const setDifferentActiveSeason = () => {
    mockUseAuth.mockReturnValue({
        activeSeasons: [{
            league: 'OTHER',
            season: '2025',
            team_name: 'Other Team',
            team_division: 'Division 1',
            person_name: 'Other Person',
            role: 'player',
            latest_kudos: [Math.floor(new Date('2025-01-20T00:00:00Z').getTime() / 1000)]
        }],
        userId: 'test-user-sub'
    });
};

describe('ActiveSeasonCard Error Handling', () => {
    const mockSeason: ActiveSeason = {
        league: 'TEST',
        season: '2025',
        team_name: 'Test Team',
        team_division: 'Division 1',
        person_name: 'Test Person',
        role: 'player',
        latest_kudos: []
    };

    const mockOnToggle = vi.fn();
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSameDay.mockReturnValue(false);
        setActiveSeasons();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('should display "No fixture found" when processor throws error', async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockRejectedValue(new Error('Network error')),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={true}
                onToggle={mockOnToggle}
            />
        );

        // Wait for loading to complete
        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });
        // Verify error is logged
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching match data:', expect.any(Error));

        // Verify "No fixture found" message is displayed
        expect(screen.getByTestId('active-season-prev-match')).toHaveTextContent('No fixture found, retry later or tomorrow');
        expect(screen.getByTestId('active-season-next-match')).toHaveTextContent('No fixture found, retry later or tomorrow');
    });

    it('should display "No previous match" when the first fixture is upcoming', async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([createFixture({
                homeTeam: 'Test Team',
                awayTeam: 'Upcoming Opponent'
            })]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={true}
                onToggle={mockOnToggle}
            />
        );

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('active-season-prev-match')).toHaveTextContent('No previous match');
        expect(screen.getByTestId('active-season-next-match')).toHaveTextContent('Upcoming Opponent');
    });

    it('should display successful empty-fixture states instead of the fetch-failure message', async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={true}
                onToggle={mockOnToggle}
            />
        );

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('active-season-prev-match')).toHaveTextContent('No previous match');
        expect(screen.getByTestId('active-season-next-match')).toHaveTextContent('None');
    });

    it('keeps the generic headers for empty fixtures even if the same-day utility returns true', async () => {
        mockIsSameDay.mockReturnValue(true);
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(<ActiveSeasonCard season={mockSeason} processor={mockProcessor} isExpanded={true} onToggle={mockOnToggle} />);
        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('active-season-prev-match-header')).toHaveTextContent('Previous Match');
        expect(screen.getByTestId('active-season-next-match-header')).toHaveTextContent('Next Match');
    });

    it('shows the last fixture as previous and None as next when all fixtures are over', async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([
                createFixture({ homeTeam: 'Test Team', awayTeam: 'Older Opponent', startDateTime: new Date('2025-01-14T09:00:00Z') }),
                createFixture({ homeTeam: 'Test Team', awayTeam: 'Latest Opponent', startDateTime: new Date('2025-01-15T09:59:59Z') })
            ]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(<ActiveSeasonCard season={mockSeason} processor={mockProcessor} isExpanded={true} onToggle={mockOnToggle} />);

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('active-season-prev-match')).toHaveTextContent('Latest Opponent');
        expect(screen.getByTestId('active-season-next-match')).toHaveTextContent('None');
    });

    it('keeps a fixture exactly two hours ago as the next match', async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([
                createFixture({ homeTeam: 'Test Team', awayTeam: 'Boundary Opponent', startDateTime: new Date('2025-01-15T10:00:00Z') })
            ]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(<ActiveSeasonCard season={mockSeason} processor={mockProcessor} isExpanded={true} onToggle={mockOnToggle} />);

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('active-season-next-match')).toHaveTextContent('Boundary Opponent');
        expect(screen.getByTestId('active-season-prev-match')).toHaveTextContent('No previous match');
    });

    it('should make an away venue clickable when a Google Maps URL is available', async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([createFixture({
                homeTeam: 'Opponent Team',
                awayTeam: 'Test Team',
                venue: 'Away Venue',
                googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=1%2C2'
            })]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={true}
                onToggle={mockOnToggle}
            />
        );

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        const venueLink = screen.getByTestId('fixture-venue-link');
        expect(venueLink).toHaveTextContent('Away Venue');
        expect(venueLink).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=1%2C2');
        expect(venueLink).toHaveAttribute('target', '_blank');
        expect(venueLink).toHaveAttribute('rel', 'noreferrer');
        expect(venueLink).toHaveClass(
            'inline-block',
            'rounded-md',
            'bg-main-text',
            'px-1',
            'py-0',
            'text-primary-base',
            'hover:opacity-80'
        );
        const nextMatch = screen.getByTestId('active-season-next-match');
        expect(nextMatch).toHaveTextContent('Away game, 2025-01-15T13:00:00.000Z');
        expect(venueLink.previousElementSibling?.tagName).toBe('BR');
        expect(venueLink.nextElementSibling?.tagName).toBe('BR');
    });

    it('should keep a previous away venue as plain text even when a Google Maps URL is available', async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([
                createFixture({
                    homeTeam: 'Opponent Team',
                    awayTeam: 'Test Team',
                    startDateTime: new Date('2025-01-15T09:00:00Z'),
                    venue: 'Previous Away Venue',
                    googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=3%2C4'
                }),
                createFixture({
                    homeTeam: 'Opponent Team',
                    awayTeam: 'Test Team',
                    venue: 'Next Away Venue',
                    googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=1%2C2'
                })
            ]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={true}
                onToggle={mockOnToggle}
            />
        );

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('active-season-prev-match')).toHaveTextContent('Previous Away Venue');
        expect(screen.getByTestId('active-season-next-match')).toContainElement(screen.getByTestId('fixture-venue-link'));
    });

    it('should keep an away venue as plain text when no Google Maps URL is available', async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([createFixture({
                homeTeam: 'Opponent Team',
                awayTeam: 'Test Team',
                venue: 'Away Venue',
                googleMapsUrl: null
            })]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={true}
                onToggle={mockOnToggle}
            />
        );

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('active-season-next-match')).toHaveTextContent('Away game, Away Venue');
        expect(screen.getByTestId('active-season-next-match')).toHaveTextContent('Away Venue,');
        expect(screen.queryByTestId('fixture-venue-link')).not.toBeInTheDocument();
    });

    it('should keep a home game as non-link text even when a Google Maps URL is available', async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([createFixture({
                homeTeam: 'Test Team',
                awayTeam: 'Opponent Team',
                venue: 'Home Venue',
                googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=1%2C2'
            })]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={true}
                onToggle={mockOnToggle}
            />
        );

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('active-season-next-match')).toHaveTextContent('Home game');
        expect(screen.queryByTestId('fixture-venue-link')).not.toBeInTheDocument();
    });

    it('should not fetch data when not expanded', async () => {
        const getTeamFixturesMock = vi.fn().mockRejectedValue(new Error('Should not be called'));
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: getTeamFixturesMock,
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={false}
                onToggle={mockOnToggle}
            />
        );

        // Wait a bit to ensure no async operations
        await new Promise<void>(resolve => {
            setTimeout(() => {
                resolve();
            }, 10);
        });

        expect(getTeamFixturesMock).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle expansion and show loading state before error', async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockImplementation(() =>
                new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error('Delayed error'));
                    }, 50);
                })
            ),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        const { rerender } = render(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={false}
                onToggle={mockOnToggle}
            />
        );

        // Expand the card
        rerender(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={true}
                onToggle={mockOnToggle}
            />
        );

        // Should show loading initially
        expect(screen.getByTestId('active-season-loading')).toBeInTheDocument();

        // Wait for error to occur
        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        // Verify error handling
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(screen.getByTestId('active-season-prev-match')).toHaveTextContent('No fixture found, retry later or tomorrow');
    });

    it('shows Today’s Match for a same-day previous and next fixture, and shows the matching chevron state', async () => {
        mockIsSameDay.mockReturnValue(true);
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([
                createFixture({ homeTeam: 'Test Team', awayTeam: 'Previous Opponent', startDateTime: new Date('2025-01-15T09:00:00Z') }),
                createFixture({ homeTeam: 'Test Team', awayTeam: 'Next Opponent', startDateTime: new Date('2025-01-15T13:00:00Z') })
            ]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        const { rerender } = render(<ActiveSeasonCard season={mockSeason} processor={mockProcessor} isExpanded={true} onToggle={mockOnToggle} />);

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        expect(screen.getByTestId('active-season-prev-match-header')).toHaveTextContent("Today's Match");
        expect(screen.getByTestId('active-season-next-match-header')).toHaveTextContent("Today's Match");
        expect(screen.getByText('▼')).toBeInTheDocument();

        rerender(<ActiveSeasonCard season={mockSeason} processor={mockProcessor} isExpanded={false} onToggle={mockOnToggle} />);
        expect(screen.getByText('▶')).toBeInTheDocument();
    });
});

describe('ActiveSeasonCard Rate info modal', () => {
    const mockSeason: ActiveSeason = {
        league: 'TEST',
        season: '2025',
        team_name: 'Test Team',
        team_division: 'Division 1',
        person_name: 'Test Person',
        role: 'player',
        latest_kudos: []
    };

    const mockOnToggle = vi.fn();

    // getClockTime is mocked to 2025-01-15T12:00:00Z. The first fixture at or after
    // (now - 2h) becomes the next match, and the one before it becomes the previous match -
    // which is the one the Rate button belongs to.
    const fixtures = [
        createFixture({
            homeTeam: 'Test Team',
            awayTeam: 'Previous Opponent',
            startDateTime: new Date('2025-01-08T19:00:00Z'),
            venue: 'Home Venue',
            googleMapsUrl: null
        }),
        createFixture({
            homeTeam: 'Next Opponent',
            awayTeam: 'Test Team',
            startDateTime: new Date('2025-01-22T19:00:00Z'),
            venue: 'Away Venue',
            googleMapsUrl: null
        })
    ];

    const renderExpandedCard = async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue(fixtures),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        const view = render(
            <ActiveSeasonCard
                season={mockSeason}
                processor={mockProcessor}
                isExpanded={true}
                onToggle={mockOnToggle}
            />
        );

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });
        return view;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSameDay.mockReturnValue(false);
        setActiveSeasons();
        localStorage.clear();
    });

    it('opens a modal with the accessible dialog semantics when Rate is clicked', async () => {
        await renderExpandedCard();

        fireEvent.click(screen.getByTestId('rate-button'));

        const modal = screen.getByTestId('rate-info-modal');
        expect(modal).toBeInTheDocument();
        expect(modal).toHaveAttribute('role', 'dialog');
        expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    it('labels the modal with its own title, so a screen reader announces it on open', async () => {
        await renderExpandedCard();

        fireEvent.click(screen.getByTestId('rate-button'));

        const modal = screen.getByTestId('rate-info-modal');
        const labelledBy = modal.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();

        // toHaveAccessibleName resolves aria-labelledby against the document, so this fails both
        // when the attribute is missing and when it points at an id that does not exist.
        expect(modal).toHaveAccessibleName(DISPUTES_INFO_TITLE);
    });

    it('moves focus to the OK button when the modal opens', async () => {
        await renderExpandedCard();

        fireEvent.click(screen.getByTestId('rate-button'));

        await waitFor(() => {
            expect(screen.getByTestId('rate-info-modal-ok')).toHaveFocus();
        });
    });

    it('navigates to award kudos with the selected fixture after the modal is confirmed', async () => {
        await renderExpandedCard();

        fireEvent.click(screen.getByTestId('rate-button'));
        fireEvent.click(screen.getByTestId('rate-info-modal-ok'));

        expect(mockNavigate.mock.calls.at(-1)?.[0]).toBe('/award-kudos');
        expect(mockNavigate.mock.calls.at(-1)?.[1]).toMatchObject({
            state: {
                league: 'TEST',
                season: '2025',
                teamName: 'Test Team',
                opponentTeam: 'Previous Opponent',
                isHome: true,
                venue: 'Home Venue',
                matchDateTime: '2025-01-08T19:00:00.000Z'
            }
        });
    });

    it('does not offer Rate when that exact fixture has already received kudos', async () => {
        setActiveSeasons([Math.floor(fixtures[0].startDateTime.getTime() / 1000)]);

        await renderExpandedCard();

        expect(screen.queryByTestId('rate-button')).not.toBeInTheDocument();
    });

    it('offers Rate when the authenticated user has no matching active-season record', async () => {
        setDifferentActiveSeason();

        await renderExpandedCard();

        expect(screen.getByTestId('rate-button')).toBeInTheDocument();
    });

    it.each([
        { league: 'OTHER', season: '2025', team_name: 'Test Team' },
        { league: 'TEST', season: 'OTHER', team_name: 'Test Team' },
        { league: 'TEST', season: '2025', team_name: 'Other Team' }
    ])('requires every season identity field before applying kudos from %o', async (differentSeason) => {
        mockUseAuth.mockReturnValue({
            activeSeasons: [{
                ...mockSeason,
                ...differentSeason,
                latest_kudos: [Math.floor(new Date('2025-01-20T00:00:00Z').getTime() / 1000)]
            }],
            userId: 'test-user-sub'
        });

        await renderExpandedCard();

        expect(screen.getByTestId('rate-button')).toBeInTheDocument();
    });

    it('does not offer Rate for a match older than the latest kudos, but does for a newer one', async () => {
        setActiveSeasons([
            Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000),
            Math.floor(new Date('2025-01-10T00:00:00Z').getTime() / 1000)
        ]);

        const firstCard = await renderExpandedCard();
        expect(screen.queryByTestId('rate-button')).not.toBeInTheDocument();

        firstCard.unmount();

        setActiveSeasons([Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000)]);
        await renderExpandedCard();
        expect(screen.getByTestId('rate-button')).toBeInTheDocument();
    });

    it('navigates directly without opening the info modal when its per-user preference is suppressed', async () => {
        localStorage.setItem(`hide_modal_${RATE_INFO_MODAL_GUID}_test-user-sub`, 'true');

        await renderExpandedCard();
        fireEvent.click(screen.getByTestId('rate-button'));

        expect(screen.queryByTestId('rate-info-modal')).not.toBeInTheDocument();
        expect(mockNavigate).toHaveBeenCalledWith('/award-kudos', expect.objectContaining({
            state: expect.objectContaining({ opponentTeam: 'Previous Opponent', isHome: true }) as unknown
        }));
    });

    it('passes the home opponent and isHome false for an away match', async () => {
        const awayPreviousFixture = createFixture({
            homeTeam: 'Away Opponent',
            awayTeam: 'Test Team',
            startDateTime: new Date('2025-01-08T19:00:00Z'),
            venue: 'Away Venue'
        });
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue([awayPreviousFixture, fixtures[1]]),
            getTeamPlayers: vi.fn().mockResolvedValue([])
        };

        render(<ActiveSeasonCard season={mockSeason} processor={mockProcessor} isExpanded={true} onToggle={mockOnToggle} />);
        await waitFor(() => {
            expect(screen.queryByTestId('active-season-loading')).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('rate-button'));
        fireEvent.click(screen.getByTestId('rate-info-modal-ok'));

        expect(mockNavigate).toHaveBeenCalledWith('/award-kudos', expect.objectContaining({
            state: expect.objectContaining({ opponentTeam: 'Away Opponent', isHome: false, venue: 'Away Venue' }) as unknown
        }));
    });
});
