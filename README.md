![ts-http logo](docs/logo.png)

# ts-http

Stop writing the same API calls twice — especially if you're using TypeScript on both the server and the client. 

`ts-http` lets you move your API contract into a shared package and treat HTTP as an implementation detail. You define one TypeScript interface plus a small route mapping, then reuse that same contract everywhere.

![Package diagram showing a shared contract package above client and server; the contract and client use @ts-http/core, the server uses @ts-http/express or @ts-http/nestjs, and @ts-http/openapi is an optional extension for Swagger UI and clients beyond TypeScript](docs/package-architecture.png)

That gives you a few big architectural wins:

- **Contracts live in one place** — usually a dedicated `contract` package shared by frontend and backend.
- **The server only implements an interface** — your communication layer stays focused on typed inputs and outputs instead of framework-specific plumbing.
- **The client usually needs no handwritten implementation at all** — `createRestClient` creates it directly from the shared contract.
- **Changes break at compile time** on both sides, instead of drifting out of sync until runtime.

No code generation. No schema files. No runtime validation overhead unless you want it. Just a small config object and TypeScript doing what it's good at.
Simple, yet fully extensible.

Use it with Express, NestJS, custom adapters, Axios, Luxon, or your own serialization strategy — the contract stays the stable center of the system.

If that's not enough, you can still generate an `openapi.json` with [`@ts-http/openapi`](packages/openapi/README.md) — which opens the door to the entire OpenAPI ecosystem: Swagger UI, Postman, client code generation in any language, API gateways, and much more.

## Packages

| Package | Description |
|---|---|
| [`@ts-http/core`](packages/core/README.md) | Contract types + typed fetch client (browser & Node 18+) |
| [`@ts-http/express`](packages/express/README.md) | Express router adapter |
| [`@ts-http/nestjs`](packages/nestjs/README.md) | NestJS `@Action` decorator + `TypedController` type |
| [`@ts-http/openapi`](packages/openapi/README.md) | OpenAPI 3.0 spec generator — produce an `openapi.json` from your contracts |

## How it works

Define a contract — an interface plus a route mapping:

```ts
import { ApiDescription } from '@ts-http/core';

interface MyApi {
  helloWorld(): Promise<{ message: string }>;
}

const myApi: ApiDescription<MyApi> = {
  subRoute: '/api',
  mapping: {
    helloWorld: { 
      method: 'GET', 
      path: 'hello-world' 
    },
  },
};
```

Pass it to `createRestClient`. No base URL needed (unless you want to) — leave it out and requests go to the same origin, which is what you want in most frontend apps:

```ts
import { createRestClient } from '@ts-http/core';

const client = createRestClient<MyApi>(myApi);

const result = await client.helloWorld(); // { message: string }
```

That's it. The call hits `GET /api/hello-world` on the current origin. TypeScript knows the return type.

## Why this shared-contract architecture works

`ts-http` is most useful when you treat the contract as its own module, separate from both the UI and the server framework:

1. **A shared contract package defines the API** — for example `@my-app/contract` exports the `UserApi` interface and the `userApi` route map.
2. **The server implements the interface, not the transport** — your controller is just a typed object with business logic. Express or NestJS only adapts HTTP requests to that interface.
3. **The client is derived from the same contract** — instead of maintaining a second handwritten service layer, `createRestClient(userApi)` gives you one immediately.
4. **Framework choices stay flexible** — the contract can outlive an adapter change, so your communication layer is less coupled to a specific technology.

The one extra dependency worth calling out is that the **client also uses `@ts-http/core`** to create the concrete API client via `createRestClient(...)`.

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
  subRoute: '/api/users',
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

**Express server** — `createExpressRouter` can register a concrete implementation of the contract directly:

```ts
import { createExpressRouter } from '@ts-http/express';

class UserController implements UserApi {
  async getAll() { return db.users.findMany(); }
  async getById(id: string) { return db.users.findById(id); }
  async create(data: { name: string; email: string }) { return db.users.create(data); }
  async update(id: string, data: Partial<User>) { return db.users.update(id, data); }
  async remove(id: string) { await db.users.delete(id); }
}

app.use(userApi.subRoute ?? '/', createExpressRouter(userApi, new UserController()));
```

Or, if you prefer writing route handlers more like in Express, you can pass an object literal typed as `ExpressController<UserApi>`:

