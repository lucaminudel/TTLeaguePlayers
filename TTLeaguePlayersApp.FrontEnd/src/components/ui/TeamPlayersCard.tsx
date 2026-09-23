import React from 'react';
import type { ActiveSeason } from '../../contexts/AuthContextDefinition';
import type { ActiveSeasonProcessor } from '../../service/active-season-processors/ActiveSeasonProcessor';
import { TeamPlayersList } from './TeamPlayersList';

interface TeamPlayersCardProps {
    season: ActiveSeason;
    /** Built by the page from the season's data source, so this component stays testable. */
    processor: ActiveSeasonProcessor;
    isExpanded: boolean;
    onToggle: () => void;
}

/**
 * One captained team, as a collapsible card. The header shape is the one the Kudos page already
 * uses for an active season (league + season, then team + division), so a captain reads the same
 * two lines on both pages.
 *
 * The list is mounted ONLY while expanded, which is what keeps a captain of several teams from
 * scraping every roster on every visit: each list fetches on mount.
 */
export const TeamPlayersCard: React.FC<TeamPlayersCardProps> = ({ season, processor, isExpanded, onToggle }) => (
    <div className="bg-primary border border-gray-600 rounded-lg p-0" data-testid="team-players-card">
        <div
            className="relative flex justify-center items-center cursor-pointer py-2"
            onClick={onToggle}
            data-testid="team-players-header"
        >
            <div className="text-center">
                <p className="text-base sm:text-lg font-bold" data-testid="team-players-league">
                    {season.league} {season.season}
                </p>
                <p className="text-base sm:text-lg" data-testid="team-players-team">
                    {season.team_name}, {season.team_division}
                </p>
            </div>
            <div className="absolute right-4 text-2xl text-secondary-text">
                {isExpanded ? '▼' : '▶'}
            </div>
        </div>

        {isExpanded && (
            <div data-testid="team-players-details">
                <div className="border-t border-gray-600 my-1"></div>
                <div className="px-3 pb-2">
                    <TeamPlayersList
                        processor={processor}
                        league={season.league}
                        season={season.season}
                        teamDivision={season.team_division}
                        teamName={season.team_name}
                        invitedBy={season.person_name}
                    />
                </div>
            </div>
        )}
    </div>
);
