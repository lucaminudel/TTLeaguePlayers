import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InviteTeamMembers } from '../../../src/pages/InviteTeamMembers';
import { setUnitFixedClockTime } from '../TestClockUtils';
import type { EnvironmentConfig } from '../../../src/config/environment';
import type { ActiveSeason } from '../../../src/contexts/AuthContextDefinition';

const mockUseAuth = vi.fn();
vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

const mockGetConfig = vi.fn();
vi.mock('../../../src/config/environment', () => ({
    getConfig: () => mockGetConfig() as EnvironmentConfig,
}));

const processorFactoryMocks = vi.hoisted(() => ({
    createActiveSeasonProcessor: vi.fn(),
}));
vi.mock('../../../src/service/active-season-processors/ActiveSeasonProcessorFactory', () => ({
    createActiveSeasonProcessor: processorFactoryMocks.createActiveSeasonProcessor,
}));

const teamPlayersCardMocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('../../../src/components/ui/TeamPlayersCard', () => ({
    TeamPlayersCard: (props: { season: { team_name: string; league: string; season: string; team_division: string }; isExpanded: boolean; onToggle: () => void }) => {
        teamPlayersCardMocks.render(props);
        return (
            <div data-testid="team-players-card" data-expanded={String(props.isExpanded)}>
                {props.season.league} {props.season.season} {props.season.team_name}, {props.season.team_division}
                <button type="button" data-testid={`toggle-${props.season.team_name}`} onClick={props.onToggle}>toggle</button>
            </div>
        );
    },
}));

