
export class PageFetcherError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PageFetcherError';
    }
}
