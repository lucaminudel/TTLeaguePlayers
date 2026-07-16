import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';
import { getConfig } from '../config/environment';
import { getClockTimeInEpochSeconds } from '../utils/DateUtils';


export const PromoteMyTournaments: React.FC = () => {
    const { managedClubs: allManagedClubs } = useAuth();
    const config = getConfig();
    const nowEpoch = getClockTimeInEpochSeconds();

    const managedClubs = allManagedClubs.filter(club => {
        try {
            const dataSourceList = config.active_seasons_data_source as typeof config.active_seasons_data_source | undefined;
            if (!dataSourceList || dataSourceList.length === 0) {
                throw new Error('Configuration error: active_seasons_data_source is missing from the environment config.');
            }

            const matchingConfig = dataSourceList.find(
                source => source.league === club.league && source.season === club.season
            );

            if (!matchingConfig) {
                throw new Error(`Data source not found for league "${club.league}" and season "${club.season}".`);
            }

            const startEpoch = matchingConfig.registrations_start_date;
            const endDate = new Date(matchingConfig.ratings_end_date * 1000);
            const endOfYear = new Date(Date.UTC(endDate.getUTCFullYear(), 11, 31, 23, 59, 59));
            const endOfYearEpoch = Math.floor(endOfYear.getTime() / 1000);

            return nowEpoch >= startEpoch && nowEpoch <= endOfYearEpoch;
        } catch (err) {
            console.info('❌ Page event log processing managed club:', err);
            //throw err;
            return false;
        }
    });



    return (
        <ProtectedRoute>
            <MobileLayout>
                <PageContainer 
                    title="Promote My Tournament"
                    footer={
                        managedClubs.length > 0  ? (
                            <div className="space-y-3 pt-6">
                            </div>
                        ) : null
                    }
                >
                    <div className="space-y-6 sm:space-y-8">
                        <p>
                            Promote the tournaments your club organises.
                        </p>

                        {managedClubs.length === 0 ? (
                            <div className="rounded-lg border border-gray-600 bg-primary p-4">
                                <p className="text-base sm:text-lg leading-relaxed">
                                    ⚠️ You are not currently registered as a club manager.
                                </p>
                                <p className="mt-2 text-sm text-secondary-text">
                                    Ask the league team for manager access so you can promote your club here.
                                </p>
                            </div>
                        ) : ( false )}
                    </div>
                </PageContainer>                
            </MobileLayout>
        </ProtectedRoute>
    );
};
