import { RestClientError } from './client-errors.js';
import type { HttpAdapter } from './http-adapter.js';
import {
    convertResult,
    makeDefaultErrorHandler,
    defaultErrorHandler,
    ResolvedClientConfig,
} from './convert-result.js';
import { ApiDescription, RestClientOptions } from './types.js';
import { consoleLogger, silentLogger } from './logger.js';
import { dateAdapter, buildReplacer } from './adapters.js';

function substitutePathParams(
    path: string,
    args: any[],
): {
    finalPath: string;
    remainingPath: Record<string, any>;
    additionalData: any[];
} {
    const usedKeys = new Set<string>();
    const takeFromObject = args[0] && typeof args[0] === 'object';
    let index = 0;

    const finalPath = path.replace(/:([a-zA-Z0-9_?]+)/g, (_, key) => {
        const isOptional = key.endsWith('?');
        const cleanKey = isOptional ? key.slice(0, -1) : key;

        const value = takeFromObject
            ? args[0][cleanKey]
            : args.filter((a) => typeof a !== 'object')[index++];

        if (value !== undefined) {
            usedKeys.add(cleanKey);
            return encodeURIComponent(value);
        }

        if (isOptional) return '';
        throw new Error(`Missing required path parameter: ${cleanKey}`);
    });

    const remainingPath = takeFromObject
        ? Object.fromEntries(
            Object.entries(args[0]).filter(([k]) => !usedKeys.has(k)),
        )
        : {};

    const unusedIndex = takeFromObject
        ? Object.entries(remainingPath).length > 0
            ? 0
            : 1
        : index;

    const additionalData = args.slice(unusedIndex);
    return { finalPath, remainingPath, additionalData };
}

function buildQuery(params: Record<string, any>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            query.append(key, value.toString());
        }
    }
    const queryString = query.toString();
    return queryString ? `?${queryString}` : '';
}

export function createRestClient<TContract>(
    api: ApiDescription<TContract>,
    baseUrl?: string,
    options: RestClientOptions = {},
): TContract {
    const {
        fetch: fetchFn = fetch,
        httpAdapter,
        onError,
        onResponse,
        logger: loggerOption = consoleLogger,
        logging = true,
        defaultResultType = 'JSON',
        adapters = [dateAdapter],
        parseJson,
    } = options;

    const logger = logging ? loggerOption : silentLogger;
    const errorHandler = onError ?? makeDefaultErrorHandler(logger);
    const replacer = buildReplacer(adapters);

    const adapter: HttpAdapter = httpAdapter ??
        ((req) => fetchFn(req.url, {
            method: req.method,
            headers: req.headers,
            body: req.body,
            credentials: 'include',
        }));

    const config: ResolvedClientConfig = { logger, errorHandler, adapters, parseJson };

    const client = {} as TContract;
    const controllerPath = (api.subRoute ?? '').replace(/^\//, '').replace(/\/$/, '');

    for (const key in api.mapping) {
        const { method, path, resultType } = api.mapping[key];

        (client as any)[key] = async (...args: any[]) => {
            const { finalPath, remainingPath, additionalData } =
                substitutePathParams(path, args);

            const urlBase =
                `${baseUrl ?? ''}/${controllerPath}/${finalPath}`.replace(/([^:])\/\/+/g, '$1/');

            let url = urlBase;
            let body: string | undefined;

            if (method === 'GET') {
                url += buildQuery(remainingPath);
            } else if (additionalData.length >= 1) {
                body = JSON.stringify(additionalData[0], replacer);
                if (additionalData.length > 1) {
                    logger.warn?.('ignored additional data:', additionalData.slice(1));
                }
            }

            const headers: Record<string, string> = {};
            if (body && method !== 'GET' && method !== 'HEAD') {
                headers['Content-Type'] = 'application/json';
            }

            const isStream =
                (resultType ?? defaultResultType) === 'STREAM';

            if (isStream) {
                logger.debug?.(`--> ${method} ${url} [stream]`);
            } else {
                logger.debug?.(`--> ${method} ${url}`, additionalData[0] ?? '');
            }

            let res: Awaited<ReturnType<HttpAdapter>> | undefined;
            try {
                res = await adapter({ url, method, headers, body });
            } catch (error) {
                errorHandler(
                    new RestClientError(
                        'Fetch Error: ' + (error as any).message,
                        500,
                        url,
                        method,
                        body,
                        undefined,
                        error,
                    ),
                    { url, method },
                );
                return undefined;
            }

            if (onResponse) {
                await onResponse(res, { method, url });
            }

            const effectiveResultType = resultType ?? defaultResultType;
            if (effectiveResultType === 'STREAM') {
                logger.debug?.(`<-- ${res.status} ${url} [stream started]`);
            } else {
                logger.debug?.(`<-- ${res.status} ${url}`);
            }

            const result = await convertResult(
                res,
                effectiveResultType,
                { method, url },
                config,
            );

            if (effectiveResultType === 'STREAM' && result instanceof ReadableStream) {
                if (logging && logger.debug) {
                    const [s1, s2] = result.tee();
                    (async () => {
                        const reader = s2.getReader();
                        try {
                            while (true) {
                                const { done } = await reader.read();
                                if (done) {
                                    logger.debug?.(`<-- ${url} [stream ended]`);
                                    break;
                                }
                            }
                        } catch {
                            logger.debug?.(`<-- ${url} [stream error]`);
                        } finally {
                            reader.releaseLock();
                        }
                    })();
                    return s1 as any;
                }
                return result as any;
            }

            return result;
        };
    }

    return client;
}

export { defaultErrorHandler };
