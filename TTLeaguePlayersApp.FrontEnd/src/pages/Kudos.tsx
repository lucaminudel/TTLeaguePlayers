import React from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';

export const Kudos: React.FC = () => {
  const { activeSeasons } = useAuth();
  const hasActiveSeasons = activeSeasons.length > 0;

  return (
    <ProtectedRoute>
      <MobileLayout>
        <PageContainer title="Fair play Kudos">
          <div className="space-y-4 sm:space-y-6 px-4">
            <p>
              Award kudos to recognize fair play and positive behaviour in table tennis.
            </p>
            {hasActiveSeasons ? (
              <p>
                Celebrate sportsmanship and build a community that values integrity and respect.
              </p>
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
