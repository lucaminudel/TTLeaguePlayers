import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ActiveSeasonCard } from '../../../../src/components/ui/ActiveSeasonCard';
import type { ActiveSeason } from '../../../../src/contexts/AuthContextDefinition';
import type { ActiveSeasonProcessor } from '../../../../src/service/active-season-processors/ActiveSeasonProcessor';

// Mock DateUtils
vi.mock('../../../../src/utils/DateUtils', () => ({
    getClockTime: () => new Date('2025-01-15T12:00:00Z'),
    formatFixtureDate: (date: Date) => date.toLocaleDateString(),
    isSameDay: () => false
}));

describe('ActiveSeasonCard Error Handling', () => {
    const mockSeason: ActiveSeason = {
        league: 'TEST',
        season: '2025',
        team_name: 'Test Team',
        team_division: 'Division 1',
        person_name: 'Test Person',
        role: 'player'
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
        const mockProcessor: ActiveSeasonProcessor = {
            getTeamFixtures: vi.fn().mockRejectedValue(new Error('Should not be called'))
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

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const getTeamFixturesMock = mockProcessor.getTeamFixtures as unknown as MockInstance;
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