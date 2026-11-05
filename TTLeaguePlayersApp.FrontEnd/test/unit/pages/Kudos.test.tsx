import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
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

const mockCreateActiveSeasonProcessor = vi.fn(() => ({
    getTeamFixtures: vi.fn(),
    getTeamPlayers: vi.fn(),
}));
vi.mock('../../../src/service/league-season-processors/ActiveSeasonProcessorFactory', () => ({
    createActiveSeasonProcessor: (...args: unknown[]) => mockCreateActiveSeasonProcessor(...args as Parameters<typeof mockCreateActiveSeasonProcessor>),
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
        <div data-testid="active-season-card" data-instance-team={useCardInstance(season.team_name)}>
            <button type="button" data-testid="active-season-header" onClick={onToggle}>
                {season.league} {season.season} {season.team_name}
            </button>
            {isExpanded && <div data-testid="active-season-details" />}
        </div>
    ),
}));

function useCardInstance(teamName: string): string {
    const [initialTeamName] = useState(teamName);
    return initialTeamName;
}

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
        custom_processor: 'CLTTLActiveSeason2026Processor',
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

    it.each([undefined, []])('shows the registration warning when active-season configuration is %s', (sources) => {
        mockGetConfig.mockReturnValue({ active_seasons_data_source: sources });

        renderPage();

        expect(screen.getByText('⚠️ You are not currently registered to a league, a season, and a team.')).toBeInTheDocument();
        expect(screen.queryByTestId('active-season-card')).not.toBeInTheDocument();
    });

    it('renders a card for a registration inside its inclusive rating window', () => {
        renderPage();

        expect(screen.getByTestId('active-season-card')).toHaveTextContent('CLTTL 2025-2026 Walworth Tigers');
        expect(mockCreateActiveSeasonProcessor).toHaveBeenCalledWith(
            'CLTTLActiveSeason2026Processor', dataSource, 'Division 4', 'Walworth Tigers', true
        );
    });

    it.each([
        ['registration start', dataSource.registrations_start_date],
        ['ratings end', dataSource.ratings_end_date],
    ])('includes a registration exactly at the %s boundary', (_boundary, epochSeconds) => {
        setUnitFixedClockTime(new Date(epochSeconds * 1000).toISOString());

        renderPage();

        expect(screen.getByTestId('active-season-card')).toBeInTheDocument();
    });

    it('does not show a card when no configured source matches both league and season', () => {
        mockGetConfig.mockReturnValue({
            active_seasons_data_source: [
                { ...dataSource, season: '2024-2025' },
                { ...dataSource, league: 'Other League' },
            ],
        });

        renderPage();

        expect(screen.getByText('⚠️ You are not currently registered to a league, a season, and a team.')).toBeInTheDocument();
        expect(screen.queryByTestId('active-season-card')).not.toBeInTheDocument();
    });

    it('keeps multiple registrations collapsed until the player opens one', () => {
        const secondRegistration = { ...registeredSeason, team_name: 'Walworth Lions', team_division: 'Division 2' };
        mockUseAuth.mockReturnValue({
            isAuthenticated: true,
            activeSeasons: [registeredSeason, secondRegistration],
            managedClubs: [],
        });
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [dataSource] });

        renderPage();

        expect(screen.getAllByTestId('active-season-card')).toHaveLength(2);
        expect(screen.queryByTestId('active-season-details')).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByTestId('active-season-header')[1]);
        expect(screen.getByTestId('active-season-details')).toBeInTheDocument();
        fireEvent.click(screen.getAllByTestId('active-season-header')[1]);
        expect(screen.queryByTestId('active-season-details')).not.toBeInTheDocument();
    });

    it('keeps each card instance attached to its registration when the list order changes', () => {
        const secondRegistration = { ...registeredSeason, team_name: 'Walworth Lions', team_division: 'Division 2' };
        mockUseAuth.mockReturnValue({ isAuthenticated: true, activeSeasons: [registeredSeason, secondRegistration], managedClubs: [] });
        const view = renderPage();

        mockUseAuth.mockReturnValue({ isAuthenticated: true, activeSeasons: [secondRegistration, registeredSeason], managedClubs: [] });
        view.rerender(
            <MemoryRouter initialEntries={['/kudos']}>
                <Kudos />
            </MemoryRouter>
        );

        const cards = screen.getAllByTestId('active-season-card');
        expect(cards.map((card) => card.getAttribute('data-instance-team'))).toEqual(['Walworth Lions', 'Walworth Tigers']);
    });

    it('continues rendering other cards when one processor factory call fails', () => {
        const secondRegistration = { ...registeredSeason, team_name: 'Walworth Lions', team_division: 'Division 2' };
        mockUseAuth.mockReturnValue({ isAuthenticated: true, activeSeasons: [registeredSeason, secondRegistration], managedClubs: [] });
        mockCreateActiveSeasonProcessor.mockImplementationOnce(() => { throw new Error('unsupported processor'); });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        renderPage();

        expect(screen.getAllByTestId('active-season-card')).toHaveLength(1);
        expect(screen.getByTestId('active-season-header')).toHaveTextContent('Walworth Lions');
        expect(errorSpy).toHaveBeenCalledWith('❌ Error rendering active season card:', expect.any(Error));
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
