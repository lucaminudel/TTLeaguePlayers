import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActiveSeason } from '../../contexts/AuthContextDefinition';
import type { ActiveSeasonProcessor } from '../../service/active-season-processors/ActiveSeasonProcessor';
import type { Fixture } from '../../service/active-season-processors/clttl-2025/CLTTLActiveSeason2025PagesParser';
import { getClockTime, formatFixtureDateTime, isSameDay } from '../../utils/DateUtils';
import { Button } from '../common/Button';
import { useAuth } from '../../hooks/useAuth';

interface ActiveSeasonCardProps {
    season: ActiveSeason;
    processor: ActiveSeasonProcessor;
    isExpanded: boolean;
    onToggle: () => void;
}

export const ActiveSeasonCard: React.FC<ActiveSeasonCardProps> = ({ season, processor, isExpanded, onToggle }) => {
    const navigate = useNavigate();
    const { activeSeasons } = useAuth();
    const [prevMatch, setPrevMatch] = useState<Fixture | null | -1>(null);
    const [nextMatch, setNextMatch] = useState<Fixture | null | -1>(null);
    const [isLoadingData, setIsLoadingData] = useState(false);

    useEffect(() => {
        if (isExpanded) {
            const fetchData = async () => {
                setIsLoadingData(true);
                try {
                    const fixtures = await processor.getTeamFixtures();
                    const now = getClockTime();
                    // Requirement: Next fixture is the first fixture where startDateTime >= (now - 2 hours)
                    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

                    const nextFixtureIndex = fixtures.findIndex(f => f.startDateTime >= twoHoursAgo);

                    if (nextFixtureIndex !== -1) {
                        setNextMatch(fixtures[nextFixtureIndex]);
                        if (nextFixtureIndex > 0) {
                            setPrevMatch(fixtures[nextFixtureIndex - 1]);
                        } else {
                            setPrevMatch(null);
                        }
                    } else {
                        // All fixtures in the past?
                        setNextMatch(fixtures.length > 0 ? -1 : null);
                        setPrevMatch(fixtures.length > 0 ? fixtures[fixtures.length - 1] : null);
                    }
                } catch (error) {
                    console.error('Error fetching match data:', error);
                } finally {
                    setIsLoadingData(false);
                }
            };
            void fetchData();
        }
    }, [isExpanded, processor]);

    // Helper function to check if Rate button should be visible for previous match
    const shouldShowRateButton = (fixture: Fixture | null): boolean => {
        if (!fixture) return false;

        // Find the current season's latest_kudos
        const currentSeason = activeSeasons.find(
            s => s.league === season.league &&
                s.season === season.season &&
                s.team_name === season.team_name
        );

        const latestKudos = currentSeason?.latest_kudos ?? [];
        const matchTimestampSeconds = Math.floor(fixture.startDateTime.getTime() / 1000);

        // 1. If this exact match has already been rated, hide it
        if (latestKudos.includes(matchTimestampSeconds)) {
            return false;
        }

        // 2. If there are no kudos at all, show it
        if (latestKudos.length === 0) {
            return true;
        }

        // 3. Otherwise, only show if the match is NEWER than the latest kudo given
        const latestKudosTimestamp = Math.max(...latestKudos);
        return matchTimestampSeconds > latestKudosTimestamp;
    };

    // Handler for Rate button click
    const handleRateClick = (fixture: Fixture) => {
        const isHome = fixture.homeTeam === season.team_name;
        const opponentTeam = isHome ? fixture.awayTeam : fixture.homeTeam;

        // Navigate to award-kudos page with all required info
        void navigate('/award-kudos', {
            state: {
                league: season.league,
                season: season.season,
                teamDivision: season.team_division,
                teamName: season.team_name,
                personName: season.person_name,
                opponentTeam,
                matchDateTime: fixture.startDateTime.toISOString(),
                isHome,
                venue: fixture.venue
            }
        });
    };

    const renderFixture = (fixture: Fixture | null | -1, testId: string) => {
        if (fixture === -1) return <p className="text-base sm:text-lg" data-testid={testId}>None</p>;
        if (!fixture) return <p className="text-base sm:text-lg" data-testid={testId}>No fixture found, retry later or tomorrow</p>;

        const isHome = fixture.homeTeam === season.team_name;
        const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;
        const dateStr = formatFixtureDateTime(fixture.startDateTime);

        // Visualisation: Home game (if ...), Date Time ... or Away game, {venue} (if ...), Date Time ...
        // Vs Opponent
        return (
            <p className="text-base sm:text-lg" data-testid={testId}>
                {isHome ? 'Home game' : `Away game, ${fixture.venue}`}, {dateStr}<br />
                Vs {opponent}
            </p>
        );
    };

    const currentClockTime = getClockTime();
    const prevMatchHeader = prevMatch && prevMatch !== -1 && isSameDay(prevMatch.startDateTime, currentClockTime)
        ? "Today's Match"
        : "Previous Match";
    const nextMatchHeader = nextMatch && nextMatch !== -1 && isSameDay(nextMatch.startDateTime, currentClockTime)
        ? "Today's Match"
        : "Next Match";

    return (
        <div className="bg-primary border border-gray-600 rounded-lg p-0" data-testid="active-season-card">
            <div
                className="relative flex justify-center items-center cursor-pointer"
                onClick={onToggle}
                data-testid="active-season-header"
            >
                <div className="text-center">
                    <div>
                        <p className="text-base sm:text-lg font-bold" data-testid="active-season-league">
                            {season.league} {season.season}
                        </p>
                    </div>
                    <div>
                        <p className="text-base sm:text-lg" data-testid="active-season-team">
                            {season.team_name}, {season.team_division}
                        </p>
                    </div>
                </div>
                <div className="absolute right-4 text-2xl text-secondary-text">
                    {/* Chevron icon using unicode */}
                    {isExpanded ? '▼' : '▶'}
                </div>
            </div>

            {isExpanded && (
                <div className="text-center" data-testid="active-season-details">
                    <div className="border-t border-gray-600 my-1"></div>

                    {isLoadingData ? (
                        <div className="p-4" data-testid="active-season-loading">Loading match data...</div>
                    ) : (
                        <>
                            <div className="mb-6">
                                <p data-testid="active-season-prev-match-header" className="text-secondary-text text-sm sm:text-base uppercase tracking-wide mt-2 font-bold">
                                    {prevMatchHeader}
                                </p>
                                {renderFixture(prevMatch, "active-season-prev-match")}
                                {prevMatch && prevMatch !== -1 && shouldShowRateButton(prevMatch) && (
                                    <div className="mt-2 flex justify-center">
                                        <Button
                                            onClick={() => { handleRateClick(prevMatch); }}
                                            data-testid="rate-button"
                                        >
                                            Rate
                                        </Button>
                                    </div>
                                )}
                                {!(prevMatch && prevMatch !== -1 && shouldShowRateButton(prevMatch)) && (
                                    <>
                                        <div className="h-4"></div>
                                        <div className="h-4"></div>
                                    </>
                                )}
                                <div className="h-4"></div>
                                <div className="h-4"></div>
                            </div>

                            <div>
                                <p data-testid="active-season-next-match-header" className="text-secondary-text text-sm sm:text-base uppercase tracking-wide mt-2 font-bold">
                                    {nextMatchHeader}
                                </p>
                                {renderFixture(nextMatch, "active-season-next-match")}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
