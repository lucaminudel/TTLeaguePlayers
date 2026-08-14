import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ActiveSeasonCard } from '../../../../src/components/ui/ActiveSeasonCard';
import type { ActiveSeason } from '../../../../src/contexts/AuthContextDefinition';
import type { ActiveSeasonProcessor } from '../../../../src/service/active-season-processors/ActiveSeasonProcessor';

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
            getTeamFixtures: vi.fn().mockRejectedValue(new Error('Network error'))
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

    it('should not fetch data when not expanded', async () => {
        const getTeamFixturesMock = vi.fn().mockRejectedValue(new Error('Should not be called'));
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: getTeamFixturesMock
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
            )
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
        {
            homeTeam: 'Test Team',
            awayTeam: 'Previous Opponent',
            startDateTime: new Date('2025-01-08T19:00:00Z'),
            venue: 'Home Venue'
        },
        {
            homeTeam: 'Next Opponent',
            awayTeam: 'Test Team',
            startDateTime: new Date('2025-01-22T19:00:00Z'),
            venue: 'Away Venue'
        }
    ];

    const renderExpandedCard = async () => {
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockResolvedValue(fixtures)
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
        expect(modal).toHaveAccessibleName('Please be aware that:');
    });

    it('moves focus to the OK button when the modal opens', async () => {
        await renderExpandedCard();

        fireEvent.click(screen.getByTestId('rate-button'));

        await waitFor(() => {
            expect(screen.getByTestId('rate-info-modal-ok')).toHaveFocus();
        });
    });
});