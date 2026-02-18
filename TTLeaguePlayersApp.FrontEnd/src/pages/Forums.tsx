import React from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ProtectedRoute } from '../components/common/ProtectedRoute';

export const Forums: React.FC = () => {
    return (
        <ProtectedRoute>
            <MobileLayout>
                <PageContainer title="Forums">
                    <div className="space-y-6 sm:space-y-8">
                        <p>
                            Stay connected, and discuss everything table tennis.
                        </p>

                        <div className="space-y-4">
                            <div className="bg-primary border border-gray-600 rounded-lg p-4 text-left">
                                <h3 className="text-lg font-bold text-main-text mb-2">💬 League Discussions</h3>
                                <p className="text-sm text-secondary-text">
                                    Find a team or a player. Talk about your league, matches, and anything related to the season.
                                </p>
                            </div>

                            <div className="bg-primary border border-gray-600 rounded-lg p-4 text-left">
                                <h3 className="text-lg font-bold text-main-text mb-2">🏓 Gear Talk</h3>
                                <p className="text-sm text-secondary-text">
                                    Discuss blades, rubbers, and equipment. Get recommendations and share reviews.
                                </p>
                            </div>

                            <div className="bg-primary border border-gray-600 rounded-lg p-4 text-left">
                                <h3 className="text-lg font-bold text-main-text mb-2">🗣️ General Chat</h3>
                                <p className="text-sm text-secondary-text">
                                    Social events, training tips, or just catching up with the community.
                                </p>
                            </div>
                        </div>

                        <div className="pt-1">
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
        </ProtectedRoute>
    );
};
