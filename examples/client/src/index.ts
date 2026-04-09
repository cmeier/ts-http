import { createRestClient, readNdjsonStream, readTextStream } from '@ts-http/core';
import { userApi, UserApi, User } from '@examples/contract';

// Wire up a global onResponse middleware — perfect for a toast in React.
// Any 401 gets handled here before the calling code ever sees the result.
// Note: you can also set on a per-request basis via the options argument
// and you can also just keep it simple and just use our defaults ;) 
// that means using fetch, console logging and going to just relative urls.
const users = createRestClient<UserApi>(userApi, 'http://localhost:3000', {
    onResponse: async (res, { method, url }) => {
        if (res.status === 401) {
            // In a React app: toast.error('Session expired'); navigate('/login');
            console.warn(`[auth] 401 on ${method} ${url} — redirect to login`);
            throw new Error('Unauthorized');
        }
    },
    // Only log warnings, not every error:
    logger: {
        warn: (...a) => console.warn('[client]', ...a),
        error: () => { }, // suppress — handled via onResponse / onError
    },
    // Contract routes without an explicit resultType fall back to 'JSON'.
    // Could be 'AUTO' if the server sends mixed content types.
    defaultResultType: 'JSON',
});

async function main() {
    // ---- CRUD demo ----
    const all = await users.getAll();
    console.log('All users (initially):', all);

    const alice = await users.create({ name: 'Alice', email: 'alice@example.com' });
    console.log('Created:', alice);

    const bob = await users.create({ name: 'Bob', email: 'bob@example.com' });
    console.log('Created:', bob);

    const updated = await users.update(alice.id, { name: 'Alice Smith' });
    console.log('Updated:', updated);

    // ---- streaming demo: NDJSON ----
    console.log('\n--- streaming all users as NDJSON ---');
    const userStream = await users.streamAll();
    if (userStream) {
        for await (const user of readNdjsonStream<User>(userStream)) {
            console.log('[stream] received user:', user);
        }
    }
    console.log('--- stream complete ---\n');

    // ---- streaming demo: text (LLM-style) ----
    console.log('--- streaming text reply ---');
    const textStream = await users.streamText({ prompt: 'Tell me about TypeScript' });
    if (textStream) {
        let reply = '';
        for await (const chunk of readTextStream(textStream)) {
            reply += chunk;
            // Print each token as it arrives (shows the streaming effect in the log)
            console.log('[stream] token:', JSON.stringify(chunk));
        }
        console.log('[stream] full reply:', reply);
    }
    console.log('--- stream complete ---\n');

    // ---- clean up ----
    await users.remove(alice.id);
    await users.remove(bob.id);
    console.log('Cleaned up.');
}

main().catch(console.error);

