<p align="center">
  <img src="./logo.svg" alt="ts-http" />
</p>

# @ts-http/core

[![npm](https://img.shields.io/npm/v/@ts-http/core)](https://www.npmjs.com/package/@ts-http/core)
[![GitHub](https://img.shields.io/badge/github-cmeier%2Fts--http-blue)](https://github.com/cmeier/ts-http)

Contract types and typed fetch client for [ts-http](https://github.com/cmeier/ts-http).

Define your API once in TypeScript. The types flow to both the client and server — no code generation, no schema files, no runtime validation overhead.

## Installation

```sh
npm install @ts-http/core
# or
pnpm add @ts-http/core
```

Requires Node 18+ or a modern browser (native `fetch`).

## Quick start

```ts
import { ApiDescription, createRestClient } from '@ts-http/core';

interface UserApi {
  getAll(): Promise<User[]>;
  getById(id: string): Promise<User>;
  create(data: { name: string; email: string }): Promise<User>;
  remove(id: string): Promise<void>;
}

const userApi: ApiDescription<UserApi> = {
  subRoute: '/api/users',
  mapping: {
    getAll:  { method: 'GET',    path: '' },
    getById: { method: 'GET',    path: ':id' },
    create:  { method: 'POST',   path: '' },
    remove:  { method: 'DELETE', path: ':id', resultType: 'NONE' },
  },
};

const client = createRestClient<UserApi>(userApi);

const all  = await client.getAll();        // User[]
const user = await client.getById('123'); // User
await client.remove('123');              // void
```

Omitting `baseUrl` sends requests to the current origin — the right default for most browser apps.

## Server adapters

The same interface and `ApiDescription` contract you define for the client can be used on the server too — no duplication, full type safety end-to-end.

- **[`@ts-http/express`](https://www.npmjs.com/package/@ts-http/express)** — turns the contract into an Express router via `createExpressRouter`. Handlers receive plain typed arguments; no `req`/`res`/`next` boilerplate.
- **[`@ts-http/nestjs`](https://www.npmjs.com/package/@ts-http/nestjs)** — use the contract directly in a NestJS controller with the `@Action` decorator and `TypedController` type. No extra adapter layer needed.

## Client options

```ts
const client = createRestClient<MyApi>(api, baseUrl, {
  // swap in a custom fetch (e.g. for tests or environments without global fetch)
  fetch: myFetch,

  // called on every response
  onResponse: async (res, { method, url }) => {
    if (res.status === 401) throw new Error('Unauthorized');
  },

  // called on non-2xx errors or network failures
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
| `AUTO` | Best-effort content-type handling: parse JSON responses automatically, otherwise return text |
| `NONE` | Nothing — response body is ignored (useful for DELETE) |

`AUTO` is intentionally conservative. For binary downloads or streaming endpoints, prefer the explicit `BLOB`, `ARRAYBUFFER`, or `STREAM` result types.

## Type adapters

Adapters hook into both directions: `deserialize` runs during response parsing, `serialize` runs during request body stringification.

The built-in `dateAdapter` converts ISO 8601 strings to `Date` objects on the way in:

```ts
import { dateAdapter } from '@ts-http/core';

const client = createRestClient(api, baseUrl, {
  adapters: [dateAdapter],
});
```

Pass `adapters: []` to disable all transforms.

See the [**Luxon DateTime** adapter](https://github.com/cmeier/ts-http/blob/main/docs/adapters/luxon.md) and [**Axios** adapter](https://github.com/cmeier/ts-http/blob/main/docs/adapters/axios.md) guides for ready-to-use examples.

## Streaming

Set `resultType: 'STREAM'` on a route entry to receive a `ReadableStream`:

```ts
const fileApi: ApiDescription<FileApi> = {
  subRoute: '/files',
  mapping: {
    download: { method: 'GET', path: ':id', resultType: 'STREAM' },
  },
};

const stream = await client.download('report.pdf'); // ReadableStream
```

## Logging

```ts
// errors only
const client = createRestClient(api, baseUrl, {
  logger: { error: console.error },
});

// silence everything
const client = createRestClient(api, baseUrl, { logging: false });
```

## License

[MIT](https://github.com/cmeier/ts-http/blob/main/LICENSE) © 2026 Clemens Meier
