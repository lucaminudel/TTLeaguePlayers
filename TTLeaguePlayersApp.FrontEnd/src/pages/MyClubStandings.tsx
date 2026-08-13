import React, { useMemo, useState } from 'react';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ManagedClubsCard } from '../components/ui/ManagedClubsCard';
import { ClubStandingsList } from '../components/ui/ClubStandingsList';
import { useAuth } from '../hooks/useAuth';
import { getConfig } from '../config/environment';
import { createManagedClubProcessor } from '../service/active-season-processors/ManagedClubProcessorFactory';
import { createManagedClubKey, selectActiveManagedClubs } from '../utils/clubUtils';
import { getClockTimeInEpochSeconds } from '../utils/DateUtils';

export const MyClubStandings: React.FC = () => {
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

    // Rebuilt only when the selection changes. ClubStandingsList refetches whenever the processor
    // identity changes, so a fresh instance on every render would refetch on every render.
    const processor = useMemo(() => {
        if (!selected) return null;
        return createManagedClubProcessor(
            selected.dataSource.custom_club_processor,
            selected.dataSource,
            selected.club.club_name,
            selected.club.club_location,
            true
        );
    }, [selected]);

    return (
        <ProtectedRoute>
            <MobileLayout>
                <PageContainer title="My Club Standings">
                    <div className="space-y-6 sm:space-y-8">
                        <p>
                            See the matche tally of extra, standard and fewer kudos received by every team in your club.
                        </p>

                        {allManagedClubs.length === 0 ? (
                            <div className="rounded-lg border border-gray-600 bg-primary p-4" data-testid="no-managed-clubs">
                                <p className="text-base sm:text-lg leading-relaxed">
                                    ⚠️ You are not currently registered as a club manager.
                                </p>
                                <p className="mt-2 text-sm text-secondary-text">
                                    Ask the league team for manager access so you can see your club&apos;s standings here
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
                                        <h3 className="text-lg font-semibold" data-testid="league-season-header">
                                            {selected.club.league} {selected.club.season}
                                        </h3>

                                        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-secondary-text">
                                            <div className="flex-1 min-w-0">Match Tally</div>
                                            <div className="w-10 shrink-0 text-center">Ext</div>
                                            <div className="w-10 shrink-0 text-center">Std</div>
                                            <div className="w-10 shrink-0 text-center">Few</div>
                                        </div>

                                        <ClubStandingsList
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
