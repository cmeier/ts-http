import { describe, it, expect, vi } from 'vitest';
import { createRestClient } from '../create-rest-client.js';
import type { ApiDescription } from '../types.js';
import type { HttpAdapter } from '../http-adapter.js';

// ─── helpers ────────────────────────────────────────────────────────────────

interface UserApi {
    getUser(id: string): Promise<{ id: string; name: string }>;
    listUsers(query?: { page?: number }): Promise<{ id: string }[]>;
    createUser(body: { name: string }): Promise<{ id: string; name: string }>;
    updateUser(id: string, body: { name: string }): Promise<{ id: string; name: string }>;
    deleteUser(id: string): Promise<void>;
}

const userApiDef: ApiDescription<UserApi> = {
    subRoute: 'users',
    mapping: {
        getUser: { method: 'GET', path: ':id', resultType: 'JSON' },
        listUsers: { method: 'GET', path: '', resultType: 'JSON' },
        createUser: { method: 'POST', path: '', resultType: 'JSON' },
        updateUser: { method: 'PUT', path: ':id', resultType: 'JSON' },
        deleteUser: { method: 'DELETE', path: ':id', resultType: 'NONE' },
    },
};

function makeAdapterResponse(body: string, status = 200, contentType = 'application/json') {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : status === 204 ? 'No Content' : 'Error',
        headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? contentType : null },
        text: () => Promise.resolve(body),
        blob: () => Promise.resolve(new Blob([body])),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer as ArrayBuffer),
        body: null,
    };
}

function makeAdapter(responder: (url: string, method: string, body?: string) => ReturnType<typeof makeAdapterResponse>): HttpAdapter {
    return vi.fn(async (req) => responder(req.url, req.method, req.body));
}

// ─── path substitution ───────────────────────────────────────────────────────

describe('createRestClient – path substitution', () => {
    it('substitutes a path param from arguments', async () => {
        const adapter = makeAdapter(() => makeAdapterResponse('{"id":"42","name":"Alice"}'));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter: adapter, logging: false });
        await client.getUser('42');
        expect((adapter as ReturnType<typeof vi.fn>).mock.calls[0][0].url).toContain('/42');
    });

    it('appends query params for GET requests with leftover object keys', async () => {
        const adapter = makeAdapter(() => makeAdapterResponse('[{"id":"1"}]'));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter: adapter, logging: false });
        await client.listUsers({ page: 2 });
        const url: string = (adapter as ReturnType<typeof vi.fn>).mock.calls[0][0].url;
        expect(url).toContain('page=2');
    });

    it('encodes path params', async () => {
        const adapter = makeAdapter(() => makeAdapterResponse('{"id":"a b","name":"test"}'));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter: adapter, logging: false });
        await client.getUser('a b');
        const url: string = (adapter as ReturnType<typeof vi.fn>).mock.calls[0][0].url;
        expect(url).toContain('a%20b');
    });
});

// ─── HTTP method + body ──────────────────────────────────────────────────────

describe('createRestClient – request body', () => {
    it('sends JSON body for POST', async () => {
        const adapter = makeAdapter(() => makeAdapterResponse('{"id":"1","name":"Bob"}'));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter: adapter, logging: false });
        await client.createUser({ name: 'Bob' });
        const call = (adapter as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.method).toBe('POST');
        expect(JSON.parse(call.body)).toEqual({ name: 'Bob' });
        expect(call.headers['Content-Type']).toBe('application/json');
    });

    it('does not include body for GET', async () => {
        const adapter = makeAdapter(() => makeAdapterResponse('{"id":"1","name":"Bob"}'));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter: adapter, logging: false });
        await client.getUser('1');
        const call = (adapter as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.method).toBe('GET');
        expect(call.body).toBeUndefined();
    });

    it('sends JSON body for PUT', async () => {
        const adapter = makeAdapter(() => makeAdapterResponse('{"id":"1","name":"Alice"}'));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter: adapter, logging: false });
        await client.updateUser('1', { name: 'Alice' });
        const call = (adapter as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.method).toBe('PUT');
        expect(JSON.parse(call.body)).toEqual({ name: 'Alice' });
    });
});

// ─── result handling ─────────────────────────────────────────────────────────

describe('createRestClient – result handling', () => {
    it('returns parsed JSON response', async () => {
        const adapter = makeAdapter(() => makeAdapterResponse('{"id":"5","name":"Eve"}'));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter: adapter, logging: false });
        const result = await client.getUser('5');
        expect(result).toEqual({ id: '5', name: 'Eve' });
    });

    it('returns undefined for NONE result type', async () => {
        const adapter = makeAdapter(() => makeAdapterResponse('', 204));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter: adapter, logging: false });
        const result = await client.deleteUser('1');
        expect(result).toBeUndefined();
    });

    it('calls onError for non-ok response', async () => {
        const onError = vi.fn();
        const adapter = makeAdapter(() => makeAdapterResponse('{"message":"not found"}', 404));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter: adapter, onError, logging: false });
        await client.getUser('999');
        expect(onError).toHaveBeenCalledOnce();
    });
});

