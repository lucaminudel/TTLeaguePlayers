import React, { useEffect, useState } from 'react';
import type { ActiveSeason } from '../../contexts/AuthContextDefinition';
import type { ActiveSeasonProcessor } from '../../service/active-season-processors/ActiveSeasonProcessor';
import type { Fixture } from '../../service/active-season-processors/clttl-2025/CLTTLActiveSeason2025PagesParser';
import { getClockTime, formatFixtureDate, isSameDay } from '../../utils/DateUtils';

interface ActiveSeasonCardProps {
    season: ActiveSeason;
    processor: ActiveSeasonProcessor;
    isExpanded: boolean;
    onToggle: () => void;
}

export const ActiveSeasonCard: React.FC<ActiveSeasonCardProps> = ({ season, processor, isExpanded, onToggle }) => {
    const [prevMatch, setPrevMatch] = useState<Fixture | null>(null);
    const [nextMatch, setNextMatch] = useState<Fixture | null>(null);
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
                        setNextMatch(null);
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

    const renderFixture = (fixture: Fixture | null, testId: string) => {
        if (!fixture) return <p className="text-base sm:text-lg" data-testid={testId}>No fixture found, retry later or tomorrow</p>;

        const isHome = fixture.homeTeam === season.team_name;
        const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;
        const dateStr = formatFixtureDate(fixture.startDateTime);

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
    const prevMatchHeader = prevMatch && isSameDay(prevMatch.startDateTime, currentClockTime)
        ? "Today's Match"
        : "Previous Match";
    const nextMatchHeader = nextMatch && isSameDay(nextMatch.startDateTime, currentClockTime)
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
                                <div className="h-4"></div>
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
