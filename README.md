<p align="center">
  <img src="docs/logo.svg" alt="ts-http logo" />
</p>

# ts-http

Stop writing the same API calls twice — especially if you're using TypeScript on both the server and the client. Define your endpoints once in TypeScript — the client and server both use the same contract, and the types flow through automatically.
It has never been this easy!

No code generation. No schema files. No runtime validation overhead unless you want it. Just a small config object and TypeScript doing what it's good at.
Simple, yet fully extensible.

Use it to make sure your Express.js server fulfills your defined interface — or NestJS?

Convert your data. Use it with Axios, make sure you're serializing your Luxon dates correctly, handle circular references, use it with whatever you want.


If that's not enough, you can still generate your `openapi.json` and retain full technology freedom.

## Packages

| Package | Description |
|---|---|
| [`@ts-http/core`](packages/core/README.md) | Contract types + typed fetch client (browser & Node 18+) |
| [`@ts-http/express`](packages/express/README.md) | Express router adapter |
| [`@ts-http/nestjs`](packages/nestjs/README.md) | NestJS `@Action` decorator + `TypedController` type |

## How it works

Define a contract — an interface plus a route mapping:

```ts
import { ApiDescription } from '@ts-http/core';

interface MyApi {
  helloWorld(): Promise<{ message: string }>;
}

const myApi: ApiDescription<MyApi> = {
  controller: '/api',
  mapping: {
    helloWorld: { 
      method: 'GET', 
      path: 'hello-world' 
    },
  },
};
```

Pass it to `createRestClient`. No base URL needed — leave it out and requests go to the same origin, which is what you want in most frontend apps:

```ts
import { createRestClient } from '@ts-http/core';

const client = createRestClient<MyApi>(myApi);

const result = await client.helloWorld(); // { message: string }
```

That's it. The call hits `GET /api/hello-world` on the current origin. TypeScript knows the return type.

---

For larger APIs you define the contract once and share it between your frontend and backend. The client and server both import the same object, so if you change a route or a return type, every call site breaks at compile time instead of at runtime.

**Contract** (shared package):

```ts
export interface UserApi {
  getAll(): Promise<User[]>;
  getById(id: string): Promise<User>;
  create(data: { name: string; email: string }): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
  remove(id: string): Promise<void>;
}

export const userApi: ApiDescription<UserApi> = {
  controller: '/api/users',
  mapping: {
    getAll:  { method: 'GET',    path: '' },
    getById: { method: 'GET',    path: ':id' },
    create:  { method: 'POST',   path: '' },
    update:  { method: 'PUT',    path: ':id' },
    remove:  { method: 'DELETE', path: ':id', resultType: 'NONE' },
  },
};
```

**Client:**

```ts
const users = createRestClient<UserApi>(userApi);

const all  = await users.getAll();        // User[]
const user = await users.getById('123'); // User
await users.remove('123');               // void
```

**Server** — `createExpressRouter` generates a router and calls your handlers with the right argument types:

```ts
import { createExpressRouter, ExpressController } from '@ts-http/express';

const controller: ExpressController<UserApi> = {
  getAll:  () => db.users.findMany(),
  getById: (id) => db.users.findById(id),
  create:  (data) => db.users.create(data),
  update:  (id, data) => db.users.update(id, data),
  remove:  (id) => db.users.delete(id),
};

app.use(userApi.controller, createExpressRouter(userApi, controller));
```

No `req`, no `res`, no `next`. Just your business logic.

## Installation

```sh
pnpm add @ts-http/core
pnpm add @ts-http/express  # server side
```

Requires Node 18+ or a modern browser (native `fetch`).

## Client options

```ts
const client = createRestClient<MyApi>(api, baseUrl, {
  // swap in a custom fetch (e.g. for tests or environments without global fetch)
  fetch: myFetch,

  // called on every response — ideal for auth refresh, toast notifications, etc.
  onResponse: async (res, { method, url }) => {
    if (res.status === 401) throw new Error('Unauthorized');
  },

  // called on non-2xx errors or network failures
  // return without throwing to suppress the error silently
  onError: (error, context) => {
    console.error(error.message, context.url);
  },

  // pluggable logger — or pass logging: false to silence everything
  logger: myLogger,
  logging: false,

  // fallback result type when the route doesn't specify one
  defaultResultType: 'JSON',

  // type adapters for custom serialization/deserialization
  // default: [dateAdapter]  (ISO strings → Date objects)
  adapters: [dateAdapter, myDecimalAdapter],

  // full override for JSON parsing (e.g. superjson)
  parseJson: (text) => superjson.parse(text),
});
```

## Result types

The `resultType` on a route entry (or `defaultResultType` on the client) controls how the response body is consumed:

| Value | What you get |
|---|---|
| `JSON` | Parsed object (default) |
| `TEXT` | Raw string |
| `BLOB` | `Blob` |
| `ARRAYBUFFER` | `ArrayBuffer` |
| `STREAM` | `ReadableStream` |
| `AUTO` | JSON if `content-type` is `application/json`, text otherwise |
| `NONE` | Nothing — response body is ignored (useful for DELETE) |

## Type adapters

Adapters hook into both directions: `deserialize` runs during response parsing, `serialize` runs during request body stringification.

The built-in `dateAdapter` converts ISO 8601 strings to `Date` objects on the way in. No `serialize` needed — `Date.prototype.toJSON()` already produces ISO strings.

To use a different date library, swap it out:

```ts
const client = createRestClient(api, baseUrl, {
  adapters: [luxonAdapter],
});
```

See [`docs/adapters/luxon.md`](docs/adapters/luxon.md) for a complete Luxon `DateTime` example.

Pass `adapters: []` to disable all transforms.

## Streaming

Return a `ReadableStream` or Node.js `Readable` from a controller handler and the Express adapter pipes it straight to the response. On the client side, set `resultType: 'STREAM'` on the route entry.

```ts
// contract
const fileApi: ApiDescription<FileApi> = {
  controller: '/files',
  mapping: {
    download: { method: 'GET', path: ':id', resultType: 'STREAM' },
  },
};

// server handler
download: (id) => fs.createReadStream(`./uploads/${id}`),

// client
const stream = await files.download('report.pdf'); // ReadableStream
```

## Logging

The `Logger` interface only requires `error` — `debug` and `warn` are optional:

```ts
// errors only
const client = createRestClient(api, baseUrl, {
  logger: { error: console.error },
});

// silence everything
const client = createRestClient(api, baseUrl, { logging: false });
```

## Examples

The `examples/` directory contains a working contract + client + Express server:

```
examples/
  contract/   shared API contract and domain types
  client/     example fetch client wired up with onResponse / logger
  server/     Express server using createExpressRouter + in-memory store
```

Run `pnpm build` from the repo root to build everything, then `node examples/server/dist/index.js` to start the server.

## Project structure

```
packages/
  core/      @ts-http/core
  express/   @ts-http/express
examples/
  contract/  shared API contract
  client/    example fetch client
  server/    example Express server
```

## Origin

This idea had been sitting in my head for years — I kept writing the same glue code between typed backends and frontends over and over again. When modern agentic coding tools made it fast enough, I finally sat down and vibecoded the first working version in a single afternoon. Here it is.

## License

Free to use, fork and distribute. Attribution is appreciated.
Pull requests and issues are welcome!

[MIT](LICENSE) © 2026 Clemens Meier