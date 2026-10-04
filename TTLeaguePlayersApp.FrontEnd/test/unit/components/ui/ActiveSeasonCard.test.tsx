import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ActiveSeasonCard } from '../../../../src/components/ui/ActiveSeasonCard';
import type { ActiveSeason } from '../../../../src/contexts/AuthContextDefinition';
import type { ActiveSeasonProcessor } from '../../../../src/service/active-season-processors/ActiveSeasonProcessor';
import type { Fixture } from '../../../../src/service/active-season-processors/ActiveSeasonProcessor';
import { DISPUTES_INFO_TITLE } from '../../../../src/components/common/infoModalMessages';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate
}));

// Mock useAuth hook
vi.mock('../../../../src/hooks/useAuth', () => ({
    useAuth: () => ({
        activeSeasons: [{
            league: 'TEST',
            season: '2025',
            team_name: 'Test Team',
            team_division: 'Division 1',
            person_name: 'Test Person',
            role: 'player',
            latest_kudos: []
        }],
        userId: 'test-user-sub'
    })
}));

// Mock DateUtils.
// formatFixtureDateTime is the one the component actually calls; without it here the factory
// leaves that export undefined and any test that renders a fixture blows up.
vi.mock('../../../../src/utils/DateUtils', () => ({
    getClockTime: () => new Date('2025-01-15T12:00:00Z'),
    formatFixtureDate: (date: Date) => date.toLocaleDateString(),
    formatFixtureDateTime: (date: Date) => date.toISOString(),
    isSameDay: () => false
}));

const createFixture = (overrides: Partial<Fixture> = {}): Fixture => ({
    homeTeam: 'Home Team',
    awayTeam: 'Away Team',
    startDateTime: new Date('2025-01-15T13:00:00Z'),
    venue: 'Test Venue',
    googleMapsUrl: null,
    ...overrides
});

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
        expect(nextMatch).toHaveTextContent('Away game Away Venue');
        expect(nextMatch).not.toHaveTextContent('Away game, Away Venue,');
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
    };

    beforeEach(() => {
        vi.clearAllMocks();
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
});
