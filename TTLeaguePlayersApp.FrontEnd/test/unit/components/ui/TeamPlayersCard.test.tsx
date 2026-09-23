import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TeamPlayersCard } from '../../../../src/components/ui/TeamPlayersCard';
import type { ActiveSeason } from '../../../../src/contexts/AuthContextDefinition';
import type { ActiveSeasonProcessor } from '../../../../src/service/active-season-processors/ActiveSeasonProcessor';

const teamPlayersListMocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('../../../../src/components/ui/TeamPlayersList', () => ({
    TeamPlayersList: (props: Record<string, unknown>) => {
        teamPlayersListMocks.render(props);
        return <div data-testid="team-players-list" />;
    },
}));

describe('TeamPlayersCard', () => {
    const season: ActiveSeason = {
        league: 'CLTTL',
        season: '2025-2026',
        team_name: 'Morpeth 10',
        team_division: 'Division 4',
        person_name: 'Luca Minudel',
        role: 'CAPTAIN',
        latest_kudos: [],
    };

    const processor: ActiveSeasonProcessor = { getTeamFixtures: vi.fn(), getTeamPlayers: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderCard = (isExpanded: boolean, onToggle = vi.fn()) => {
        render(
            <TeamPlayersCard
                season={season}
                processor={processor}
                isExpanded={isExpanded}
                onToggle={onToggle}
            />
        );
        return onToggle;
    };

    it('shows the league, season, team and division in the header', () => {
        renderCard(false);

        expect(screen.getByTestId('team-players-league')).toHaveTextContent('CLTTL 2025-2026');
        expect(screen.getByTestId('team-players-team')).toHaveTextContent('Morpeth 10, Division 4');
    });

    it('renders no body and does not mount the list while collapsed', () => {
        renderCard(false);

        expect(screen.queryByTestId('team-players-details')).toBeNull();
        expect(screen.queryByTestId('team-players-list')).toBeNull();
        expect(teamPlayersListMocks.render).not.toHaveBeenCalled();
    });

    it('mounts the list with this team, and the captain as the inviter, when expanded', () => {
        renderCard(true);

        expect(screen.getByTestId('team-players-details')).toBeTruthy();
        expect(screen.getByTestId('team-players-list')).toBeTruthy();
        expect(teamPlayersListMocks.render).toHaveBeenCalledWith(expect.objectContaining({
            processor,
            league: 'CLTTL',
            season: '2025-2026',
            teamDivision: 'Division 4',
            teamName: 'Morpeth 10',
            invitedBy: 'Luca Minudel',
        }));
    });

    it('calls onToggle when the header is clicked', () => {
        const onToggle = renderCard(false);

        fireEvent.click(screen.getByTestId('team-players-header'));

        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('turns the chevron down when expanded', () => {
        renderCard(true);
        expect(screen.getByTestId('team-players-header')).toHaveTextContent('▼');
    });

    it('points the chevron right when collapsed', () => {
        renderCard(false);
        expect(screen.getByTestId('team-players-header')).toHaveTextContent('▶');
    });
});
