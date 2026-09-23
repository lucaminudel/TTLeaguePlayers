import React, { useMemo, useState } from 'react';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { TeamPlayersCard } from '../components/ui/TeamPlayersCard';
import type { ActiveSeason } from '../contexts/AuthContextDefinition';
import { useAuth } from '../hooks/useAuth';
import { getConfig } from '../config/environment';
import { createActiveSeasonProcessor } from '../service/active-season-processors/ActiveSeasonProcessorFactory';
import { selectCaptainSeasons } from '../utils/activeSeasonUtils';
import { getClockTimeInEpochSeconds } from '../utils/DateUtils';

/**
 * Which card the captain has open: not chosen yet (the default applies), deliberately nothing, or one card by key.
 */
type OpenCardChoice = { chosen: false } | { chosen: true; key: string | null };

/** Identifies a card across list changes: a captaincy is a league, a season, a team and a division. */
const cardKeyOf = (season: ActiveSeason): string =>
    `${season.league}-${season.season}-${season.team_name}-${season.team_division}`;

export const InviteTeamMembers: React.FC = () => {
    const { activeSeasons, isCaptain } = useAuth();
    const config = getConfig();
    const nowEpoch = getClockTimeInEpochSeconds();

    const captainSeasons = useMemo(
        () => selectCaptainSeasons(activeSeasons, config.active_seasons_data_source, nowEpoch),
        [activeSeasons, config, nowEpoch]
    );

    const processors = useMemo(
        () => captainSeasons.map(({ season, dataSource }) => createActiveSeasonProcessor(
            dataSource.custom_processor,
            dataSource,
            season.team_division,
            season.team_name,
            // MANDATORY. The default is false, which sends the league-site scrape straight into a
            // CORS failure and leaves the card body empty.
            /* avoidCORS */ true
        )),
        [captainSeasons]
    );

    // Which card is open, remembered BY THE CARD, not by its position in the list.
    //
    const [openCard, setOpenCard] = useState<OpenCardChoice>({ chosen: false });

    const cardKeys = captainSeasons.map(({ season }) => cardKeyOf(season));
    // A captain with one team gets it open; with several, all closed until they choose one.
    const defaultKey = cardKeys.length === 1 ? cardKeys[0] : null;

    const expandedKey =
        // Untouched: the default applies, including when it arrives late with the claims.
        !openCard.chosen ? defaultKey
            // They closed everything, and it stays closed.
            : openCard.key === null ? null
                // The card they opened is still in the list.
                : cardKeys.includes(openCard.key) ? openCard.key
                    // It is gone - the captaincy ended - so fall back to the default.
                    : defaultKey;

    return (
        <ProtectedRoute>
            <MobileLayout>
                <PageContainer title="Invite Team Members">
                    <div className="space-y-6 sm:space-y-8">
                        <p>
                            See which players of your team are registered with the app, and invite the
                            ones who are not.
                        </p>

                        {/* Two distinct empty states. "You are not a captain" is about the ROLE and is
                            permanent until someone invites them as one; "no active season" is about the
                            CLOCK and fixes itself when the next season opens. The menu entry is gated on
                            isCaptain, so only a URL visitor sees the first one. */}
                        {!isCaptain ? (
                            <div className="rounded-lg border border-gray-600 bg-primary p-4" data-testid="no-captain-season">
                                <p className="text-base sm:text-lg leading-relaxed">
                                    ⚠️ You are not currently registered as a team captain.
                                </p>
                                <p className="mt-2 text-sm text-secondary-text">
                                    Ask the league team for a captain invite so you can invite your team members here
                                </p>
                            </div>
                        ) : captainSeasons.length === 0 ? (
                            <div className="rounded-lg border border-gray-600 bg-primary p-4" data-testid="no-active-season">
                                <p className="text-base sm:text-lg leading-relaxed">
                                    ⚠️ None of the teams you captain has an active season right now.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2" data-testid="captain-seasons-list">
                                {captainSeasons.map(({ season }, index) => {
                                    const key = cardKeyOf(season);

                                    return (
                                        <TeamPlayersCard
                                            key={key}
                                            season={season}
                                            processor={processors[index]}
                                            isExpanded={expandedKey === key}
                                            onToggle={() => {
                                                setOpenCard({ chosen: true, key: expandedKey === key ? null : key });
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </PageContainer>
            </MobileLayout>
        </ProtectedRoute>
    );
};
