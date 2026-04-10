import type { RestClientErrorHandler } from './client-errors.js';
import type { Logger } from './logger.js';
import type { TypeAdapter } from './adapters.js';
import type { HttpAdapter, HttpAdapterResponse } from './http-adapter.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
export type ResultType =
    | 'JSON'
    | 'TEXT'
    | 'AUTO'
    | 'BLOB'
    | 'ARRAYBUFFER'
    | 'STREAM'
    | 'NONE';

export type RouteEntry = {
    method: HttpMethod;
    path: string;
    resultType?: ResultType;
    // --- OpenAPI operation metadata (optional, ignored at runtime) ---
    /** Short human-readable title for the operation. */
    summary?: string;
    /** Longer description. Supports Markdown. */
    description?: string;
    /** Groups operation under one or more tags in the generated spec. */
    tags?: string[];
    /** Overrides the auto-generated operationId (defaults to the method name). */
    operationId?: string;
    /** Marks the operation as deprecated in the generated spec. */
    deprecated?: boolean;
};

export type RouteMapping<TContract> = {
    [K in keyof TContract]: RouteEntry;
};

export type TagDefinition = { name: string; description?: string };

export type ApiDescription<TContract> = {
    subRoute?: string;
    /**
     * Tag applied to every operation in this group when a route does not
     * specify its own `tags`.  Accepts a plain name string or a full tag
     * definition with an optional description (used in the generated spec's
     * top-level `tags` array).
     */
    tag?: string | TagDefinition;
    mapping: RouteMapping<TContract>;
};

export type RestClientOptions = {
    /** Custom fetch implementation (default: global `fetch`). */
    fetch?: typeof fetch;
    /**
     * Plug in any HTTP client (axios, ky, got, undici, …).
     * When set, `options.fetch` is ignored.
     * See `docs/adapters/axios.md` for an example.
     */
    httpAdapter?: HttpAdapter;
    /**
     * Called on every non-2xx response or network error.
     * Return without throwing to suppress the error silently.
     */
    onError?: RestClientErrorHandler;
    /**
     * Intercept every raw Response before result conversion.
     * Ideal for global auth handling, toast notifications, etc.
     * Throw here to abort — the error propagates to the caller.
     */
    onResponse?: (
        res: HttpAdapterResponse,
        context: { method: string; url: string },
    ) => void | Promise<void>;
    /** Override the logger (default: console). */
    logger?: Logger;
    /** Set to `false` to disable all logging. Defaults to `true`. */
    logging?: boolean;
    /**
     * Fallback result type when the contract route does not specify one.
     * Defaults to `'JSON'`.
     */
    defaultResultType?: ResultType;
    /**
     * Type adapters for serialization/deserialization.
     * Applied as a JSON.parse reviver (deserialize) and JSON.stringify replacer (serialize).
     * Defaults to `[dateAdapter]` which converts ISO strings to Date objects.
     * Pass `[]` to disable all transforms.
     */
    adapters?: TypeAdapter[];
    /**
     * Full override for JSON parsing (e.g. superjson).
     * When set, `adapters` are not applied during deserialization.
     */
    parseJson?: (text: string) => unknown;
};

/** Ensures all keys of TAll are covered by TList at compile time. */
export type AssertAllKeysArePresent<
    TAll extends Record<string, any>,
    TList extends readonly (keyof TAll)[],
> =
    Exclude<keyof TAll, TList[number]> extends never
    ? true
    : ['Missing', Exclude<keyof TAll, TList[number]>];
