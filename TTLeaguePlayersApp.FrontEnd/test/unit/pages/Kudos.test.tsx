import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Kudos } from '../../../src/pages/Kudos';
import { setUnitFixedClockTime } from '../TestClockUtils';
import type { EnvironmentConfig } from '../../../src/config/environment';

const mockUseAuth = vi.fn();
vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

const mockGetConfig = vi.fn();
vi.mock('../../../src/config/environment', () => ({
    getConfig: () => mockGetConfig() as EnvironmentConfig,
}));

vi.mock('../../../src/service/active-season-processors/ActiveSeasonProcessorFactory', () => ({
    createActiveSeasonProcessor: vi.fn(() => ({
        getTeamFixtures: vi.fn(),
        getTeamPlayers: vi.fn(),
    })),
}));

vi.mock('../../../src/components/ui/ActiveSeasonCard', () => ({
    ActiveSeasonCard: ({
        season,
        isExpanded,
        onToggle,
    }: {
        season: { league: string; season: string; team_name: string };
        isExpanded: boolean;
        onToggle: () => void;
    }) => (
        <div data-testid="active-season-card">
            <button type="button" data-testid="active-season-header" onClick={onToggle}>
                {season.league} {season.season} {season.team_name}
            </button>
            {isExpanded && <div data-testid="active-season-details" />}
        </div>
    ),
}));

describe('Kudos registration state', () => {
    const registeredSeason = {
        league: 'CLTTL',
        season: '2025-2026',
        team_name: 'Walworth Tigers',
        team_division: 'Division 4',
        person_name: 'Test Person',
        role: 'player',
        latest_kudos: [],
    };

    const dataSource = {
        league: 'CLTTL',
        season: '2025-2026',
        custom_processor: 'CLTTLActiveSeason2025Processor',
        registrations_start_date: Math.floor(new Date('2025-08-01T00:00:00Z').getTime() / 1000),
        ratings_end_date: Math.floor(new Date('2026-05-01T00:00:00Z').getTime() / 1000),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        setUnitFixedClockTime('2026-01-15T12:00:00Z');
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [dataSource] });
        mockUseAuth.mockReturnValue({
            isAuthenticated: true,
            activeSeasons: [registeredSeason],
            managedClubs: [],
        });
    });

    afterEach(() => {
        setUnitFixedClockTime(undefined);
    });

    const renderPage = () => render(
        <MemoryRouter initialEntries={['/kudos']}>
            <Kudos />
        </MemoryRouter>
    );

    it('shows the registration warning without a card when all registrations are outside their rating window', () => {
        setUnitFixedClockTime('2026-06-01T12:00:00Z');

        renderPage();

        expect(screen.getByText('⚠️ You are not currently registered to a league, a season, and a team.')).toBeInTheDocument();
        expect(screen.queryByTestId('active-seasons-list')).not.toBeInTheDocument();
        expect(screen.queryByTestId('active-season-card')).not.toBeInTheDocument();
    });

    it('shows the registration warning when Cognito has no registrations', () => {
        mockUseAuth.mockReturnValue({
            isAuthenticated: true,
            activeSeasons: [],
            managedClubs: [],
        });

        renderPage();

        expect(screen.getByText('⚠️ You are not currently registered to a league, a season, and a team.')).toBeInTheDocument();
        expect(screen.queryByTestId('active-season-card')).not.toBeInTheDocument();
    });

    it('renders a card for a registration inside its inclusive rating window', () => {
        renderPage();

        expect(screen.getByTestId('active-season-card')).toHaveTextContent('CLTTL 2025-2026 Walworth Tigers');
    });

    it('allows a single active-season card to be collapsed', async () => {
        renderPage();

        expect(await screen.findByTestId('active-season-details')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('active-season-header'));

        await waitFor(() => {
            expect(screen.queryByTestId('active-season-details')).not.toBeInTheDocument();
        });
    });
});
