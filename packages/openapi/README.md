# @ts-http/openapi

[![npm](https://img.shields.io/npm/v/@ts-http/openapi)](https://www.npmjs.com/package/@ts-http/openapi)

OpenAPI 3.0 spec generator for [ts-http](https://github.com/cmeier/ts-http) contracts.

Reads your existing `ApiDescription` variable and TypeScript interface — no decorators, no schema files, no separate annotation layer. Types are extracted at build time via the TypeScript compiler API.

## Installation

```sh
npm install --save-dev @ts-http/openapi
# or
pnpm add -D @ts-http/openapi
```

## How it works

You define your API contract once — a TypeScript interface plus an `ApiDescription` mapping:

```ts
// examples/contract/src/index.ts
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
        getAll:   { method: 'GET',    path: '',      tags: ['Users'], summary: 'List all users' },
        getById:  { method: 'GET',    path: ':id',   tags: ['Users'], summary: 'Get a user by ID' },
        create:   { method: 'POST',   path: '',      tags: ['Users'], summary: 'Create a new user' },
        update:   { method: 'PUT',    path: ':id',   tags: ['Users'], summary: 'Update a user' },
        remove:   { method: 'DELETE', path: ':id',   tags: ['Users'], summary: 'Delete a user', resultType: 'NONE' },
        streamAll:{ method: 'GET',    path: 'stream',tags: ['Streams'],summary: 'Stream all users', resultType: 'STREAM' },
    },
};
```

The generator walks the TypeScript compiler API to:
- Resolve the `UserApi` generic argument from the `ApiDescription<UserApi>` annotation
- Extract method signatures, parameter types, and return types
- Collect named types (e.g. `User`) into `components/schemas` as `$ref`s
- Emit a complete OpenAPI 3.0.3 document

The output for the contract above:

```json
{
  "openapi": "3.0.3",
  "info": { "title": "User API", "version": "0.0.1" },
  "paths": {
    "/api/users": {
      "get": {
        "operationId": "getAll",
        "summary": "List all users",
        "tags": ["Users"],
        "responses": {
          "200": {
            "content": { "application/json": { "schema": { "type": "array", "items": { "$ref": "#/components/schemas/User" } } } }
          }
        }
      },
      "post": {
        "operationId": "create",
        "summary": "Create a new user",
        "tags": ["Users"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": { "name": { "type": "string" }, "email": { "type": "string" } },
                "required": ["name", "email"]
              }
            }
          }
        },
        "responses": { "200": { "content": { "application/json": { "schema": { "$ref": "#/components/schemas/User" } } } } }
      }
    },
    "/api/users/{id}": { "..." : "..." },
    "/api/users/stream": { "..." : "..." }
  },
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "email": { "type": "string" } },
        "required": ["id", "name", "email"]
      }
    }
  }
}
```

## Usage

### Option A — TypeScript script

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
    info: {
        title: 'User API',
        description: 'CRUD and streaming endpoints for user management.',
        version: '0.0.1',
    },
    tags: [
        { name: 'Users',   description: 'User resource operations' },
        { name: 'Streams', description: 'Streaming / NDJSON endpoints' },
    ],
});
```

Run with `tsx`:

```sh
tsx scripts/generate-openapi.ts
# OpenAPI spec written to /your/project/openapi.json
```

### Option B — JSON config + CLI

Add an `openapi.config.json` to your project root:

```json
{
    "outputPath": "./openapi.json",
    "tsconfigPath": "./tsconfig.json",
    "serverUrl": "http://localhost:3000",
    "info": {
        "title": "User API",
        "version": "0.0.1"
    },
    "tags": [
        { "name": "Users" },
        { "name": "Streams" }
    ],
    "contracts": [
        { "variableName": "userApi" }
    ]
}
```

Then run:

```sh
npx ts-http-openapi
# or, if installed locally:
ts-http-openapi openapi.config.json
```

The CLI reads the config, finds the `userApi` variable in your project (via TypeScript compiler), and writes the spec. No imports, no runtime code.

### Option C — glob pattern discovery

Use `variablePattern` to auto-discover all matching exported `ApiDescription` variables:

```json
{
    "contracts": [{ "variablePattern": "*Api" }]
}
```

This finds every exported variable annotated as `ApiDescription<X>` whose name matches `*Api` (e.g. `userApi`, `orderApi`, `paymentApi`). Each becomes its own route group in the spec.

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
