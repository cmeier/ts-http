import express from 'express';
import { Readable } from 'node:stream';
import { createExpressRouter, ExpressController } from '@ts-http/express';
import { userApi, UserApi, User } from '@examples/contract';

// ---- in-memory store (swap with a real DB) ----
const store = new Map<string, User>();
let nextId = 1;

// ---- controller ----
// ExpressController<UserApi> enforces the exact same method signatures
// as the contract — no Request/Response plumbing needed.
const userController: ExpressController<UserApi> = {
    getAll: () => {
        const users = [...store.values()];
        console.log(`[controller] getAll → ${users.length} user(s)`);
        return users;
    },

    getById: (id) => {
        console.log(`[controller] getById id=${id}`);
        const user = store.get(id);
        if (!user) throw Object.assign(new Error('Not found'), { status: 404 });
        return user;
    },

    create: (data) => {
        const user: User = { id: String(nextId++), ...data };
        store.set(user.id, user);
        console.log(`[controller] create →`, user);
        return user;
    },

    update: (id, data) => {
        console.log(`[controller] update id=${id}`, data);
        const existing = store.get(id);
        if (!existing) throw Object.assign(new Error('Not found'), { status: 404 });
        const updated: User = { ...existing, ...data };
        store.set(id, updated);
        return updated;
    },

    remove: async (id) => {
        console.log(`[controller] remove id=${id}`);
        store.delete(id);
    },

    streamAll: () => {
        const users = [...store.values()];
        console.log(`[controller] streamAll — streaming ${users.length} user(s) as NDJSON`);

        return Readable.from(async function* () {
            for (let i = 0; i < users.length; i++) {
                console.log(`[controller] streamAll chunk ${i + 1}/${users.length}`);
                yield JSON.stringify(users[i]) + '\n';
                await new Promise((r) => setTimeout(r, 150));
            }
        }()) as unknown as ReadableStream<Uint8Array>;
    },

    streamText: ({ prompt }) => {
        const reply = `Sure! You said: "${prompt}". Here is a streamed reply, one word at a time.`;
        const words = reply.split(' ');
        console.log(`[controller] streamText prompt="${prompt}" — streaming ${words.length} token(s)`);

        return Readable.from(async function* () {
            for (let i = 0; i < words.length; i++) {
                yield (i === 0 ? '' : ' ') + words[i];
                await new Promise((r) => setTimeout(r, 80));
            }
        }()) as unknown as ReadableStream<Uint8Array>;
    },
};

// ---- app setup ----
const app = express();
app.use(express.json());

// Mount the generated router at the controller's base path
app.use(userApi.subRoute ?? '/', createExpressRouter(userApi, userController));

// Generic error handler
app.use(
    (
        err: any,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
    ) => {
        const status = err?.status ?? 500;
        res.status(status).json({ message: err?.message ?? 'Internal server error' });
    },
);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));

