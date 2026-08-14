import React, { useEffect, useState } from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { getCachedAllClubsWithTournaments } from '../api/cachedClubsApi';
import type { ClubWithTournaments, TournamentInfo } from '../api/clubsApi';
import { formatTournamentDateRange } from '../utils/DateUtils';
import { toUserFriendlyApiError } from '../utils/apiErrorUtils';

import { SocialIcon } from '../components/common/SocialIcon';
import { faFacebookSquare, faInstagram, faYoutube } from '@fortawesome/free-brands-svg-icons';

interface ListedTournament extends TournamentInfo {
    location: string;
    club_name: string;
}

interface LocationGroup<T> {
    location: string;
    entries: T[];
}

/**
 * Groups already-ordered entries by location, preserving the order the API returned them in
 * (location, then club name, then tournament start date).
 */
function groupByLocation<T>(entries: T[], locationOf: (entry: T) => string): LocationGroup<T>[] {
    const groups: LocationGroup<T>[] = [];
    const groupsByLocation = new Map<string, LocationGroup<T>>();

    for (const entry of entries) {
        const location = locationOf(entry);
        let group = groupsByLocation.get(location);
        if (!group) {
            group = { location, entries: [] };
            groupsByLocation.set(location, group);
            groups.push(group);
        }
        group.entries.push(entry);
    }

    return groups;
}

/** Every active tournament across all clubs, each tagged with the club it belongs to. */
function toListedTournaments(clubs: ClubWithTournaments[]): ListedTournament[] {
    return clubs.flatMap((club) =>
        club.tournaments.map((tournament) => ({
            ...tournament,
            location: club.location,
            club_name: club.club_name,
        }))
    );
}

/**
 * Only clubs that have submitted a promotion profile are listed: a club row is a link to its
 * homepage, so a club without one has nothing to link to. Its tournaments are still listed in
 * the Tournaments section.
 */
function toPromotedClubs(clubs: ClubWithTournaments[]): ClubWithTournaments[] {
    return clubs.filter((club) => Boolean(club.homepage));
}

const SectionHeader: React.FC<{ title: string; testId: string }> = ({ title, testId }) => (
    <div className="bg-gray-800 rounded-lg py-3 px-4" data-testid={testId}>
        <h3 className="text-xs font-bold text-main-text uppercase tracking-wide">{title}</h3>
    </div>
);

const SocialLinks: React.FC<{
    instagram?: string | null;
    facebook?: string | null;
    youtube?: string | null;
    testIdPrefix: string;
}> = ({ instagram, facebook, youtube, testIdPrefix }) => (
    <div className="flex gap-2 shrink-0">
        {instagram && (
            <a
                href={instagram}
                target="_blank"
                rel="noreferrer"
                className="text-pink-600 hover:text-pink-500"
                data-testid={`${testIdPrefix}-instagram-link`}
            >
                <SocialIcon icon={faInstagram} />
            </a>
        )}
        {facebook && (
            <a
                href={facebook}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-500"
                data-testid={`${testIdPrefix}-facebook-link`}
            >
                <SocialIcon icon={faFacebookSquare} />
            </a>
        )}
        {youtube && (
            <a
                href={youtube}
                target="_blank"
                rel="noreferrer"
                className="text-red-600 hover:text-red-500"
                data-testid={`${testIdPrefix}-youtube-link`}
            >
                <SocialIcon icon={faYoutube} />
            </a>
        )}
    </div>
);

export const ClubsAndTournaments: React.FC = () => {
    const [clubs, setClubs] = useState<ClubWithTournaments[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        const loadClubsAndTournaments = async () => {
            setIsLoading(true);
            setLoadError(null);
            try {
                const result = await getCachedAllClubsWithTournaments((freshData) => { setClubs(freshData); });
                setClubs(result);
            } catch (err) {
                let userMessage = toUserFriendlyApiError(err, 'The clubs and tournaments could not be loaded. Please try again.');
                if (err && typeof err === 'object' && 'errors' in err) {
                    const errObj = err as { errors?: string[] };
                    if (Array.isArray(errObj.errors) && errObj.errors.length > 0) {
                        userMessage += " ( ";
                        userMessage += errObj.errors.join(', ');
                        userMessage += " )";
                    }
                }
                setLoadError(userMessage);
            } finally {
                setIsLoading(false);
            }
        };

        void loadClubsAndTournaments();
    }, []);

    const tournamentGroups = groupByLocation(toListedTournaments(clubs), (tournament) => tournament.location);
    const clubGroups = groupByLocation(toPromotedClubs(clubs), (club) => club.location);

    return (
        <MobileLayout>
            <PageContainer title="Clubs & Tournaments">
                <div className="space-y-6 sm:space-y-8">
                    <p>
                        Never miss a tournament, find clubs
                        with teams competing in local leagues
                    </p>

                    {isLoading ? (
                        <p className="text-sm text-secondary-text">Loading clubs and tournaments…</p>
                    ) : loadError ? (
                        <ErrorMessage testId="main-error">{loadError}</ErrorMessage>
                    ) : (
                        <>
                            <div className="space-y-4" data-testid="tournaments-section">
                                <SectionHeader title="Tournaments" testId="tournaments-header" />

                                {tournamentGroups.length === 0 ? (
                                    <p className="text-sm text-secondary-text">No upcoming tournaments found.</p>
                                ) : (
                                    tournamentGroups.map((group) => (
                                        <div key={group.location} className="text-left" data-testid="tournaments-location-group">
                                            <p className="text-base text-main-text" data-testid="tournaments-location">{group.location}</p>
                                            <div className="divide-y divide-gray-600">
                                                {group.entries.map((tournament) => (
                                                    <div
                                                        key={`${tournament.location}-${tournament.club_name}-${tournament.tournament_name}`}
                                                        className="flex justify-between items-center gap-2 py-2 pl-4"
                                                        data-testid="tournament-row"
                                                    >
                                                        <a
                                                            href={tournament.tournament_info}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-blue-500 hover:text-blue-400 underline break-words text-base font-medium"
                                                            data-testid="tournament-link"
                                                        >
                                                            {tournament.tournament_name}, {formatTournamentDateRange(tournament.start_date, tournament.end_date)}
                                                        </a>
                                                        <SocialLinks
                                                            instagram={tournament.instagram}
                                                            facebook={tournament.facebook}
                                                            testIdPrefix="tournament"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="space-y-4" data-testid="clubs-section">
                                <SectionHeader title="Clubs" testId="clubs-header" />

                                {clubGroups.length === 0 ? (
                                    <p className="text-sm text-secondary-text">No clubs found.</p>
                                ) : (
                                    clubGroups.map((group) => (
                                        <div key={group.location} className="text-left" data-testid="clubs-location-group">
                                            <p className="text-base text-main-text" data-testid="clubs-location">{group.location}</p>
                                            <div className="divide-y divide-gray-600">
                                                {group.entries.map((club) => (
                                                    <div
                                                        key={`${club.location}-${club.club_name}`}
                                                        className="flex justify-between items-center gap-2 py-2 pl-4"
                                                        data-testid="club-row"
                                                    >
                                                        <a
                                                            href={club.homepage ?? undefined}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-blue-500 hover:text-blue-400 underline break-words text-base font-medium"
                                                            data-testid="club-link"
                                                        >
                                                            {club.club_name}
                                                        </a>
                                                        <SocialLinks
                                                            instagram={club.instagram}
                                                            facebook={club.facebook}
                                                            youtube={club.youtube}
                                                            testIdPrefix="club"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </PageContainer>
        </MobileLayout>
    );
};
