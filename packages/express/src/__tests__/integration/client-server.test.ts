/**
 * Full client-to-server integration tests.
 *
 * Each suite spins up a real Express HTTP server on a random port, creates a
 * `createRestClient` pointing to it, and exercises the full request/response
 * cycle — routing, serialisation, TypeAdapters, error handling, and streaming.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { createRestClient, dateAdapter } from '@ts-http/core';
import type { ApiDescription } from '@ts-http/core';
import { createExpressRouter } from '@ts-http/express';
import type { ExpressController } from '@ts-http/express';

// ─── shared contract ─────────────────────────────────────────────────────────

interface User {
    id: string;
    name: string;
    createdAt: Date;
}

interface UserApi {
    listUsers(): Promise<User[]>;
    getUser(id: string): Promise<User>;
    createUser(body: { name: string }): Promise<User>;
    updateUser(id: string, body: { name: string }): Promise<User>;
    deleteUser(id: string): Promise<void>;
    echo(body: { value: string }): Promise<{ value: string }>;
    notFound(id: string): Promise<User>;
}

const userApiDef: ApiDescription<UserApi> = {
    subRoute: 'users',
    mapping: {
        listUsers: { method: 'GET', path: '', resultType: 'JSON' },
        getUser: { method: 'GET', path: ':id', resultType: 'JSON' },
        createUser: { method: 'POST', path: '', resultType: 'JSON' },
        updateUser: { method: 'PUT', path: ':id', resultType: 'JSON' },
        deleteUser: { method: 'DELETE', path: ':id', resultType: 'NONE' },
        echo: { method: 'POST', path: 'echo', resultType: 'JSON' },
        notFound: { method: 'GET', path: 'notfound/:id', resultType: 'JSON' },
    },
};

// ─── in-memory DB ────────────────────────────────────────────────────────────

const DB = new Map<string, User>();
let nextId = 1;

function seedUser(name: string, createdAt: Date): User {
    const id = String(nextId++);
    const user: User = { id, name, createdAt };
    DB.set(id, user);
    return user;
}

// ─── server setup ─────────────────────────────────────────────────────────────

let server: Server<typeof import('http').IncomingMessage, typeof import('http').ServerResponse>;
let port: number;
let client: UserApi;

const controller: ExpressController<UserApi> = {
    listUsers: async () => [...DB.values()],
    getUser: async (id) => {
        const u = DB.get(id);
        if (!u) throw Object.assign(new Error('not found'), { status: 404 });
        return u;
    },
    createUser: async (body) => {
        const user = seedUser((body as any).name, new Date());
        return user;
    },
    updateUser: async (id, body) => {
        const u = DB.get(id);
        if (!u) throw Object.assign(new Error('not found'), { status: 404 });
        const updated = { ...u, name: (body as any).name };
        DB.set(id, updated);
        return updated;
    },
    deleteUser: async (id) => {
        DB.delete(id);
        return undefined;
    },
    echo: async (body) => ({ value: (body as any).value }),
    notFound: async (_id) => { throw Object.assign(new Error('not found'), { status: 404 }); },
};

beforeAll(async () => {
    DB.clear();
    nextId = 1;

    const app = express();
    app.use(express.json());

    const router = createExpressRouter(userApiDef, controller);
    app.use('/users', router);

    // Error handler — converts thrown errors with a .status to the right HTTP status
    app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.status ?? 500).json({ message: err.message });
    });

    await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
    });
    port = (server.address() as AddressInfo).port;

    client = createRestClient(userApiDef, `http://localhost:${port}`, {
        adapters: [dateAdapter],
        logging: false,
        onError: (err) => { throw err; },
    });
});

afterAll(() => {
    server.close();
});

// ─── CRUD round-trip ──────────────────────────────────────────────────────────

describe('Integration – CRUD round-trip', () => {
    it('creates a user and receives it back', async () => {
        const user = await client.createUser({ name: 'Alice' });
        expect(user).toMatchObject({ name: 'Alice' });
        expect(user.id).toBeTruthy();
    });

    it('gets an existing user by id', async () => {
        const created = await client.createUser({ name: 'Bob' });
        const fetched = await client.getUser(created.id);
        expect(fetched).toMatchObject({ id: created.id, name: 'Bob' });
    });

    it('lists all users', async () => {
        // Create a couple more users to ensure list works
        await client.createUser({ name: 'Charlie' });
        const list = await client.listUsers();
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThanOrEqual(1);
        expect(list.some((u) => u.name === 'Charlie')).toBe(true);
    });

    it('updates a user', async () => {
        const created = await client.createUser({ name: 'Dave' });
        const updated = await client.updateUser(created.id, { name: 'David' });
        expect(updated.name).toBe('David');
        expect(updated.id).toBe(created.id);
    });

    it('deletes a user (returns undefined, 204)', async () => {
        const created = await client.createUser({ name: 'Eve' });
        const result = await client.deleteUser(created.id);
        expect(result).toBeUndefined();
    });
});

// ─── date round-trip via TypeAdapter ─────────────────────────────────────────

describe('Integration – date round-trip with dateAdapter', () => {
    it('deserializes createdAt ISO string to Date', async () => {
        const user = await client.createUser({ name: 'Frank' });
        const fetched = await client.getUser(user.id);
        // The dateAdapter should have converted the ISO string → Date
        expect(fetched.createdAt).toBeInstanceOf(Date);
    });

    it('createdAt is a recent date', async () => {
        const before = Date.now();
        const user = await client.createUser({ name: 'Grace' });
        const after = Date.now();
        const fetched = await client.getUser(user.id);
        expect(fetched.createdAt.getTime()).toBeGreaterThanOrEqual(before - 100);
        expect(fetched.createdAt.getTime()).toBeLessThanOrEqual(after + 100);
    });
});

// ─── error handling ───────────────────────────────────────────────────────────

describe('Integration – error handling', () => {
    it('onError is called with a RestClientError for 404', async () => {
        const { RestClientError } = await import('@ts-http/core');
        let caughtError: unknown;
        const errClient = createRestClient(userApiDef, `http://localhost:${port}`, {
            adapters: [dateAdapter],
            logging: false,
            onError: (err) => { caughtError = err; },
        });
        await errClient.notFound('999');
        expect(caughtError).toBeInstanceOf(RestClientError);
        expect((caughtError as any).status).toBe(404);
    });

    it('throws when the error handler rethrows', async () => {
        const { RestClientError } = await import('@ts-http/core');
        await expect(client.notFound('000')).rejects.toBeInstanceOf(RestClientError);
    });
});

// ─── echo (body serialisation) ────────────────────────────────────────────────

describe('Integration – body serialisation', () => {
    it('round-trips a string field through POST body', async () => {
        const result = await client.echo({ value: 'hello integration' });
        expect(result.value).toBe('hello integration');
    });
});

// ─── streaming response ───────────────────────────────────────────────────────

describe('Integration – streaming response', () => {
    interface StreamApi { download(): Promise<ReadableStream<Uint8Array>>; }
    const streamApiDef: ApiDescription<StreamApi> = {
        subRoute: 'stream',
        mapping: { download: { method: 'GET', path: 'download', resultType: 'STREAM' } },
    };

    it('receives a Web ReadableStream from the server', async () => {
        const app = express();
        const router = createExpressRouter<StreamApi>(streamApiDef, {
            download: async () => Readable.from(['chunk1', 'chunk2']) as any,
        });
        app.use('/stream', router);

        await new Promise<void>((resolve) => {
            const srv = app.listen(0, async () => {
                const p = (srv.address() as AddressInfo).port;
                const streamClient = createRestClient(streamApiDef, `http://localhost:${p}`, { logging: false });

                const stream = await streamClient.download();
                expect(stream).toBeDefined();

                // Consume the stream
                const reader = stream.getReader();
                const chunks: Uint8Array[] = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
                const text = new TextDecoder().decode(
                    chunks.reduce((a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; }, new Uint8Array())
                );
                expect(text).toBe('chunk1chunk2');
                srv.close(() => resolve());
            });
        });
    });
});