```ts
import { createExpressRouter, ExpressController } from '@ts-http/express';

const controller: ExpressController<UserApi> = {
  getAll:  () => db.users.findMany(),
  getById: (id) => db.users.findById(id),
  create:  (data) => db.users.create(data),
  update:  (id, data) => db.users.update(id, data),
  remove:  (id) => db.users.delete(id),
};

app.use(userApi.subRoute ?? '/', createExpressRouter(userApi, controller));
```

When using the `ExpressController<UserApi>` object style, the methods do **not** need to be marked `async` — they can return either a direct value or a `Promise`.

**NestJS server** — if you're using NestJS, the same contract is even simpler to wire up with `@Action`:

```ts
import { Body, Controller, Param } from '@nestjs/common';
import { Action, TypedController } from '@ts-http/nestjs';

@Controller(userApi.subRoute ?? '/')
class UserController implements TypedController<UserApi> {
  @Action(userApi.mapping.getAll)
  getAll() { return db.users.findMany(); }

  @Action(userApi.mapping.getById)
  getById(@Param('id') id: string) { return db.users.findById(id); }

  @Action(userApi.mapping.create)
  create(@Body() data: { name: string; email: string }) { return db.users.create(data); }

  @Action(userApi.mapping.update)
  update(@Param('id') id: string, @Body() data: Partial<User>) {
    return db.users.update(id, data);
  }

  @Action(userApi.mapping.remove)
  remove(@Param('id') id: string) { return db.users.delete(id); }
}
```

No `req`, no `res`, no duplicated route strings — just your business logic.

## Installation

```sh
pnpm add @ts-http/core
pnpm add @ts-http/express  # server side
```

Or with nestjs:

```sh
pnpm add @ts-http/core
pnpm add @ts-http/nestjs  # server side
```

Requires Node 18+ or a modern browser (native `fetch`).

## Client options

With options you can extend your client functionality. If you

```ts
const client = createRestClient<MyApi>(
  api, 
  baseUrl, // if undefined the url is treated relative
  {
    // swap in a custom fetch (e.g. for tests or environments without global fetch)
    fetch: myFetch,

    // called on every response — ideal for auth refresh, toast notifications etc.
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
  }
);
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
| `AUTO` | Best-effort content-type handling: parse JSON responses automatically, otherwise return text |
| `NONE` | Nothing — response body is ignored (useful for DELETE) |

`AUTO` is intentionally conservative. For binary downloads or streaming endpoints, prefer the explicit `BLOB`, `ARRAYBUFFER`, or `STREAM` result types.

## Type adapters

Adapters hook into both directions: `deserialize` runs during response parsing, `serialize` runs during request body stringification.

The built-in `dateAdapter` converts ISO 8601 strings to `Date` objects on the way in. No `serialize` needed — `Date.prototype.toJSON()` already produces ISO strings.

To use a different date library, swap it out:

```ts
const client = createRestClient(api, baseUrl, {
  adapters: [luxonAdapter],
});
```

See [`docs/adapters/luxon.md`](docs/adapters/luxon.md) for a complete Luxon `DateTime` example, and [`docs/adapters/axios.md`](docs/adapters/axios.md) to swap in Axios as the HTTP client.

Pass `adapters: []` to disable all transforms.

## Streaming

Return a `ReadableStream` or Node.js `Readable` from a controller handler and the Express adapter pipes it straight to the response. On the client side, set `resultType: 'STREAM'` on the route entry.

```ts
// contract
const fileApi: ApiDescription<FileApi> = {
  subRoute: '/files',
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
  core/      @ts-http/core    — contract types + typed fetch client
  express/   @ts-http/express  — Express router adapter
  nestjs/    @ts-http/nestjs   — NestJS @Action decorator + TypedController
  openapi/   @ts-http/openapi  — OpenAPI 3.0 spec generator
examples/
  contract/  shared API contract and domain types
  client/    example fetch client
  server/    example Express server
  openapi/   Swagger UI + generated openapi.json
```

## Origin

This idea had been sitting in my head for years — I kept writing the same glue code between typed backends and frontends over and over again. When modern agentic coding tools made it fast enough, I finally sat down and vibecoded the first working version in a single afternoon. Here it is.

## License

Free to use and share under the MIT license.

If you have ideas, fixes, or improvements, please open an issue or submit a pull request here — collaboration on this repository is strongly encouraged, and I'd love to keep improving `ts-http` together with the community.

[MIT](LICENSE) © 2026 Clemens Meier