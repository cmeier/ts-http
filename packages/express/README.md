# @ts-http/express

[![npm](https://img.shields.io/npm/v/@ts-http/express)](https://www.npmjs.com/package/@ts-http/express)
[![GitHub](https://img.shields.io/badge/github-cmeier%2Fts--http-blue)](https://github.com/cmeier/ts-http)

Express adapter for [ts-http](https://github.com/cmeier/ts-http). Turns a typed contract into an Express router — no `req`, no `res`, no `next`. Just your business logic.

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

app.use(userApi.controller, createExpressRouter(userApi, controller));
```

The router extracts path params, query strings, and request bodies and passes them as plain arguments to your handlers — matching exactly what `createRestClient` sends.

## Streaming

Return a Node.js `Readable` or a Web `ReadableStream` from a handler and the router pipes it straight to the response:

```ts
// contract
const fileApi: ApiDescription<FileApi> = {
  controller: '/files',
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

[MIT](../../LICENSE) © 2026 Clemens Meier
