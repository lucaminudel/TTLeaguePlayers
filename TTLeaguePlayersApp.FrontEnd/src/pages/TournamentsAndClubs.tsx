import React from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';

export const TournamentsAndClubs: React.FC = () => {
    return (
        <MobileLayout>
            <PageContainer title="Tournaments & Clubs">
                <div className="space-y-6 sm:space-y-8">
                    <p>
                        Never miss a tournament, stay informed on new venues and clubs
                    </p>

                    <div className="space-y-4">
                        <div className="bg-primary border border-gray-600 rounded-lg p-4 text-left">
                            <h3 className="text-lg font-bold text-main-text mb-2">🏓 Tournaments</h3>
                            <p className="text-sm text-secondary-text">
                                Browse upcoming tournaments, find one near you, and sign up to compete. Tournament organisers will be able to post their events here.
                            </p>
                        </div>

                        <div className="bg-primary border border-gray-600 rounded-lg p-4 text-left">
                            <h3 className="text-lg font-bold text-main-text mb-2">🏠 Clubs & Venues</h3>
                            <p className="text-sm text-secondary-text">
                                Discover new clubs and venues. Club owners will be able to share details about their facilities, opening times, and how to join.
                            </p>
                        </div>
                    </div>

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
