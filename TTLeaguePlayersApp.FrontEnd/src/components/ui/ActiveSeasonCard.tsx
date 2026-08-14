import React, { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActiveSeason } from '../../contexts/AuthContextDefinition';
import type { ActiveSeasonProcessor } from '../../service/active-season-processors/ActiveSeasonProcessor';
import type { Fixture } from '../../service/active-season-processors/clttl-2025/CLTTLActiveSeason2025PagesParser';
import { getClockTime, formatFixtureDateTime, isSameDay } from '../../utils/DateUtils';
import { Button } from '../common/Button';
import { useAuth } from '../../hooks/useAuth';

// Identifies the "Rate" info modal in local storage. Fixed for the life of the feature:
// changing it resurfaces the modal for everyone who had opted out.
const RATE_INFO_MODAL_GUID = '3732bda6-ce5f-407e-95d7-8f638cb333cc';

interface ActiveSeasonCardProps {
    season: ActiveSeason;
    processor: ActiveSeasonProcessor;
    isExpanded: boolean;
    onToggle: () => void;
}

export const ActiveSeasonCard: React.FC<ActiveSeasonCardProps> = ({ season, processor, isExpanded, onToggle }) => {
    const navigate = useNavigate();
    const { activeSeasons, userId } = useAuth();
    const [prevMatch, setPrevMatch] = useState<Fixture | null | -1>(null);
    const [nextMatch, setNextMatch] = useState<Fixture | null | -1>(null);
    const [isLoadingData, setIsLoadingData] = useState(false);
    // The fixture whose Rate button was clicked; non-null while the info modal is open.
    const [rateInfoModalFixture, setRateInfoModalFixture] = useState<Fixture | null>(null);
    const [dontShowRateInfoAgain, setDontShowRateInfoAgain] = useState(false);
    // One card is rendered per active season, so the ARIA ids must be unique per instance.
    const rateInfoModalId = useId();
    const rateInfoModalOkContainerRef = useRef<HTMLDivElement>(null);

    // Suppression is per user, not per browser: signing out does not clear local storage.
    const rateInfoModalStorageKey = userId ? `hide_modal_${RATE_INFO_MODAL_GUID}_${userId}` : null;

    useEffect(() => {
        if (rateInfoModalFixture) {
            rateInfoModalOkContainerRef.current?.querySelector('button')?.focus();
        }
    }, [rateInfoModalFixture]);

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

    const navigateToAwardKudos = (fixture: Fixture) => {
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

    // Handler for Rate button click: show the info modal first, unless this user opted out of it.
    const handleRateClick = (fixture: Fixture) => {
        const isSuppressed = rateInfoModalStorageKey !== null
            && localStorage.getItem(rateInfoModalStorageKey) === 'true';

        if (isSuppressed) {
            navigateToAwardKudos(fixture);
            return;
        }

        setDontShowRateInfoAgain(false);
        setRateInfoModalFixture(fixture);
    };

    // Handler for the info modal's OK button: persist the opt-out if ticked, then carry on.
    const handleRateInfoModalOk = () => {
        const fixture = rateInfoModalFixture;
        if (!fixture) return;

        // With no userId there is no key to scope the preference to, so nothing is written.
        if (dontShowRateInfoAgain && rateInfoModalStorageKey !== null) {
            try {
                localStorage.setItem(rateInfoModalStorageKey, 'true');
            } catch (error) {
                console.warn('Could not save modal preference:', error);
            }
        }

        setRateInfoModalFixture(null);
        navigateToAwardKudos(fixture);
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

            {rateInfoModalFixture && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={`${rateInfoModalId}-title`}
                        data-testid="rate-info-modal"
                        className="bg-primary-base border border-gray-600 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-6"
                    >
                        <h3 id={`${rateInfoModalId}-title`} className="text-xl font-bold text-main-text text-center">
                            Please be aware that:
                        </h3>

                        <div className="text-center space-y-2">
                            <p className="text-base sm:text-lg">
                                League officials are not responsible for managing disputes on Kudos awarded or received.
                                <br/><br/>
                            </p>
                            <p className="text-base sm:text-lg">
                                Match disputes must be directed as usual to the league officials.
                                <br/><br/>
                            </p>
                        </div>

                        <div className="flex items-center justify-center gap-3">
                            <input
                                type="checkbox"
                                id={`${rateInfoModalId}-dont-show-again`}
                                data-testid="rate-info-modal-dont-show-again"
                                checked={dontShowRateInfoAgain}
                                onChange={(e) => { setDontShowRateInfoAgain(e.target.checked); }}
                                className="w-5 h-5 accent-action-accent"
                            />
                            <label htmlFor={`${rateInfoModalId}-dont-show-again`} className="text-sm text-secondary-text">
                                Don&apos;t show this message again
                            </label>
                        </div>

                        <div className="flex justify-center" ref={rateInfoModalOkContainerRef}>
                            <Button
                                onClick={handleRateInfoModalOk}
                                data-testid="rate-info-modal-ok"
                            >
                                OK
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
