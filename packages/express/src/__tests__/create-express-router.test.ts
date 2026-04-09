import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createExpressRouter } from '../create-express-router.js';
import type { ApiDescription } from '@ts-http/core';
import type { ExpressController } from '../create-express-router.js';
import { Readable } from 'node:stream';

// ─── contract definitions ────────────────────────────────────────────────────

interface UserApi {
    getUser(id: string): Promise<{ id: string; name: string }>;
    listUsers(query?: { search?: string }): Promise<{ id: string; name: string }[]>;
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

function makeApp() {
    const app = express();
    app.use(express.json());
    return app;
}

// ─── GET /id ─────────────────────────────────────────────────────────────────

describe('createExpressRouter – GET :id', () => {
    it('calls handler with path param and returns JSON', async () => {
        const app = makeApp();
        const router = createExpressRouter(userApiDef, {
            getUser: async (id) => ({ id, name: 'Alice' }),
            listUsers: async () => [],
            createUser: async (body) => ({ id: '1', name: (body as any).name }),
            updateUser: async (id, body) => ({ id, name: (body as any).name }),
            deleteUser: async () => undefined,
        });
        app.use('/users', router);

        const res = await request(app).get('/users/42');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ id: '42', name: 'Alice' });
    });
});

// ─── GET / (list + query) ────────────────────────────────────────────────────

describe('createExpressRouter – GET list with query', () => {
    it('passes query params to handler', async () => {
        const app = makeApp();
        let received: any;
        const router = createExpressRouter(userApiDef, {
            getUser: async (id) => ({ id, name: 'x' }),
            listUsers: async (q) => { received = q; return []; },
            createUser: async () => ({ id: '1', name: 'x' }),
            updateUser: async (id) => ({ id, name: 'x' }),
            deleteUser: async () => undefined,
        });
        app.use('/users', router);

        await request(app).get('/users?search=alice');
        expect(received).toMatchObject({ search: 'alice' });
    });

    it('returns JSON array', async () => {
        const app = makeApp();
        const router = createExpressRouter(userApiDef, {
            getUser: async (id) => ({ id, name: 'x' }),
            listUsers: async () => [{ id: '1', name: 'Bob' }],
            createUser: async () => ({ id: '1', name: 'x' }),
            updateUser: async (id) => ({ id, name: 'x' }),
            deleteUser: async () => undefined,
        });
        app.use('/users', router);

        const res = await request(app).get('/users');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ id: '1', name: 'Bob' }]);
    });
});

// ─── POST / ──────────────────────────────────────────────────────────────────

describe('createExpressRouter – POST', () => {
    it('calls handler with body and returns 200 JSON', async () => {
        const app = makeApp();
        const router = createExpressRouter(userApiDef, {
            getUser: async (id) => ({ id, name: 'x' }),
            listUsers: async () => [],
            createUser: async (body) => ({ id: '99', name: (body as any).name }),
            updateUser: async (id) => ({ id, name: 'x' }),
            deleteUser: async () => undefined,
        });
        app.use('/users', router);

        const res = await request(app).post('/users').send({ name: 'Carol' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ id: '99', name: 'Carol' });
    });
});

// ─── PUT /:id ────────────────────────────────────────────────────────────────

describe('createExpressRouter – PUT :id', () => {
    it('calls handler with id and body', async () => {
        const app = makeApp();
        let receivedId: string | undefined;
        let receivedBody: any;
        const router = createExpressRouter(userApiDef, {
            getUser: async (id) => ({ id, name: 'x' }),
            listUsers: async () => [],
            createUser: async () => ({ id: '1', name: 'x' }),
            updateUser: async (id, body) => {
                receivedId = id as string;
                receivedBody = body;
                return { id: id as string, name: (body as any).name };
            },
            deleteUser: async () => undefined,
        });
        app.use('/users', router);

        const res = await request(app).put('/users/7').send({ name: 'Dave' });
        expect(res.status).toBe(200);
        expect(receivedId).toBe('7');
        expect(receivedBody).toEqual({ name: 'Dave' });
    });
});

// ─── DELETE /:id (NONE result) ───────────────────────────────────────────────

describe('createExpressRouter – DELETE :id', () => {
    it('returns 204 for NONE result type', async () => {
        const app = makeApp();
        const router = createExpressRouter(userApiDef, {
            getUser: async (id) => ({ id, name: 'x' }),
            listUsers: async () => [],
            createUser: async () => ({ id: '1', name: 'x' }),
            updateUser: async (id) => ({ id, name: 'x' }),
            deleteUser: async () => undefined,
        });
        app.use('/users', router);

        const res = await request(app).delete('/users/5');
        expect(res.status).toBe(204);
    });
});

// ─── undefined return → 204 ──────────────────────────────────────────────────

describe('createExpressRouter – undefined return', () => {
    interface VoidApi { noop(): Promise<void>; }
    const voidApiDef: ApiDescription<VoidApi> = {
        subRoute: 'misc',
        mapping: { noop: { method: 'POST', path: 'noop', resultType: 'NONE' } },
    };

    it('returns 204 when handler returns undefined', async () => {
        const app = makeApp();
        const router = createExpressRouter(voidApiDef, { noop: async () => undefined });
        app.use('/misc', router);

        const res = await request(app).post('/misc/noop');
        expect(res.status).toBe(204);
    });
});

// ─── error handling ───────────────────────────────────────────────────────────

describe('createExpressRouter – handler errors', () => {
    it('calls next(err) when the handler throws', async () => {
        const app = makeApp();
        const router = createExpressRouter(userApiDef, {
            getUser: async () => { throw new Error('oops'); },
            listUsers: async () => [],
            createUser: async () => ({ id: '1', name: 'x' }),
            updateUser: async (id) => ({ id, name: 'x' }),
            deleteUser: async () => undefined,
        });
        app.use('/users', router);
        // Add a simple error handler
        app.use((_err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: _err.message }));

        const res = await request(app).get('/users/1');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('oops');
    });
});

// ─── Node.js Readable stream ──────────────────────────────────────────────────

describe('createExpressRouter – Node Readable stream', () => {
    interface StreamApi { data(): Promise<Readable>; }
    const streamApiDef: ApiDescription<StreamApi> = {
        subRoute: 'stream',
        mapping: { data: { method: 'GET', path: 'data', resultType: 'STREAM' } },
    };

    it('pipes a Node Readable stream to response', async () => {
        const app = makeApp();
        const router = createExpressRouter<StreamApi>(streamApiDef, {
            data: async () => Readable.from(['hello', ' ', 'world']),
        });
        app.use('/stream', router);

        const res = await request(app).get('/stream/data').buffer(true);
        expect(res.status).toBe(200);
        expect(res.body.toString()).toBe('hello world');
    });
});

// ─── class-based controller ───────────────────────────────────────────────────

describe('createExpressRouter – class-based controller', () => {
    it('preserves `this` for prototype methods that rely on instance state', async () => {
        class UserController implements ExpressController<UserApi> {
            private readonly prefix = 'user';

            async getUser(id: string) { return { id, name: `${this.prefix}-${id}` }; }
            async listUsers() { return []; }
            async createUser(body: { name: string }) { return { id: '1', name: body.name }; }
            async updateUser(id: string, body: { name: string }) { return { id, name: body.name }; }
            async deleteUser() { return undefined; }
        }

        const app = makeApp();
        const router = createExpressRouter(userApiDef, new UserController());
        app.use('/users', router);

        const res = await request(app).get('/users/42');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ id: '42', name: 'user-42' });
    });
});
