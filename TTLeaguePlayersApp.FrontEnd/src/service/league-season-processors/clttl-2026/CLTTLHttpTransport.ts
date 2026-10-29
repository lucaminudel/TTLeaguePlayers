import { decompress as decompressZstd } from 'fzstd';
import type { TT365HttpDetails } from './PageFetcherError';
import { PageFetcherError } from './PageFetcherError';

const ERROR_RESPONSE_BODY_CAPTURE_TIMEOUT_MS = 1_000;

export class CLTTLHttpTransport {
    private corsAnyWherePrefix: string;

    constructor(avoidCORS = false) {
        this.corsAnyWherePrefix = avoidCORS ? "https://go.x2u.in/proxy?email=contact_us@ttleagueplayers.uk&apiKey=307a1c8f&url=" : "";
    }

    public fetchText(url: string): Promise<string> {
        return this.fetchWithRetry(url);
    }

    private async fetchWithRetry(url: string, retries = 2, delay = 2000): Promise<string> {
        // The proxy takes the target as its own url= query parameter, so the target must be encoded:
        // sent raw, its first "&" ends that parameter and every later one (divisionName, vm, t) is lost.
        const target = this.corsAnyWherePrefix ? this.corsAnyWherePrefix + encodeURIComponent(url) : url;
        for (let i = 0; i <= retries; i++) {
            const http: TT365HttpDetails = { request: { method: 'GET', url: target, attempt: i + 1 } };
            try {
                const response = await fetch(target);
                const headers = (response as Partial<Response>).headers;
                http.response = { status: response.status, statusText: response.statusText,
                    headers: headers ? Object.fromEntries(headers.entries()) : undefined };
                if (!response.ok) {
                    try {
                        const body = await this.readErrorResponseText(response);
                        if (body !== undefined) http.response.body = body;
                    } catch { /* Keep the HTTP error. */ }
                    throw new Error('HTTP error! status: ' + String(response.status));
                }
                const text = await this.readResponseText(response);
                http.response.body = text;
                if (text.toLowerCase().includes("service unavailable")) {
                    throw new Error("Service unavailable");
                }
                return text;
            } catch (error) {
                if (i === retries) {
                    throw new PageFetcherError('The page or website is not available after ' + String(retries + 1) + ' attempts: ' + url + '. Details: ' + (error as Error).message, http, error);
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw new PageFetcherError("Unreachable fetch state");
    }

    private async readErrorResponseText(response: Response): Promise<string | undefined> {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                this.readResponseText(response),
                new Promise<undefined>(resolve => {
                    timeoutId = setTimeout(() => { resolve(undefined); }, ERROR_RESPONSE_BODY_CAPTURE_TIMEOUT_MS);
                }),
            ]);
        } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
    }

    /**
     * The proxy may return Zstandard bytes to browsers while labelling them as gzip.
     * Browser Fetch therefore exposes compressed bytes instead of decoding them. Detect the
     * actual wire format and decode it before the HTML/JSON parsers consume the response.
     */
    private async readResponseText(response: Response): Promise<string> {
        // Keep lightweight Response-like test doubles and non-browser fetch adapters compatible.
        if (typeof response.arrayBuffer !== 'function') {
            return response.text();
        }

        const bytes = new Uint8Array(await response.arrayBuffer());

        if (bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
            return new TextDecoder().decode(decompressZstd(bytes));
        }

        if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
            if (typeof DecompressionStream === 'undefined') {
                throw new Error('The response is gzip-compressed but this runtime cannot decompress gzip.');
            }

            const compressedBody = new Response(bytes).body;
            if (!compressedBody) {
                throw new Error('The response is gzip-compressed but this runtime cannot read its body.');
            }

            return new Response(
                compressedBody.pipeThrough(new DecompressionStream('gzip'))
            ).text();
        }

        return new TextDecoder().decode(bytes);
    }

}
