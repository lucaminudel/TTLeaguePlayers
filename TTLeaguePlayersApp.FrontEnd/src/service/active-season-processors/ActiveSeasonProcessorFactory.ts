import type { ActiveSeasonDataSource } from '../../config/environment';
import type { ActiveSeasonProcessor } from './ActiveSeasonProcessor';
import { CLTTLActiveSeason2025Processor } from './CLTTLActiveSeason2025Processor';
//import { DummyActiveSeasonProcessor } from './DummyActiveSeasonProcessor'; // add here additiona ActiveSeasonProcessor

type ActiveSeasonProcessorConstructor = new (
    dataSource: ActiveSeasonDataSource,
    division: string,
    team: string,
    avoidCORS: boolean
) => ActiveSeasonProcessor;

const processorRegistry: Record<string, ActiveSeasonProcessorConstructor> = {
    'CLTTLActiveSeason2025Processor': CLTTLActiveSeason2025Processor,
    //    'DummyActiveSeasonProcessor': DummyActiveSeasonProcessor, // add here additiona ActiveSeasonProcessor
};

/**
 * Instantiates the correct processor based on the processor name.
 * @throws Error if the processor name is not recognized.
 */
export function createActiveSeasonProcessor(
    processorName: string,
    dataSource: ActiveSeasonDataSource,
    division: string,
    team: string,
    avoidCORS = false
): ActiveSeasonProcessor {
    const ActiveSeasonProcessorClass = processorRegistry[processorName] as ActiveSeasonProcessorConstructor | undefined;
    if (!ActiveSeasonProcessorClass) {
        throw new Error(`Active Season Processor "${processorName}" not present or registered.`);
    }
    return new ActiveSeasonProcessorClass(dataSource, division, team, avoidCORS);
}
