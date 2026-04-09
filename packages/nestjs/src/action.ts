import { applyDecorators, Get, Post, Put, Delete, Head } from '@nestjs/common';
import type { HttpMethod, RouteEntry } from '@ts-http/core';

const methodToDecorator: Record<HttpMethod, (path: string) => MethodDecorator> = {
    GET: Get,
    POST: Post,
    PUT: Put,
    DELETE: Delete,
    HEAD: Head,
};

type ApiOperationFn = (options: { summary: string }) => MethodDecorator;

let apiOperationFn: ApiOperationFn | undefined;
try {
    const swagger = require('@nestjs/swagger') as { ApiOperation: ApiOperationFn };
    apiOperationFn = swagger.ApiOperation;
} catch {
    // @nestjs/swagger is not installed — ApiOperation will be skipped
}

/**
 * Applies the correct NestJS HTTP method decorator (`@Get`, `@Post`, etc.) and
 * path from a `RouteEntry`, plus `@ApiOperation` if `@nestjs/swagger` is available.
 *
 * @example
 * \@Action(userApi.mapping.getAll)
 * async getAll(): Promise<User[]> { ... }
 *
 * \@Action(userApi.mapping.create, 'Create a new user')
 * async create(\@Body() body: CreateUserDto): Promise<User> { ... }
 */
export function Action(route: RouteEntry, summary?: string): MethodDecorator {
    const httpDecorator = methodToDecorator[route.method];
    if (!httpDecorator) throw new Error(`Unsupported HTTP method: ${route.method}`);

    const path = route.path.replace(/^\//, '');
    const decorators: MethodDecorator[] = [httpDecorator(path)];

    if (apiOperationFn) {
        decorators.push(apiOperationFn({ summary: summary ?? path }));
    }

    return applyDecorators(...decorators);
}
