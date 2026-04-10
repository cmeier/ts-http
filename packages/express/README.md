![ts-http logo](./logo.svg)

# @ts-http/express

[![npm](https://img.shields.io/npm/v/@ts-http/express)](https://www.npmjs.com/package/@ts-http/express)
[![GitHub](https://img.shields.io/badge/github-cmeier%2Fts--http-blue)](https://github.com/cmeier/ts-http)

Express adapter for [ts-http](https://github.com/cmeier/ts-http). Turns a typed contract into an Express router so your server can implement an interface instead of being coupled to Express request/response plumbing.

Put the contract in a shared package, reuse it on the client, and keep your server communication layer focused on business logic — no `req`, no `res`, no `next` in your actual handlers.

## Installation

```sh
npm install @ts-http/core @ts-http/express
# or
pnpm add @ts-http/core @ts-http/express
```

Express 4 or 5 is required as a peer dependency.

## Usage

Define a contract (typically in a shared package):

```ts
import { ApiDescription } from '@ts-http/core';

interface UserApi {
  getAll(): Promise<User[]>;
  getById(id: string): Promise<User>;
  create(data: { name: string; email: string }): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
  remove(id: string): Promise<void>;
}

const userApi: ApiDescription<UserApi> = {
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

Wire up the router on your Express server:

```ts
import express from 'express';
import { createExpressRouter, ExpressController } from '@ts-http/express';
import { userApi, UserApi } from '@my-app/contract';

const app = express();
app.use(express.json());

const controller: ExpressController<UserApi> = {
  getAll:  () => db.users.findMany(),
  getById: (id) => db.users.findById(id),
  create:  (data) => db.users.create(data),
  update:  (id, data) => db.users.update(id, data),
  remove:  (id) => db.users.delete(id),
};

app.use(userApi.subRoute ?? '/', createExpressRouter(userApi, controller));
```

The router extracts path params, query strings, and request bodies and passes them as plain arguments to your handlers — matching exactly what `createRestClient` sends.

## Why this keeps your server layer clean

With `ts-http`, the contract typically lives in a separate shared package such as `@my-app/contract`. Both the frontend and the server import the same `UserApi` interface and the same `userApi` description.

That means:

- your **Express controller only implements `UserApi`**;
- your **HTTP transport is handled by the adapter**, not spread across your business code;
- your **client does not need a handwritten implementation** — it can be created from the same contract via `createRestClient(userApi)`;
- your API surface stays consistent because route and type changes are checked by TypeScript on both sides.

In practice, Express becomes an adapter detail around a shared contract, not the place where your application protocol is defined.

## Streaming

Return a Node.js `Readable` or a Web `ReadableStream` from a handler and the router pipes it straight to the response:

```ts
// contract
const fileApi: ApiDescription<FileApi> = {
  subRoute: '/files',
  mapping: {
    download: { method: 'GET', path: ':id', resultType: 'STREAM' },
  },
};

// handler
const controller: ExpressController<FileApi> = {
  download: (id) => fs.createReadStream(`./uploads/${id}`),
};
```

## License

[MIT](https://github.com/cmeier/ts-http/blob/main/LICENSE) © 2026 Clemens Meier
