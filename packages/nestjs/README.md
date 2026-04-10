![ts-http logo](./logo.svg)

# @ts-http/nestjs

[![npm](https://img.shields.io/npm/v/@ts-http/nestjs)](https://www.npmjs.com/package/@ts-http/nestjs)
[![GitHub](https://img.shields.io/badge/github-cmeier%2Fts--http-blue)](https://github.com/cmeier/ts-http)

NestJS adapter for [ts-http](https://github.com/cmeier/ts-http). Bind contract routes to NestJS controller methods with a single `@Action` decorator — no string duplication, compile-time enforcement of every route, and for many setups an even simpler server integration than Express.

## Installation

```sh
npm install @ts-http/core @ts-http/nestjs
# or
pnpm add @ts-http/core @ts-http/nestjs
```

**Peer dependencies** (install separately):

| Package | Required |
|---|---|
| `@nestjs/common` | ✅ yes |
| `@nestjs/core` | ✅ yes |
| `reflect-metadata` | ✅ yes |
| `@nestjs/swagger` | optional |

## Usage

Define a contract (typically in a shared package):

```ts
// contract/src/index.ts
import { ApiDescription } from '@ts-http/core';

export interface UserApi {
  getAll(): Promise<User[]>;
  getOne(id: string): Promise<User>;
  create(data: { name: string; email: string }): Promise<User>;
  update(id: string, data: { name?: string; email?: string }): Promise<User>;
  remove(id: string): Promise<void>;
}

export const userApi: ApiDescription<UserApi> = {
  subRoute: '/api/users',
  mapping: {
    getAll:  { method: 'GET',    path: '' },
    getOne:  { method: 'GET',    path: ':id' },
    create:  { method: 'POST',   path: '' },
    update:  { method: 'PUT',    path: ':id' },
    remove:  { method: 'DELETE', path: ':id' },
  },
};
```

Implement the controller using `@Action` and `TypedController`:

```ts
import { Controller, Body, Param } from '@nestjs/common';
import { Action, TypedController } from '@ts-http/nestjs';
import { userApi, UserApi } from '@my-app/contract';

@Controller(userApi.subRoute ?? '/')
export class UserController implements TypedController<UserApi> {
  @Action(userApi.mapping.getAll)
  getAll() {
    return db.users.findAll();
  }

  @Action(userApi.mapping.getById)
  getById(@Param('id') id: string) {
    return db.users.findById(id);
  }

  @Action(userApi.mapping.create)
  create(@Body() body: { name: string; email: string }) {
    return db.users.create(body);
  }

  @Action(userApi.mapping.update)
  update(@Param('id') id: string, @Body() body: { name?: string; email?: string }) {
    return db.users.update(id, body);
  }

  @Action(userApi.mapping.remove)
  remove(@Param('id') id: string) {
    return db.users.delete(id);
  }
}
```

This uses the same `userApi` contract as the Express example, but with less wiring because NestJS already handles parameter and body injection via decorators.

`@Action` takes the route entry directly from the contract mapping and applies the correct NestJS HTTP method decorator and path. `TypedController<UserApi>` enforces that every method in the contract is implemented with a matching return type — missing or mistyped methods are a compile error.

## API

### `@Action(route, summary?)`

Method decorator. Applies the correct NestJS HTTP method decorator (`@Get`, `@Post`, `@Put`, `@Delete`, or `@Head`) and path from a `RouteEntry`. If `@nestjs/swagger` is installed, also applies `@ApiOperation({ summary })`.

| Parameter | Type | Description |
|---|---|---|
| `route` | `RouteEntry` | A route entry from the contract mapping |
| `summary` | `string` (optional) | Swagger operation summary |

### `TypedController<TContract>`

Utility type. Enforces that the controller class implements every key from the contract's mapping with a matching return type. Parameter types are left loose (`any[]`) because NestJS injects them via its own decorator system at runtime.

```ts
implements TypedController<typeof myApi.mapping>
```

## Swagger

`@nestjs/swagger` is optional. When it is installed, `@Action` automatically adds `@ApiOperation` with the route path (or the `summary` argument) as the summary. No extra setup required.

## License

[MIT](https://github.com/cmeier/ts-http/blob/main/LICENSE) © 2026 Clemens Meier
