import { readWithUpdates } from '../../utils/CacheUtils';
import React, { useEffect, useRef, useState } from 'react';
import type { ManagedClubProcessor } from '../../service/league-season-processors/ManagedClubProcessor';
import type { ClubKudosStandingsEntry } from '../../api/kudosApi';
import { getCachedClubKudosStandings } from '../../api/cachedKudosApi';
import { ErrorMessage } from '../common/ErrorMessage';

interface ClubStandingsListProps {
    /** Injected rather than built here, following ClubTeamsList, so tests can stub it. */
    processor: ManagedClubProcessor;
    league: string;
    season: string;
    clubName: string;
    clubLocation: string;
    /** Fired once per successful load, after the fetched teams are set. Held in a ref internally
     * so passing a fresh inline arrow on every render cannot trigger a refetch loop. */
    onStandingsLoaded?: () => void;
}

// Same palette as the Kudos standings pills, so a count reads the same way across the app.
// Each pill carries its own padding: Fewer gives up 2px on every side to its border, so all
// three come out the same size on a row.
const EXTRA_PILL = 'px-2 py-1 bg-[#004d27] text-white';
const STANDARD_PILL = 'px-2 py-1 bg-[#85a3c2] text-white';
const FEWER_PILL = 'px-1.5 py-0.5 bg-transparent border-2 border-[#85a3c2] text-white';

/**
 * A zero tally shows nothing at all: a row of empty pills reads as noise, and what a manager
 * looks for is where the counts ARE. The empty slot keeps its width so the columns stay lined
 * up with the Ext/Std/Few headings above them.
 */
const CountPill: React.FC<{ count: number; pill: string; testId: string }> = ({ count, pill, testId }) => {
    if (count === 0) {
        return <div className="w-10 shrink-0" data-testid={testId} />;
    }

    return (
        <div className={`w-10 shrink-0 rounded text-xs font-bold text-center ${pill}`} data-testid={testId}>
            {count}
        </div>
    );
};

export const ClubStandingsList: React.FC<ClubStandingsListProps> = ({
    processor,
    league,
    season,
    clubName,
    clubLocation,
    onStandingsLoaded,
}) => {
    const [teams, setTeams] = useState<ClubKudosStandingsEntry[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasFailed, setHasFailed] = useState(false);

    const onStandingsLoadedRef = useRef(onStandingsLoaded);
    useEffect(() => { onStandingsLoadedRef.current = onStandingsLoaded; }, [onStandingsLoaded]);

    useEffect(() => {
        let cancelled = false;
        let listVersion = 0;

        const loadStatuses = async (clubTeams: Awaited<ReturnType<ManagedClubProcessor['getClubTeams']>>) => {
            const version = ++listVersion;
            const isCurrent = () => !cancelled && version === listVersion;
            const selectedTeams = clubTeams.filter((team) => team.team_division !== '');
            try {
                if (selectedTeams.length === 0) {
                    if (isCurrent()) {
                        setTeams([]);
                        setHasFailed(false);
                    }
                    return;
                }
                await readWithUpdates<Awaited<ReturnType<typeof getCachedClubKudosStandings>>>(
                    (onUpdate) => getCachedClubKudosStandings({
                        league,
                        season,
                        club_name: clubName,
                        club_location: clubLocation,
                        teams: selectedTeams,
                    }, onUpdate),
                    (response) => {
                        setTeams(response.teams);
                        setHasFailed(false);
                        onStandingsLoadedRef.current?.();
                    },
                    isCurrent
                );
            } catch (error) {
                console.error('❌ Page event log loading club standings:', error);
                if (isCurrent()) setHasFailed(true);
            } finally {
                if (isCurrent()) setIsLoading(false);
            }
        };

        const load = async () => {
            setIsLoading(true);
            setHasFailed(false);
            setTeams(null);
            try {
                await readWithUpdates(
                    (onUpdate) => processor.getClubTeams(onUpdate),
                    (clubTeams: Awaited<ReturnType<ManagedClubProcessor['getClubTeams']>>) => { void loadStatuses(clubTeams); },
                    () => !cancelled
                );
            } catch (error) {
                console.error('❌ Page event log loading club standings:', error);
                if (!cancelled) {
                    setHasFailed(true);
                    setIsLoading(false);
                }
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [processor, league, season, clubName, clubLocation]);

    if (isLoading) {
        return <p className="text-sm text-secondary-text" data-testid="club-standings-loading">Loading teams…</p>;
    }

    if (hasFailed) {
        // WORDING IS LOAD-BEARING: a club with no club_teams entry in the config (BCS, FLICK) throws
        // "Club ... not found in data source." from the fetcher and lands in this same branch. Saying
        // "this club has no teams" here would state something false about the club.
        return (
            <ErrorMessage testId="club-standings-error">
                The standings for this club could not be loaded. Please retry again later. If the problem persists, contact us.
            </ErrorMessage>
        );
    }

    if (teams === null) {
        return null;
    }

    if (teams.length === 0) {
        return <p className="text-sm text-secondary-text">No teams found for this club.</p>;
    }

    return (
        <div className="divide-y divide-gray-600" data-testid="club-standings">
            {teams.map((team) => (
                <div
                    key={team.team_name}
                    className="flex items-center gap-2 py-3"
                    data-testid={`club-standing-row-${team.team_name}`}
                >
                    <div className="flex-1 min-w-0 text-sm font-bold text-main-text" data-testid="club-standing-name">
                        {team.team_name}
                    </div>

                    <CountPill count={team.positive_count} pill={EXTRA_PILL} testId="club-standing-positive" />
                    <CountPill count={team.neutral_count} pill={STANDARD_PILL} testId="club-standing-neutral" />
                    <CountPill count={team.negative_count} pill={FEWER_PILL} testId="club-standing-negative" />
                </div>
            ))}
        </div>
    );
};
