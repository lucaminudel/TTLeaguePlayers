import type { ActiveSeasonDataSource } from '../../config/environment';
import type { ManagedClubProcessor } from './ManagedClubProcessor';
import { CLTTLManagedClub2025Processor } from './CLTTLManagedClub2025Processor';

import { ManagedClubProcessorWithLocalStorageCache } from './ManagedClubProcessorWithLocalStorageCache';

//import { DummyManagedClubProcessor } from './DummyManagedClubProcessor'; // add here additiona ManagedClubProcessor

type ManagedClubProcessorConstructor = new (
    dataSource: ActiveSeasonDataSource,
    clubName: string,
    avoidCORS: boolean
) => ManagedClubProcessor;

const clubProcessorRegistry: Record<string, ManagedClubProcessorConstructor> = {
    'CLTTLManagedClub2025Processor': CLTTLManagedClub2025Processor,
    //    'DummyManagedClubProcessor': DummyManagedClubProcessor, // add here additiona ManagedClubProcessor
};

/**
 * Instantiates the correct club processor based on the processor name.
 * @throws Error if the processor name is not recognized.
 */
export function createManagedClubProcessor(
    processorName: string,
    dataSource: ActiveSeasonDataSource,
    clubName: string,
    avoidCORS = false
): ManagedClubProcessor {
    const ManagedClubProcessorClass = clubProcessorRegistry[processorName] as ManagedClubProcessorConstructor | undefined;
    if (!ManagedClubProcessorClass) {
        throw new Error(`Managed Club Processor "${processorName}" not present or registered.`);
    }

    const realProcessor = new ManagedClubProcessorClass(dataSource, clubName, avoidCORS);

    // Create a unique cache key. The club's teams do not vary by division or team, so this key
    // is deliberately distinct from the fixtures one.
    const uniqueKey = `cache_club_${dataSource.league}_${dataSource.season}_${clubName}`;

    return new ManagedClubProcessorWithLocalStorageCache(realProcessor, uniqueKey);
}
