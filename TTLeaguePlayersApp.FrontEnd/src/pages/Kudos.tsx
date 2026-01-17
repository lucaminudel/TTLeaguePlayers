import React, { useState, useEffect } from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';
import { ActiveSeasonCard } from '../components/ui/ActiveSeasonCard';
import { getConfig } from '../config/environment';
import { createActiveSeasonProcessor } from '../service/active-season-processors/ActiveSeasonProcessorFactory';
import { getClockTimeInEpochSeconds } from '../utils/DateUtils';

export const Kudos: React.FC = () => {
  const { activeSeasons } = useAuth();
  const [expandedIndex, setExpandedIndex] = useState<number>(activeSeasons.length === 1 ? 0 : -1);

  useEffect(() => {
    if (activeSeasons.length === 1) {
      setExpandedIndex(0);
    }
  }, [activeSeasons.length]);

  const hasActiveSeasons = activeSeasons.length > 0;

  return (
    <ProtectedRoute>
      <MobileLayout>
        <PageContainer title="Fair play Kudos">
          <div className="space-y-4 sm:space-y-6">
            <p>
              Award kudos to recognize fair play and positive behaviour in table tennis.
            </p>
            {hasActiveSeasons ? (
              <div className="space-y-2" data-testid="active-seasons-list">
                <p>
                  Celebrate sportsmanship and build a community that values integrity and respect.
                </p>
                {activeSeasons.map((season, index) => {
                  try {
                    const config = getConfig();
                    // Runtime check: config might be loaded from external JSON and could be incomplete
                    // TypeScript knows this is always defined, but we check at runtime for safety
                    const dataSourceList = config.active_seasons_data_source as typeof config.active_seasons_data_source | undefined;
                    if (!dataSourceList || dataSourceList.length === 0) {
                      throw new Error('Configuration error: active_seasons_data_source is missing from the environment config.');
                    }
                    const dataSource = dataSourceList.find(
                      (ds) => ds.league === season.league && ds.season === season.season
                    );

                    if (!dataSource) {
                      throw new Error(`Data source not found for league "${season.league}" and season "${season.season}".`);
                    }

                    const now = getClockTimeInEpochSeconds();
                    const startDate = dataSource.registrations_start_date;
                    const endDate = dataSource.ratings_end_date;

                    if (now < startDate || now > endDate) {
                      return null;
                    }

                    const avoidCORS = true;
                    const processor = createActiveSeasonProcessor(
                      dataSource.custom_processor,
                      dataSource,
                      season.team_division,
                      season.team_name,
                      avoidCORS
                    );

                    return (
                      <ActiveSeasonCard
                        key={`${season.league}-${season.season}-${season.team_name}`}
                        season={season}
                        processor={processor}
                        isExpanded={expandedIndex === index}
                        onToggle={() => { setExpandedIndex(expandedIndex === index ? -1 : index); }}
                      />
                    );
                  } catch (err) {
                    console.error('❌ Error rendering active season card:', err);
                    //throw err;
                  }
                })}
              </div>
            ) : (
              <div className="pt-6 sm:pt-8">
                <p className="text-base sm:text-lg leading-relaxed">
                  ⚠️ You are not currently registered to a league, a season, and a team.
                </p>
                <p className="text-base sm:text-lg leading-relaxed pt-4">
                  👉 Open again your invite link to complete this second part of the registration and then come back here.
                </p>
                <p className="text-base sm:text-lg leading-relaxed pt-4">
                  ❌ Otherwise ask your captain to send you an invite (this feature that allow team captains to invite other team members will arrive soon).
                </p>
              </div>
            )}
            {/* TODO: Add kudos functionality - form to award kudos, leaderboard display, etc. */}
          </div>
        </PageContainer>
      </MobileLayout>
    </ProtectedRoute>
  );
};
