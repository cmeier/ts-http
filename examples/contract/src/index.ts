import { ApiDescription } from '@ts-http/core';

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

export const userApi: ApiDescription<UserApi> = {
    subRoute: '/api/users',
    mapping: {
        // Minimal form (no meta):  { method: 'GET', path: '' }
        getAll: { method: 'GET', path: '', tags: ['Users'], summary: 'List all users' },
        getById: { method: 'GET', path: ':id', tags: ['Users'], summary: 'Get a user by ID' },
        create: { method: 'POST', path: '', tags: ['Users'], summary: 'Create a new user' },
        update: { method: 'PUT', path: ':id', tags: ['Users'], summary: 'Update a user' },
        remove: { method: 'DELETE', path: ':id', tags: ['Users'], summary: 'Delete a user', resultType: 'NONE' },
        streamAll: { method: 'GET', path: 'stream', tags: ['Streams'], summary: 'Stream all users as NDJSON', resultType: 'STREAM', description: 'Returns a newline-delimited JSON stream of all users.' },
        streamText: { method: 'POST', path: 'stream-text', tags: ['Streams'], summary: 'Stream a text reply word-by-word', resultType: 'STREAM', description: 'LLM-style streaming endpoint. POST a prompt, receive a token stream.' },
    },
};

