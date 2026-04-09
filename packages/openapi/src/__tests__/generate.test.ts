import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import type { ApiDescription } from '@ts-http/core';
import { generateOpenApi } from '../generate.js';

const ROOT_TSCONFIG = path.resolve(__dirname, '../../../../tsconfig.json');

// Minimal contract that matches the 'UserApi' interface in examples/contract.
// We point variableName to the existing 'userApi' variable so the compiler
// API can find the generic type argument.
const userApiStub: ApiDescription<any> = {
    subRoute: '/api/users',
    mapping: {
        getAll: { method: 'GET', path: '', tags: ['Users'], summary: 'List all users' },
        getById: { method: 'GET', path: ':id', tags: ['Users'], summary: 'Get a user by ID' },
        create: { method: 'POST', path: '', tags: ['Users'], summary: 'Create a new user' },
        update: { method: 'PUT', path: ':id', tags: ['Users'], summary: 'Update a user' },
        remove: { method: 'DELETE', path: ':id', tags: ['Users'], summary: 'Delete a user', resultType: 'NONE' },
        streamAll: { method: 'GET', path: 'stream', tags: ['Streams'], summary: 'Stream all users', resultType: 'STREAM' },
        streamText: { method: 'POST', path: 'stream-text', tags: ['Streams'], summary: 'Stream text', resultType: 'STREAM' },
    },
};

function buildDoc() {
    return generateOpenApi({
        contracts: [{ api: userApiStub, variableName: 'userApi' }],
        tsconfigPath: ROOT_TSCONFIG,
        serverUrl: 'http://localhost:3000',
        info: { title: 'Test API', version: '1.0.0' },
        tags: [{ name: 'Users' }, { name: 'Streams' }],
    });
}

// ---- Document-level structure -----------------------------------------------

describe('generateOpenApi – document structure', () => {
    it('sets openapi version', () => {
        expect(buildDoc().openapi).toBe('3.0.3');
    });

    it('sets info block', () => {
        const doc = buildDoc();
        expect(doc.info.title).toBe('Test API');
        expect(doc.info.version).toBe('1.0.0');
    });

    it('sets servers', () => {
        const doc = buildDoc();
        expect((doc as any).servers?.[0]?.url).toBe('http://localhost:3000');
    });

    it('sets top-level tags', () => {
        const doc = buildDoc();
        const names = (doc.tags ?? []).map((t: any) => t.name);
        expect(names).toContain('Users');
        expect(names).toContain('Streams');
    });

    it('populates components/schemas', () => {
        const doc = buildDoc();
        expect(doc.components?.schemas).toHaveProperty('User');
    });
});

// ---- Path generation --------------------------------------------------------

describe('generateOpenApi – paths', () => {
    it('generates paths for all routes', () => {
        const paths = Object.keys(buildDoc().paths);
        expect(paths).toContain('/api/users');
        expect(paths).toContain('/api/users/{id}');
        expect(paths).toContain('/api/users/stream');
        expect(paths).toContain('/api/users/stream-text');
    });

    it('converts :param to {param}', () => {
        const paths = Object.keys(buildDoc().paths);
        expect(paths).toContain('/api/users/{id}');
        expect(paths.some(p => p.includes(':id'))).toBe(false);
    });
});

// ---- Operation details ------------------------------------------------------

describe('generateOpenApi – operations', () => {
    it('GET /api/users has no requestBody', () => {
        const op = buildDoc().paths['/api/users']?.get;
        expect(op).toBeDefined();
        expect(op!.requestBody).toBeUndefined();
    });

    it('GET /api/users returns 200 with array schema', () => {
        const op = buildDoc().paths['/api/users']?.get!;
        const schema = op.responses['200']?.content?.['application/json']?.schema;
        expect(schema?.type).toBe('array');
    });

    it('GET /api/users/{id} has path parameter', () => {
        const op = buildDoc().paths['/api/users/{id}']?.get!;
        expect(op.parameters).toHaveLength(1);
        expect(op.parameters![0].name).toBe('id');
        expect(op.parameters![0].in).toBe('path');
        expect(op.parameters![0].required).toBe(true);
    });

    it('POST /api/users has requestBody with required fields', () => {
        const op = buildDoc().paths['/api/users']?.post!;
        expect(op.requestBody).toBeDefined();
        expect(op.requestBody!.required).toBe(true);
        const schema = op.requestBody!.content['application/json'].schema;
        expect(schema.type).toBe('object');
        expect(schema.required).toContain('name');
        expect(schema.required).toContain('email');
    });

    it('DELETE /api/users/{id} returns 204 (resultType NONE)', () => {
        const op = buildDoc().paths['/api/users/{id}']?.delete!;
        expect(op.responses['204']).toBeDefined();
        expect(op.responses['200']).toBeUndefined();
    });

    it('STREAM route returns binary schema', () => {
        const op = buildDoc().paths['/api/users/stream']?.get!;
        const schema = op.responses['200']?.content?.['application/json']?.schema;
        expect(schema?.format).toBe('binary');
    });

    it('operationId defaults to method name', () => {
        const op = buildDoc().paths['/api/users']?.get!;
        expect(op.operationId).toBe('getAll');
    });

    it('summary is taken from route entry', () => {
        const op = buildDoc().paths['/api/users']?.get!;
        expect(op.summary).toBe('List all users');
    });

    it('tags are taken from route entry', () => {
        const op = buildDoc().paths['/api/users']?.get!;
        expect(op.tags).toContain('Users');
    });
});

// ---- Multiple contracts -----------------------------------------------------

describe('generateOpenApi – multiple contracts', () => {
    it('merges paths from two contracts', () => {
        const secondApi: ApiDescription<any> = {
            subRoute: '/health',
            mapping: {
                check: { method: 'GET', path: '' },
            },
        };

        // secondApi has no matching ApiDescription variable in the project,
        // so we rely on variableName to disambiguate. Skip the compiler lookup
        // by passing variableName: undefined and relying on the single match.
        // Instead, create a self-contained spec with just the second contract
        // to confirm merging works.

        const doc = generateOpenApi({
            contracts: [
                { api: userApiStub, variableName: 'userApi' },
                { api: secondApi, variableName: 'userApi' }, // same type for test
            ],
            tsconfigPath: ROOT_TSCONFIG,
        });

        const paths = Object.keys(doc.paths);
        expect(paths.some(p => p.startsWith('/api/users'))).toBe(true);
        expect(paths).toContain('/health');
    });
});

// ---- variablePattern --------------------------------------------------------

describe('generateOpenApi – variablePattern', () => {
    it('discovers and generates from exported contracts matching the pattern', () => {
        const doc = generateOpenApi({
            contracts: [{ variablePattern: 'userApi' }],
            tsconfigPath: ROOT_TSCONFIG,
        });
        // Pattern 'userApi' finds the exported userApi variable in examples/contract
        expect(Object.keys(doc.paths).length).toBeGreaterThan(0);
        expect(Object.keys(doc.paths).some(p => p.startsWith('/api/users'))).toBe(true);
    });

    it('throws when pattern matches nothing', () => {
        expect(() =>
            generateOpenApi({
                contracts: [{ variablePattern: 'nonExistent_*xyz' }],
                tsconfigPath: ROOT_TSCONFIG,
            }),
        ).toThrow(/nonExistent_\*xyz/);
    });

    it('throws when contract entry has neither api, variableName nor variablePattern', () => {
        expect(() =>
            generateOpenApi({
                contracts: [{}],
                tsconfigPath: ROOT_TSCONFIG,
            }),
        ).toThrow();
    });
});
