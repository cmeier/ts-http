import {
    RestClientError,
    RestClientErrorContext,
    RestClientErrorHandler,
} from './client-errors.js';
import { ResultType } from './types.js';
import { Logger, consoleLogger } from './logger.js';
import { TypeAdapter, buildReviver } from './adapters.js';
import type { HttpAdapterResponse } from './http-adapter.js';

/** Internal config object assembled once by createRestClient and passed into convertResult. */
export type ResolvedClientConfig = {
    logger: Logger;
    errorHandler: RestClientErrorHandler;
    adapters: TypeAdapter[];
    parseJson?: (text: string) => unknown;
};

/** Creates an error handler that logs via the supplied logger and rethrows. */
export function makeDefaultErrorHandler(
    logger: Logger = consoleLogger,
): RestClientErrorHandler {
    return (error: unknown, context: RestClientErrorContext) => {
        logger.error('API error:', error);
        logger.warn?.('Occurred in:', context.method, context.url);
        throw error;
    };
}

/** Default error handler — logs to console and rethrows. */
export const defaultErrorHandler: RestClientErrorHandler =
    makeDefaultErrorHandler(consoleLogger);

function isJsonContentType(ct: string | null) {
    return !!ct && ct.toLowerCase().includes('application/json');
}

async function parseJsonOrUndef<T>(
    res: HttpAdapterResponse,
    config: Pick<ResolvedClientConfig, 'parseJson' | 'adapters'>,
): Promise<T | undefined> {
    const text = await res.text();
    if (!text.trim()) return undefined;
    try {
        if (config.parseJson) {
            return config.parseJson(text) as T;
        }
        return JSON.parse(text, buildReviver(config.adapters)) as T;
    } catch {
        return undefined;
    }
}

export async function convertResult<T>(
    res: HttpAdapterResponse,
    result: ResultType,
    context: { method?: string; url?: string },
    config: ResolvedClientConfig,
): Promise<T | undefined> {
    const { logger, errorHandler } = config;
    const { method, url } = context;

    if (!res.ok) {
        let errorBody: any;
        try {
            errorBody = isJsonContentType(res.headers.get('content-type'))
                ? await parseJsonOrUndef(res, config)
                : await res.text();
        } catch (e) {
            logger.warn?.('Failed to read error response body:', e);
        }

        errorHandler(
            new RestClientError(
                `Request failed: ${res.status} ${res.statusText}`,
                res.status,
                url,
                method,
                errorBody,
                res,
            ),
            { method, url, response: res },
        );
        return undefined;
    }

    if (res.status === 204 || result === 'NONE') return undefined;

    try {
        switch (result) {
            case 'TEXT': {
                const text = await res.text();
                logger.debug?.(`Parsed TEXT response (${text.length} chars)`);
                return text as any;
            }

            case 'BLOB': {
                const blob = await res.blob();
                logger.debug?.(`Parsed BLOB response (${blob.size} bytes)`);
                return blob as any;
            }

            case 'ARRAYBUFFER': {
                const buf = await res.arrayBuffer();
                logger.debug?.(`Parsed ARRAYBUFFER response (${buf.byteLength} bytes)`);
                return buf as any;
            }

            case 'STREAM':
                logger.debug?.(`Reading STREAM response`);
                return res.body as any;

            case 'AUTO':
                if (isJsonContentType(res.headers.get('content-type'))) {
                    const data = await parseJsonOrUndef<T>(res, config);
                    logger.debug?.(`Parsed AUTO/JSON response`);
                    return data as any;
                } else {
                    const text = await res.text();
                    logger.debug?.(`Parsed AUTO/TEXT response (${text.length} chars)`);
                    return text as any;
                }

            case 'JSON':
            default:
                if (!isJsonContentType(res.headers.get('content-type'))) {
                    logger.warn?.(
                        `Expected JSON but got content-type: ${res.headers.get('content-type') ?? 'none'}`,
                    );
                    return undefined;
                }
                {
                    const data = await parseJsonOrUndef<T>(res, config);
                    logger.debug?.(`Parsed JSON response`);
                    return data as any;
                }
        }
    } catch (e) {
        logger?.error('Error parsing response:', e);
        errorHandler(
            new RestClientError(
                `Parsing result failed: ${res.status} ${res.statusText}`,
                res.status,
                url,
                method,
                undefined,
                res,
                e,
            ),
            { method, url, response: res },
        );
        return undefined;
    }
}
