import React, { useState } from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';
import { ActiveSeasonCard } from '../components/ui/ActiveSeasonCard';
import { getConfig } from '../config/environment';
import { createActiveSeasonProcessor } from '../service/active-season-processors/ActiveSeasonProcessorFactory';
import { getClockTimeInEpochSeconds } from '../utils/DateUtils';

const getRenderableActiveSeasons = (activeSeasons: ReturnType<typeof useAuth>['activeSeasons']) => {
  const config = getConfig();
  const dataSourceList = config.active_seasons_data_source as typeof config.active_seasons_data_source | undefined;

  if (!dataSourceList || dataSourceList.length === 0) {
    console.error('Configuration error: active_seasons_data_source is missing from the environment config.');
    return [];
  }

  const now = getClockTimeInEpochSeconds();

  return activeSeasons.flatMap((season) => {
    const dataSource = dataSourceList.find(
      (candidate) => candidate.league === season.league && candidate.season === season.season
    );

    if (!dataSource) {
      console.error(`Data source not found for league "${season.league}" and season "${season.season}".`);
      return [];
    }

    const isWithinRatingWindow = now >= dataSource.registrations_start_date && now <= dataSource.ratings_end_date;
    return isWithinRatingWindow ? [{ season, dataSource }] : [];
  });
};

export const Kudos: React.FC = () => {
  const { activeSeasons } = useAuth();
  const renderableActiveSeasons = getRenderableActiveSeasons(activeSeasons);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const displayedExpandedIndex = expandedIndex ?? (renderableActiveSeasons.length === 1 ? 0 : -1);

  return (
    <ProtectedRoute>
      <MobileLayout>
        <PageContainer title="Matches & Kudos">
          <div className="space-y-4 sm:space-y-6">
            {renderableActiveSeasons.length > 0 ? (
              <div className="space-y-2" data-testid="active-seasons-list">
                <p>
                After every match, rate your experience!<br/>Award the opposition extra kudos for fair play &amp; positive behaviour.<br/><br/>
                </p>
                {renderableActiveSeasons.map(({ season, dataSource }, index) => {
                  try {
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
                        isExpanded={displayedExpandedIndex === index}
                        onToggle={() => { setExpandedIndex(displayedExpandedIndex === index ? -1 : index); }}
                      />
                    );
                  } catch (err) {
                    console.error('❌ Error rendering active season card:', err);
                  }
                })}
              </div>
            ) : (
              <div className="pt-6 sm:pt-8">
                <p className="text-base sm:text-lg leading-relaxed">
                  ⚠️ You are not currently registered to a league, a season, and a team.
                </p>
                <p className="text-base sm:text-lg leading-relaxed pt-4">
                Check your Inbox or Spam folder for the new season invite, or contact us.
                </p>
              </div>
            )}
          </div>
        </PageContainer>
      </MobileLayout>
    </ProtectedRoute>
  );
};
