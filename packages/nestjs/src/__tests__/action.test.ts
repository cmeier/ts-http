import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { Action } from '../action.js';
import type { RouteEntry } from '@ts-http/core';

// NestJS RequestMapping decorator stores metadata under these keys on descriptor.value
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

/** Applies a MethodDecorator to a plain function and returns that function. */
function applyTo(decorator: MethodDecorator, fn: () => void): () => void {
    const proto = { fn };
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'fn')!;
    decorator(proto, 'fn', descriptor);
    return descriptor.value as () => void;
}

// ─── basic method mapping ─────────────────────────────────────────────────────

describe('Action — HTTP method mapping', () => {
    const cases: Array<[RouteEntry['method'], RequestMethod]> = [
        ['GET',    RequestMethod.GET],
        ['POST',   RequestMethod.POST],
        ['PUT',    RequestMethod.PUT],
        ['DELETE', RequestMethod.DELETE],
        ['HEAD',   RequestMethod.HEAD],
    ];

    for (const [httpMethod, expected] of cases) {
        it(`maps ${httpMethod} to RequestMethod.${RequestMethod[expected]}`, () => {
            const fn = applyTo(Action({ method: httpMethod, path: 'test' }), () => { });
            expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(expected);
        });
    }
});

// ─── path handling ────────────────────────────────────────────────────────────

describe('Action — path handling', () => {
    it('uses the path as-is when no leading slash', () => {
        const fn = applyTo(Action({ method: 'GET', path: 'users/:id' }), () => { });
        expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe('users/:id');
    });

    it('strips a single leading slash', () => {
        const fn = applyTo(Action({ method: 'GET', path: '/users' }), () => { });
        expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe('users');
    });

    it('normalises an empty path to "/" (NestJS default)', () => {
        const fn = applyTo(Action({ method: 'GET', path: '' }), () => { });
        expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe('/');
    });
});

// ─── error handling ───────────────────────────────────────────────────────────

describe('Action — unsupported method', () => {
    it('throws for an unrecognised HTTP method', () => {
        expect(() => Action({ method: 'PATCH' as any, path: 'x' }))
            .toThrow('Unsupported HTTP method: PATCH');
    });
});

// ─── return type ──────────────────────────────────────────────────────────────

describe('Action — return value', () => {
    it('returns a function (MethodDecorator)', () => {
        const decorator = Action({ method: 'GET', path: 'items' });
        expect(typeof decorator).toBe('function');
    });

    it('accepts an optional summary without throwing', () => {
        expect(() => Action({ method: 'POST', path: 'items' }, 'Create item')).not.toThrow();
    });
});
