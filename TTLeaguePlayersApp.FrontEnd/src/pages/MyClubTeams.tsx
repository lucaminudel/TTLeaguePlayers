import React, { useMemo, useState } from 'react';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ManagedClubsCard } from '../components/ui/ManagedClubsCard';
import { ClubTeamsList } from '../components/ui/ClubTeamsList';
import { useAuth } from '../hooks/useAuth';
import { getConfig } from '../config/environment';
import { createManagedClubProcessor } from '../service/active-season-processors/ManagedClubProcessorFactory';
import { createManagedClubKey, selectActiveManagedClubs } from '../utils/clubUtils';
import { getClockTimeInEpochSeconds } from '../utils/DateUtils';

export const MyClubTeams: React.FC = () => {
    const { managedClubs: allManagedClubs } = useAuth();
    const config = getConfig();
    const nowEpoch = getClockTimeInEpochSeconds();

    // Memoised because the result feeds ManagedClubsCard, whose duplicate-label check keys on the
    // array identity: a fresh array on every render would re-run it on every render.
    const selection = useMemo(
        () => selectActiveManagedClubs(allManagedClubs, config.active_seasons_data_source, nowEpoch),
        [allManagedClubs, config, nowEpoch]
    );

    const activeManagedClubs = selection.active;
    const clubsForCard = useMemo(() => activeManagedClubs.map(({ club }) => club), [activeManagedClubs]);

    const [selectedClubKey, setSelectedClubKey] = useState<string | null>(null);

    const selected = activeManagedClubs.find(
        ({ club }) => createManagedClubKey(club) === selectedClubKey
    ) ?? null;

    // Rebuilt only when the selection changes. ClubTeamsList refetches whenever the processor
    // identity changes, so a fresh instance on every render would refetch on every render.
    const processor = useMemo(() => {
        if (!selected) return null;
        return createManagedClubProcessor(
            selected.dataSource.custom_club_processor,
            selected.dataSource,
            selected.club.club_name,
            selected.club.club_location,
            // MANDATORY. The default is false, which sends the club-page scrape straight into a CORS
            // failure and renders the list blank.
            /* avoidCORS */ true
        );
    }, [selected]);

    return (
        <ProtectedRoute>
            <MobileLayout>
                <PageContainer title="My Club Teams">
                    <div className="space-y-6 sm:space-y-8">
                        <p>
                            See which of your club&apos;s teams are registered with the app, and which still
                            need a captain invite.
                        </p>

                        {/* Two distinct empty states. The menu entry is gated on the RAW Cognito clubs,
                            so "you are not a club manager" is the one message this page's visitors can
                            never deserve — unlike PromoteMyClub, which shows it for both cases. */}
                        {allManagedClubs.length === 0 ? (
                            <div className="rounded-lg border border-gray-600 bg-primary p-4" data-testid="no-managed-clubs">
                                <p className="text-base sm:text-lg leading-relaxed">
                                    ⚠️ You are not currently registered as a club manager.
                                </p>
                                <p className="mt-2 text-sm text-secondary-text">
                                    Ask the league team for manager access so you can see your club&apos;s teams here
                                </p>
                            </div>
                        ) : clubsForCard.length === 0 ? (
                            <div className="rounded-lg border border-gray-600 bg-primary p-4" data-testid="no-active-season">
                                <p className="text-base sm:text-lg leading-relaxed">
                                    ⚠️ None of your clubs has an active season right now.
                                </p>
                            </div>
                        ) : (
                            <>
                                <ManagedClubsCard
                                    managedClubs={clubsForCard}
                                    selectedClubKey={selectedClubKey}
                                    onSelectClub={setSelectedClubKey}
                                    effectiveClubName={selected?.club.club_name}
                                    groupByLocation={false}
                                />

                                {selected && processor ? (
                                    <div className="space-y-4">
                                        {/* The season appears nowhere else on screen; the card's heading
                                            already carries the club name, so it is not repeated here. */}
                                        <h3 className="text-lg font-semibold" data-testid="league-season-header">
                                            {selected.club.league} {selected.club.season}
                                        </h3>

                                        <ClubTeamsList
                                            processor={processor}
                                            league={selected.club.league}
                                            season={selected.club.season}
                                            clubName={selected.club.club_name}
                                            clubLocation={selected.club.club_location}
                                        />
                                    </div>
                                ) : null}
                            </>
                        )}
                    </div>
                </PageContainer>
            </MobileLayout>
        </ProtectedRoute>
    );
};