describe('InviteTeamMembers', () => {
    // Inside the CLTTL 2025-2026 window declared in the data source below.
    const FIXED_CLOCK = '2026-01-15T11:01:48Z';

    const morpeth10: ActiveSeason = {
        league: 'CLTTL',
        season: '2025-2026',
        team_name: 'Morpeth 10',
        team_division: 'Division 4',
        person_name: 'Luca Minudel',
        role: 'CAPTAIN',
        latest_kudos: [],
    };

    const fusion5: ActiveSeason = { ...morpeth10, team_name: 'Fusion 5', role: 'PLAYER' };

    const morpeth9: ActiveSeason = { ...morpeth10, team_name: 'Morpeth 9' };

    const clttlDataSource = {
        league: 'CLTTL',
        season: '2025-2026',
        custom_processor: 'CLTTLActiveSeason2025Processor',
        custom_club_processor: 'CLTTLManagedClub2025Processor',
        registrations_start_date: Math.floor(new Date('2025-08-20T00:00:00Z').getTime() / 1000),
        ratings_end_date: Math.floor(new Date('2026-04-30T00:00:00Z').getTime() / 1000),
        division_tables: [],
        division_fixtures: [],
        division_players: [],
        club_teams: [],
    };

    let consoleErrorSpy: MockInstance;

    const setAuth = (activeSeasons: ActiveSeason[], isCaptain = activeSeasons.some((s) => s.role === 'CAPTAIN')) => {
        mockUseAuth.mockReturnValue({
            isAuthenticated: true,
            email: 'captain@example.test',
            username: 'Luca',
            activeSeasons,
            managedClubs: [],
            isPlayerOrCaptain: activeSeasons.length > 0,
            isClubManager: false,
            isCaptain,
            signOut: vi.fn(),
        });
    };

    const renderPage = () => {
        render(
            <MemoryRouter initialEntries={['/invite-team-members']}>
                <InviteTeamMembers />
            </MemoryRouter>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        setUnitFixedClockTime(FIXED_CLOCK);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [clttlDataSource] });
        processorFactoryMocks.createActiveSeasonProcessor.mockReturnValue({
            getTeamFixtures: vi.fn(),
            getTeamPlayers: vi.fn(),
        });
        setAuth([morpeth10]);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        setUnitFixedClockTime(undefined);
    });

    it('shows the page title', () => {
        renderPage();

        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Invite Team Members');
    });

    it('shows one card per captained team whose season is open', () => {
        renderPage();

        const cards = screen.getAllByTestId('team-players-card');
        expect(cards).toHaveLength(1);
        expect(cards[0]).toHaveTextContent('CLTTL 2025-2026');
        expect(cards[0]).toHaveTextContent('Morpeth 10, Division 4');
        expect(screen.queryByTestId('no-captain-season')).toBeNull();
        expect(screen.queryByTestId('no-active-season')).toBeNull();
    });

    it('shows one card per captaincy when the user captains several teams', () => {
        setAuth([morpeth10, morpeth9]);

        renderPage();

        expect(screen.getAllByTestId('team-players-card')).toHaveLength(2);
    });

    it('does not show a card for a PLAYER registration', () => {
        setAuth([morpeth10, fusion5]);

        renderPage();

        const cards = screen.getAllByTestId('team-players-card');
        expect(cards).toHaveLength(1);
        expect(cards[0]).toHaveTextContent('Morpeth 10');
    });

    it('builds each team processor for that team, through the CORS proxy', () => {
        renderPage();

        expect(processorFactoryMocks.createActiveSeasonProcessor).toHaveBeenCalledWith(
            'CLTTLActiveSeason2025Processor',
            clttlDataSource,
            'Division 4',
            'Morpeth 10',
            true
        );
    });

    it('opens the only card when the captain has a single team', () => {
        renderPage();

        expect(screen.getByTestId('team-players-card')).toHaveAttribute('data-expanded', 'true');
    });

    it('leaves every card closed when the captain has several teams', () => {
        setAuth([morpeth10, morpeth9]);

        renderPage();

        const cards = screen.getAllByTestId('team-players-card');
        expect(cards.map((card) => card.getAttribute('data-expanded'))).toEqual(['false', 'false']);
    });

    describe('when the list of captaincies changes while the page is open', () => {
        const morpethB: ActiveSeason = { ...morpeth10, league: 'BCS', team_name: 'Morpeth B', team_division: 'Division 2' };

        const bcsDataSource = { ...clttlDataSource, league: 'BCS' };

        const cardFor = (teamName: string) => screen
            .getAllByTestId('team-players-card')
            .find((card) => card.textContent.includes(teamName));

        beforeEach(() => {
            mockGetConfig.mockReturnValue({ active_seasons_data_source: [clttlDataSource, bcsDataSource] });
        });

        it('keeps the same team open when another captaincy drops out of the list', () => {
            setAuth([morpeth10, morpethB, morpeth9]);
            const { rerender } = render(
                <MemoryRouter initialEntries={['/invite-team-members']}>
                    <InviteTeamMembers />
                </MemoryRouter>
            );

            fireEvent.click(screen.getByTestId('toggle-Morpeth B'));
            expect(cardFor('Morpeth B')).toHaveAttribute('data-expanded', 'true');

            setAuth([morpethB, morpeth9]);
            rerender(
                <MemoryRouter initialEntries={['/invite-team-members']}>
                    <InviteTeamMembers />
                </MemoryRouter>
            );

            expect(cardFor('Morpeth B')).toHaveAttribute('data-expanded', 'true');
            expect(cardFor('Morpeth 9')).toHaveAttribute('data-expanded', 'false');
        });

        it('falls back to the sole remaining card when the open one disappears', () => {
            setAuth([morpeth10, morpethB]);
            const { rerender } = render(
                <MemoryRouter initialEntries={['/invite-team-members']}>
                    <InviteTeamMembers />
                </MemoryRouter>
            );

            fireEvent.click(screen.getByTestId('toggle-Morpeth B'));

            setAuth([morpeth10]);
            rerender(
                <MemoryRouter initialEntries={['/invite-team-members']}>
                    <InviteTeamMembers />
                </MemoryRouter>
            );

            expect(cardFor('Morpeth 10')).toHaveAttribute('data-expanded', 'true');
        });

        it('leaves the only card closed after the captain closes it', () => {
            setAuth([morpeth10]);
            renderPage();

            expect(cardFor('Morpeth 10')).toHaveAttribute('data-expanded', 'true');

            fireEvent.click(screen.getByTestId('toggle-Morpeth 10'));

            expect(cardFor('Morpeth 10')).toHaveAttribute('data-expanded', 'false');
        });
    });

    it('tells a user who captains nothing that they are not a captain', () => {
        setAuth([fusion5]);

        renderPage();

        expect(screen.getByTestId('no-captain-season')).toHaveTextContent('not currently registered as a team captain');
        expect(screen.queryByTestId('team-players-card')).toBeNull();
        expect(screen.queryByTestId('no-active-season')).toBeNull();
    });

    it('tells a captain whose seasons are all closed that none is active', () => {
        setUnitFixedClockTime('2026-05-01T00:00:00Z');

        renderPage();

        expect(screen.getByTestId('no-active-season')).toHaveTextContent('None of the teams you captain has an active season');
        expect(screen.queryByTestId('team-players-card')).toBeNull();
        expect(screen.queryByTestId('no-captain-season')).toBeNull();
    });
});
