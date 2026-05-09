import React from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';

export const ClubStandings: React.FC = () => {
    return (
        <MobileLayout>
            <PageContainer title="Club Standings">
                <div className="space-y-6 sm:space-y-8">
                    <p>
                        View and manage the Kudos standings for your club members.
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
