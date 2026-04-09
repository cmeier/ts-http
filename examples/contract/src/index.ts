import { ApiDescription, RouteMapping } from '@ts-http/core';

// ---- shared domain types ----

export interface User {
    id: string;
    name: string;
    email: string;
}

// ---- API contract ----

export interface UserApi {
    getAll(): Promise<User[]>;
    getById(id: string): Promise<User>;
    create(data: { name: string; email: string }): Promise<User>;
    update(id: string, data: { name?: string; email?: string }): Promise<User>;
    remove(id: string): Promise<void>;
    /** Streams all users as newline-delimited JSON (NDJSON). */
    streamAll(): Promise<ReadableStream<Uint8Array>>;
    /** Streams a reply to a prompt word-by-word (LLM-style text stream). */
    streamText(params: { prompt: string }): Promise<ReadableStream<Uint8Array>>;
}

const userApiMapping: RouteMapping<UserApi> = {
    getAll: { method: 'GET', path: '' },
    getById: { method: 'GET', path: ':id' },
    create: { method: 'POST', path: '' },
    update: { method: 'PUT', path: ':id' },
    remove: { method: 'DELETE', path: ':id', resultType: 'NONE' },
    streamAll: { method: 'GET', path: 'stream', resultType: 'STREAM' },
    streamText: { method: 'POST', path: 'stream-text', resultType: 'STREAM' },
};

export const userApi: ApiDescription<UserApi> = {
    subRoute: '/api/users',
    mapping: userApiMapping,
};