// ─── onResponse hook ─────────────────────────────────────────────────────────

describe('createRestClient – onResponse', () => {
    it('calls onResponse with the response and context', async () => {
        const onResponse = vi.fn();
        const adapter = makeAdapter(() => makeAdapterResponse('{"id":"1","name":"A"}'));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter: adapter, onResponse, logging: false });
        await client.getUser('1');
        expect(onResponse).toHaveBeenCalledOnce();
        const [res, ctx] = onResponse.mock.calls[0];
        expect(res.status).toBe(200);
        expect(ctx.method).toBe('GET');
    });
});

// ─── httpAdapter option ──────────────────────────────────────────────────────

describe('createRestClient – httpAdapter', () => {
    it('uses httpAdapter instead of fetch', async () => {
        const httpAdapter: HttpAdapter = vi.fn(async () => makeAdapterResponse('{"id":"2","name":"X"}'));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter, logging: false });
        await client.getUser('2');
        expect(httpAdapter).toHaveBeenCalledOnce();
    });

    it('passes url, method, headers, body to httpAdapter', async () => {
        const httpAdapter: HttpAdapter = vi.fn(async () => makeAdapterResponse('{"id":"3","name":"Y"}'));
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter, logging: false });
        await client.createUser({ name: 'Y' });
        const req = (httpAdapter as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(req.url).toContain('/users');
        expect(req.method).toBe('POST');
        expect(req.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(req.body)).toEqual({ name: 'Y' });
    });
});

// ─── network error ───────────────────────────────────────────────────────────

describe('createRestClient – network error', () => {
    it('calls onError with a RestClientError on network failure', async () => {
        const onError = vi.fn();
        const httpAdapter: HttpAdapter = vi.fn(async () => { throw new Error('network down'); });
        const client = createRestClient(userApiDef, 'http://localhost', { httpAdapter, onError, logging: false });
        await client.getUser('1');
        expect(onError).toHaveBeenCalledOnce();
        const [err] = onError.mock.calls[0];
        expect(err.message).toContain('Fetch Error');
    });
});

// ─── baseUrl omitted / relative ─────────────────────────────────────────────

describe('createRestClient – no baseUrl', () => {
    it('builds a relative URL when baseUrl is omitted', async () => {
        const httpAdapter: HttpAdapter = vi.fn(async () => makeAdapterResponse('{"id":"1","name":"A"}'));
        const client = createRestClient(userApiDef, undefined, { httpAdapter, logging: false });
        await client.getUser('1');
        const req = (httpAdapter as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(req.url).not.toContain('http');
        expect(req.url).toContain('/users/1');
    });

    it('builds a clean relative URL when baseUrl is empty and subRoute has a leading slash', async () => {
        const apiWithLeadingSlash: ApiDescription<UserApi> = {
            ...userApiDef,
            subRoute: '/users',
        };
        const httpAdapter: HttpAdapter = vi.fn(async () => makeAdapterResponse('{"id":"1","name":"A"}'));
        const client = createRestClient(apiWithLeadingSlash, '', { httpAdapter, logging: false });
        await client.getUser('1');
        const req = (httpAdapter as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(req.url).toBe('/users/1');
        expect(req.url).not.toMatch(/^\/\//);
    });
});

// ─── STREAM result type ───────────────────────────────────────────────────────

describe('createRestClient – STREAM result type', () => {
    interface DownloadApi { download(): Promise<ReadableStream<Uint8Array>>; }
    const downloadApiDef: ApiDescription<DownloadApi> = {
        subRoute: 'files',
        mapping: { download: { method: 'GET', path: 'download', resultType: 'STREAM' } },
    };

    it('returns res.body as a ReadableStream without consuming it', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(c) { c.enqueue(new TextEncoder().encode('hello')); c.close(); },
        });
        const httpAdapter: HttpAdapter = vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: () => 'application/octet-stream' },
            text: () => Promise.reject(new Error('should not call text()')),
            blob: () => Promise.reject(new Error('should not call blob()')),
            arrayBuffer: () => Promise.reject(new Error('should not call arrayBuffer()')),
            body: stream,
        }));
        const client = createRestClient(downloadApiDef, 'http://localhost', { httpAdapter, logging: false });
        const result = await client.download();
        expect(result).toBe(stream);
    });

    it('does not send a body for a streaming GET', async () => {
        const httpAdapter: HttpAdapter = vi.fn(async () => ({
            ok: true, status: 200, statusText: 'OK',
            headers: { get: () => null },
            text: async () => '', blob: async () => new Blob(), arrayBuffer: async () => new ArrayBuffer(0),
            body: new ReadableStream(),
        }));
        const client = createRestClient(downloadApiDef, 'http://localhost', { httpAdapter, logging: false });
        await client.download();
        const req = (httpAdapter as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(req.body).toBeUndefined();
        expect(req.method).toBe('GET');
    });
});
