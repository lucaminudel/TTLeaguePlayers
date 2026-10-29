export interface TT365HttpDetails {
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
}

export class PageFetcherError extends Error {
    readonly details: TT365HttpDetails;
    readonly timestamp = new Date().toISOString();
    constructor(message: string, details: TT365HttpDetails = {}, cause?: unknown) {
        super(message, { cause });
        this.name = 'PageFetcherError';
        this.details = details;
    }
}
