<p align="center">
  <img src="./logo.svg" alt="ts-http" />
</p>

# @ts-http/openapi

[![npm](https://img.shields.io/npm/v/@ts-http/openapi)](https://www.npmjs.com/package/@ts-http/openapi)
[![GitHub](https://img.shields.io/badge/github-cmeier%2Fts--http-blue)](https://github.com/cmeier/ts-http)

OpenAPI 3.0 spec generator for [ts-http](https://github.com/cmeier/ts-http) contracts.

Reads your existing `ApiDescription` variable and TypeScript interface — no decorators, no schema files, no separate annotation layer. Types are extracted at build time via the TypeScript compiler API.

## Installation

```sh
npm install --save-dev @ts-http/openapi
# or
pnpm add -D @ts-http/openapi
```

## Quick start

**1. Add an `openapi.config.json` to your project:**

```json
{
    "outputPath": "./openapi.json",
    "info": { "title": "My API", "version": "1.0.0" },
    "contracts": [{ "variablePattern": "*Api" }]
}
```

**2. Run the CLI:**

```sh
npx ts-http-openapi
# or, if installed locally:
ts-http-openapi openapi.config.json
```

That's it. The CLI finds your `tsconfig.json` automatically, scans every TypeScript file it includes, discovers all exported variables annotated as `ApiDescription<X>` whose name matches `*Api` — `userApi`, `orderApi`, `paymentApi`, all of them — and writes the spec.

> **Note:** Variables must have an explicit type annotation to be discovered:
> ```ts
> export const userApi: ApiDescription<UserApi> = { … }  // ✅ found
> export const userApi = { … }                           // ❌ skipped (inferred type)
> ```

## End-to-end example

Given this contract:

```ts
// src/contract.ts
import { ApiDescription } from '@ts-http/core';

export interface UserApi {
    getAll(): Promise<User[]>;
    getById(id: string): Promise<User>;
    create(data: { name: string; email: string }): Promise<User>;
    update(id: string, data: { name?: string; email?: string }): Promise<User>;
    remove(id: string): Promise<void>;
    streamAll(): Promise<ReadableStream<Uint8Array>>;
}

export const userApi: ApiDescription<UserApi> = {
    subRoute: '/api/users',
    mapping: {
        getAll:    { method: 'GET',    path: '',       tags: ['Users'],   summary: 'List all users' },
        getById:   { method: 'GET',    path: ':id',    tags: ['Users'],   summary: 'Get a user by ID' },
        create:    { method: 'POST',   path: '',       tags: ['Users'],   summary: 'Create a new user' },
        update:    { method: 'PUT',    path: ':id',    tags: ['Users'],   summary: 'Update a user' },
        remove:    { method: 'DELETE', path: ':id',    tags: ['Users'],   summary: 'Delete a user',        resultType: 'NONE' },
        streamAll: { method: 'GET',    path: 'stream', tags: ['Streams'], summary: 'Stream all users as NDJSON', resultType: 'STREAM' },
    },
};
```

And this config:

```json
{
    "outputPath": "./openapi.json",
    "tsconfigPath": "./tsconfig.json",
    "serverUrl": "http://localhost:3000",
    "info": {
        "title": "User API",
        "description": "CRUD and streaming endpoints for user management.",
        "version": "0.0.1"
    },
    "tags": [
        { "name": "Users",   "description": "User resource operations" },
        { "name": "Streams", "description": "Streaming endpoints" }
    ],
    "contracts": [{ "variablePattern": "*Api" }]
}
```

Running `ts-http-openapi openapi.config.json` produces a complete OpenAPI 3.0.3 spec with:
- All six paths under `/api/users`
- `User` extracted as a reusable schema in `components/schemas`
- Tag groupings, summaries, and correct response types per `resultType`
- The binary stream endpoint mapped to `application/octet-stream`

## Minimal setup

No `tags`, `summary`, or metadata at all — just types and routes:

```ts
export interface TaskApi {
    getAll(): Promise<Task[]>;
    create(data: { title: string }): Promise<Task>;
    remove(id: string): Promise<void>;
}

export const taskApi: ApiDescription<TaskApi> = {
    subRoute: '/tasks',
    mapping: {
        getAll: { method: 'GET',    path: '' },
        create: { method: 'POST',   path: '' },
        remove: { method: 'DELETE', path: ':id', resultType: 'NONE' },
    },
};
```

```json
{
    "outputPath": "./openapi.json",
    "info": { "title": "Task API", "version": "0.0.1" },
    "contracts": [{ "variablePattern": "*Api" }]
}
```

Swagger UI will show the three endpoints under `/tasks` grouped as one block, using method names as operation IDs (`getAll`, `create`, `remove`), with request/response schemas inferred from the TypeScript types. No grouping sidebar, no summaries — just a working, explorable spec.

## Usage

### Option A — JSON config + CLI (recommended)

The quickest path. Put the config next to your `tsconfig.json` and run:

```sh
ts-http-openapi                         # reads openapi.config.json in cwd
ts-http-openapi path/to/openapi.config.json  # explicit path
```

All paths in the config are resolved relative to the config file itself, so the config is portable.

### Option B — TypeScript script

Useful when you need to import the contract at runtime (e.g. to reuse the same `ApiDescription` object in tests or tooling):

```ts
// scripts/generate-openapi.ts
import * as path from 'node:path';
import { userApi } from '../src/contract';
import { writeOpenApi } from '@ts-http/openapi';

writeOpenApi({
    contracts: [{ api: userApi, variableName: 'userApi' }],
    outputPath: path.resolve(__dirname, '../openapi.json'),
    tsconfigPath: path.resolve(__dirname, '../tsconfig.json'),
    serverUrl: 'http://localhost:3000',
    info: { title: 'User API', version: '0.0.1' },
});
```

Run with `tsx`:

```sh
tsx scripts/generate-openapi.ts
```

## Route metadata

All fields are optional. Add them directly to the mapping entries:

```ts
const userApi: ApiDescription<UserApi> = {
    subRoute: '/api/users',
    mapping: {
        getAll: {
            method: 'GET',
            path: '',
            summary: 'List all users',          // → operation.summary
            description: 'Returns all users.',  // → operation.description
            tags: ['Users'],                    // → operation.tags
            operationId: 'listUsers',           // → operation.operationId (defaults to method name)
            deprecated: true,                   // → operation.deprecated
        },
    },
};
```

## API reference

### `generateOpenApi(options): OpenApiDocument`

Generates and returns an OpenAPI 3.0 document object.

### `writeOpenApi(options): void`

Generates and writes the document to `options.outputPath` as formatted JSON.

### Options

| Field | Type | Description |
|---|---|---|
| `contracts` | `ContractSource[]` | One entry per route group (see below) |
| `outputPath` | `string` | Where to write the JSON file (`writeOpenApi` only) |
| `tsconfigPath` | `string?` | Path to `tsconfig.json`. Defaults to nearest from `cwd` |
| `serverUrl` | `string?` | Base URL added to `servers[0].url` |
| `info` | `object?` | `{ title, description, version }` for the spec `info` block |
| `tags` | `object[]?` | Top-level tag definitions `[{ name, description }]` |

### `ContractSource`

Each contract source must have exactly one of:

| Field | Description |
|---|---|
| `api` + `variableName` | Pass the runtime object and the variable name so the compiler can find its type |
| `variableName` | Static-only: the compiler reads both the mapping and the types from AST — no import required |
| `variablePattern` | Glob: auto-discover all matching exported `ApiDescription` variables (e.g. `"*Api"`) |

## `resultType` mapping

| `resultType` | HTTP response |
|---|---|
| *(default)* | `200` with JSON schema inferred from the return type |
| `'NONE'` | `204 No content` |
| `'STREAM'` | `200` with `{ type: 'string', format: 'binary' }` |

## License

[MIT](https://github.com/cmeier/ts-http/blob/main/LICENSE) © 2026 Clemens Meier
