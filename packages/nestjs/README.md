# @ts-http/nestjs

[![npm](https://img.shields.io/npm/v/@ts-http/nestjs)](https://www.npmjs.com/package/@ts-http/nestjs)
[![GitHub](https://img.shields.io/badge/github-cmeier%2Fts--http-blue)](https://github.com/cmeier/ts-http)

NestJS adapter for [ts-http](https://github.com/cmeier/ts-http). Bind contract routes to NestJS controller methods with a single `@Action` decorator — no string duplication, compile-time enforcement of every route.

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
import { defineContract } from '@ts-http/core';

export const userApi = defineContract({
  subRoute: '/users',
  mapping: {
    getAll: { method: 'GET',    path: '/users' },
    getOne: { method: 'GET',    path: '/users/:id' },
    create: { method: 'POST',   path: '/users' },
    update: { method: 'PUT',    path: '/users/:id' },
    remove: { method: 'DELETE', path: '/users/:id' },
  },
});
```

Implement the controller using `@Action` and `TypedController`:

```ts
import { Controller, Body, Param } from '@nestjs/common';
import { Action, TypedController } from '@ts-http/nestjs';
import { userApi } from '@my-app/contract';

type UserApi = typeof userApi.mapping;

@Controller(userApi.subRoute ?? '/')
export class UserController implements TypedController<UserApi> {

  @Action(userApi.mapping.getAll, 'List all users')
  async getAll(): Promise<User[]> {
    return db.users.findAll();
  }

  @Action(userApi.mapping.getOne)
  async getOne(@Param('id') id: string): Promise<User> {
    return db.users.findById(id);
  }

  @Action(userApi.mapping.create, 'Create a user')
  async create(@Body() body: CreateUserDto): Promise<User> {
    return db.users.create(body);
  }

  @Action(userApi.mapping.update)
  async update(@Param('id') id: string, @Body() body: UpdateUserDto): Promise<User> {
    return db.users.update(id, body);
  }

  @Action(userApi.mapping.remove)
  async remove(@Param('id') id: string): Promise<void> {
    return db.users.delete(id);
  }
}
```

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

MIT
