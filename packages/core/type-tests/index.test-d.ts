import { expectType, expectAssignable } from 'tsd';
import {
    createRestClient,
    dateAdapter,
    buildReviver,
    buildReplacer,
    RestClientError,
} from '@ts-http/core';
import type {
    ApiDescription,
    TypeAdapter,
    RestClientOptions,
    HttpAdapter,
    HttpAdapterRequest,
} from '@ts-http/core';

// ─── ApiDescription ───────────────────────────────────────────────────────────

interface PingApi {
    ping(): Promise<{ pong: boolean }>;
    getText(): Promise<string>;
    voidCall(): Promise<void>;
}

const pingApiDef: ApiDescription<PingApi> = {
    subRoute: 'ping',
    mapping: {
        ping: { method: 'GET', path: 'ping', resultType: 'JSON' },
        getText: { method: 'GET', path: 'text', resultType: 'TEXT' },
        voidCall: { method: 'POST', path: 'void', resultType: 'NONE' },
    },
};

// ─── createRestClient return type ────────────────────────────────────────────

const client = createRestClient(pingApiDef, 'http://localhost');

expectType<() => Promise<{ pong: boolean }>>(client.ping);
expectType<() => Promise<string>>(client.getText);
expectType<() => Promise<void>>(client.voidCall);

// ─── TypeAdapter ─────────────────────────────────────────────────────────────

const myAdapter: TypeAdapter = {
    test: (v: unknown) => v === 'x',
    deserialize: (v: unknown) => v,
    serialize: (v: unknown) => v,
};

expectType<TypeAdapter>(dateAdapter);
expectType<TypeAdapter>(myAdapter);

// ─── buildReviver / buildReplacer ─────────────────────────────────────────────

const reviver = buildReviver([dateAdapter]);
expectType<(key: string, value: unknown) => unknown>(reviver);

const replacer = buildReplacer([dateAdapter]);
expectType<((key: string, value: unknown) => unknown) | undefined>(replacer);

// ─── RestClientError ─────────────────────────────────────────────────────────

const err = new RestClientError('oops', 500, '/test', 'GET', undefined);
expectType<number>(err.status);
expectType<string | undefined>(err.url);
expectType<string | undefined>(err.method);

// ─── HttpAdapterRequest ───────────────────────────────────────────────────────

const req: HttpAdapterRequest = {
    url: 'http://localhost',
    method: 'GET',
    headers: {},
};
expectType<string>(req.url);
expectType<string>(req.method);
expectType<Record<string, string>>(req.headers);
expectType<string | undefined>(req.body);

// ─── HttpAdapter ─────────────────────────────────────────────────────────────

const myHttpAdapter: HttpAdapter = async (_r: HttpAdapterRequest) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (_name: string) => null },
    text: async () => '',
    blob: async () => new Blob(),
    arrayBuffer: async () => new ArrayBuffer(0),
    body: null,
});
expectType<HttpAdapter>(myHttpAdapter);

// ─── RestClientOptions ────────────────────────────────────────────────────────

const opts: RestClientOptions = {
    adapters: [dateAdapter],
    logging: false,
};
expectAssignable<RestClientOptions>(opts);

const optsWithAdapter: RestClientOptions = { httpAdapter: myHttpAdapter };
expectAssignable<RestClientOptions>(optsWithAdapter);

const optsWithFetch: RestClientOptions = { fetch: globalThis.fetch };
expectAssignable<RestClientOptions>(optsWithFetch);
