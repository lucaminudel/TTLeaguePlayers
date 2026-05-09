import React from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';

export const PromoteClubAndTournaments: React.FC = () => {
    return (
        <MobileLayout>
            <PageContainer title="Promote Club & Tournaments">
                <div className="space-y-6 sm:space-y-8">
                    <p>
                        Add your club to our directory to help players find your venue and join your community.
                    </p>
                    <div className="pt-4">
                        <p className="text-base sm:text-lg leading-relaxed text-action-accent font-semibold">
                            🚧 Coming Soon
                        </p>
                        <p className="text-sm text-secondary-text mt-2">
                            This feature is under consideration for future development. Stay tuned!
                        </p>
                    </div>
                </div>
            </PageContainer>
        </MobileLayout>
    );
};
