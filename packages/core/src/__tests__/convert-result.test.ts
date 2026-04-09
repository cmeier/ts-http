import { describe, it, expect, vi } from 'vitest';
import { convertResult, makeDefaultErrorHandler, ResolvedClientConfig } from '../convert-result.js';
import { dateAdapter } from '../adapters.js';
import { RestClientError } from '../client-errors.js';
import type { HttpAdapterResponse } from '../http-adapter.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeResponse(overrides: Partial<HttpAdapterResponse> & {
    bodyText?: string;
    contentType?: string;
}): HttpAdapterResponse {
    const { bodyText = '', contentType = 'application/json', ok = true, status = 200, statusText = 'OK', ...rest } = overrides;
    return {
        ok,
        status,
        statusText,
        headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? contentType : null },
        text: () => Promise.resolve(bodyText),
        blob: () => Promise.resolve(new Blob([bodyText])),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(bodyText).buffer as ArrayBuffer),
        body: null,
        ...rest,
    };
}

const silentConfig: ResolvedClientConfig = {
    logger: { debug: undefined, warn: undefined, error: () => {} },
    errorHandler: (err) => { throw err; },
    adapters: [dateAdapter],
};

// ─── tests ───────────────────────────────────────────────────────────────────

describe('convertResult – JSON', () => {
    it('parses a JSON body', async () => {
        const res = makeResponse({ bodyText: '{"id":1,"name":"Alice"}' });
        const result = await convertResult(res, 'JSON', {}, silentConfig);
        expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    it('deserializes ISO date strings via dateAdapter', async () => {
        const res = makeResponse({ bodyText: '{"createdAt":"2024-01-01T00:00:00Z"}' });
        const result = await convertResult<{ createdAt: Date }>(res, 'JSON', {}, silentConfig);
        expect(result!.createdAt).toBeInstanceOf(Date);
    });

    it('returns undefined for empty body', async () => {
        const res = makeResponse({ bodyText: '' });
        const result = await convertResult(res, 'JSON', {}, silentConfig);
        expect(result).toBeUndefined();
    });

    it('uses custom parseJson if provided', async () => {
        const parseJson = vi.fn().mockReturnValue({ custom: true });
        const config: ResolvedClientConfig = { ...silentConfig, parseJson };
        const res = makeResponse({ bodyText: '{"x":1}' });
        const result = await convertResult(res, 'JSON', {}, config);
        expect(parseJson).toHaveBeenCalledWith('{"x":1}');
        expect(result).toEqual({ custom: true });
    });
});

describe('convertResult – TEXT', () => {
    it('returns the raw text', async () => {
        const res = makeResponse({ bodyText: 'hello world', contentType: 'text/plain' });
        const result = await convertResult(res, 'TEXT', {}, silentConfig);
        expect(result).toBe('hello world');
    });
});

describe('convertResult – NONE', () => {
    it('returns undefined regardless of body', async () => {
        const res = makeResponse({ bodyText: '{"id":1}' });
        const result = await convertResult(res, 'NONE', {}, silentConfig);
        expect(result).toBeUndefined();
    });
});

describe('convertResult – 204 No Content', () => {
    it('returns undefined for 204 even with JSON result type', async () => {
        const res = makeResponse({ status: 204, statusText: 'No Content', bodyText: '' });
        const result = await convertResult(res, 'JSON', {}, silentConfig);
        expect(result).toBeUndefined();
    });
});

describe('convertResult – AUTO', () => {
    it('parses JSON when content-type is application/json', async () => {
        const res = makeResponse({ bodyText: '{"x":1}', contentType: 'application/json' });
        const result = await convertResult(res, 'AUTO', {}, silentConfig);
        expect(result).toEqual({ x: 1 });
    });

    it('returns raw text for non-JSON content-type', async () => {
        const res = makeResponse({ bodyText: 'hello', contentType: 'text/plain' });
        const result = await convertResult(res, 'AUTO', {}, silentConfig);
        expect(result).toBe('hello');
    });
});

describe('convertResult – error responses', () => {
    it('calls errorHandler on non-ok response', async () => {
        const errorHandler = vi.fn();
        const config: ResolvedClientConfig = { ...silentConfig, errorHandler };
        const res = makeResponse({ ok: false, status: 404, statusText: 'Not Found', bodyText: '' });
        await convertResult(res, 'JSON', { method: 'GET', url: '/test' }, config);
        expect(errorHandler).toHaveBeenCalledOnce();
        const err = errorHandler.mock.calls[0][0] as RestClientError;
        expect(err).toBeInstanceOf(RestClientError);
        expect(err.status).toBe(404);
    });

    it('passes JSON error body to the error', async () => {
        const errorHandler = vi.fn();
        const config: ResolvedClientConfig = { ...silentConfig, errorHandler };
        const res = makeResponse({
            ok: false, status: 422, statusText: 'Unprocessable Entity',
            bodyText: '{"message":"validation failed"}',
            contentType: 'application/json',
        });
        await convertResult(res, 'JSON', {}, config);
        const err = errorHandler.mock.calls[0][0] as RestClientError;
        expect(err.body).toEqual({ message: 'validation failed' });
    });

    it('passes raw text error body for non-JSON error', async () => {
        const errorHandler = vi.fn();
        const config: ResolvedClientConfig = { ...silentConfig, errorHandler };
        const res = makeResponse({
            ok: false, status: 500, statusText: 'Internal Server Error',
            bodyText: 'Something went wrong',
            contentType: 'text/plain',
        });
        await convertResult(res, 'JSON', {}, config);
        const err = errorHandler.mock.calls[0][0] as RestClientError;
        expect(err.body).toBe('Something went wrong');
    });
});

describe('makeDefaultErrorHandler', () => {
    it('logs and rethrows the error', () => {
        const logger = { error: vi.fn(), warn: vi.fn() };
        const handler = makeDefaultErrorHandler(logger as any);
        const err = new RestClientError('fail', 500);
        expect(() => handler(err, {})).toThrow(err);
        expect(logger.error).toHaveBeenCalled();
    });
});
