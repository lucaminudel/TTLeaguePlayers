export class TT365ParsingError extends Error {
    readonly timestamp = new Date().toISOString();
    readonly source: { Class: string; Method: string };
    diagnosticContext?: Record<string, unknown>;

    constructor(message: string, parser: string, method: string, cause?: unknown) {
        super(message, { cause });
        this.name = 'TT365ParsingError';
        this.source = { Class: parser, Method: method };
    }
}

