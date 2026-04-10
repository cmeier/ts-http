import * as path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import {
    buildProgram,
    inferInterfaceName,
    parseContractInterface,
    parseContractVariable,
    findContractVariables,
} from '../type-parser.js';

// Root tsconfig — covers all packages and examples via project references
const ROOT_TSCONFIG = path.resolve(__dirname, '../../../../tsconfig.json');

// ---- buildProgram -----------------------------------------------------------

describe('buildProgram', () => {
    it('returns a ts.Program', () => {
        const program = buildProgram(ROOT_TSCONFIG);
        expect(program).toBeDefined();
        expect(typeof program.getSourceFiles).toBe('function');
    });

    it('includes source files from referenced projects', () => {
        const program = buildProgram(ROOT_TSCONFIG);
        const fileNames = program.getSourceFiles().map(sf => sf.fileName);
        // examples/contract is a separate tsconfig project — must be reachable
        const hasContract = fileNames.some(f => f.includes('examples/contract') || f.includes('examples\\contract'));
        expect(hasContract).toBe(true);
    });

    it('resolves types defined in a different package', () => {
        // UserApi lives in examples/contract, type-parser lives in packages/openapi.
        // This verifies cross-project reference resolution actually works.
        const result = parseContractInterface('UserApi', ROOT_TSCONFIG);
        expect(result.methods.length).toBeGreaterThan(0);
        // User is defined in examples/contract, not in packages/openapi
        expect(result.schemas).toHaveProperty('User');
    });

    it('returns cached program on second call', () => {
        const a = buildProgram(ROOT_TSCONFIG);
        const b = buildProgram(ROOT_TSCONFIG);
        expect(a).toBe(b);
    });
});

// ---- inferInterfaceName -----------------------------------------------------

describe('inferInterfaceName', () => {
    it('resolves interface name by variable name', () => {
        const name = inferInterfaceName('userApi', ROOT_TSCONFIG);
        expect(name).toBe('UserApi');
    });

    it('resolves when exactly one ApiDescription variable exists in the project', () => {
        // After fixing the outer-type check, test stubs (excluded by tsconfig)
        // and non-ApiDescription generics are no longer false-positives.
        // The only match is the exported `userApi` in examples/contract.
        const name = inferInterfaceName(undefined, ROOT_TSCONFIG);
        expect(name).toBe('UserApi');
    });

    it('throws when variable is not found', () => {
        expect(() => inferInterfaceName('noSuchVariable', ROOT_TSCONFIG)).toThrow(/noSuchVariable/);
    });

    it('throws when no ApiDescription variable exists and none specified', () => {
        // Re-use the positive test — just verify the throw path a different way:
        // We can't easily create a project with no ApiDescription in tests,
        // but we can test via a non-existent tsconfig path.
        const badConfig = path.resolve(__dirname, '../../../../../nonexistent/tsconfig.json');
        // buildProgram will produce empty file list → no candidates
        expect(() => inferInterfaceName(undefined, badConfig)).toThrow();
    });
});

// ---- parseContractInterface -------------------------------------------------

describe('parseContractInterface', () => {
    let result: Awaited<ReturnType<typeof parseContractInterface>>;

    beforeAll(() => {
        result = parseContractInterface('UserApi', ROOT_TSCONFIG);
    });

    it('finds all methods', () => {
        const names = result.methods.map(m => m.name);
        expect(names).toEqual(expect.arrayContaining([
            'getAll', 'getById', 'create', 'update', 'remove', 'streamAll', 'streamText',
        ]));
        expect(names).toHaveLength(7);
    });

    it('parses a parameterless GET method', () => {
        const getAll = result.methods.find(m => m.name === 'getAll')!;
        expect(getAll.parameters).toHaveLength(0);
        expect(getAll.returnSchema).not.toBeNull();
        // returns User[] — array schema
        expect(getAll.returnSchema?.type).toBe('array');
    });

    it('parses a GET method with a path param', () => {
        const getById = result.methods.find(m => m.name === 'getById')!;
        expect(getById.parameters).toHaveLength(1);
        expect(getById.parameters[0].name).toBe('id');
        expect(getById.parameters[0].schema.type).toBe('string');
        expect(getById.parameters[0].required).toBe(true);
    });

    it('parses a POST method with an object body', () => {
        const create = result.methods.find(m => m.name === 'create')!;
        expect(create.parameters).toHaveLength(1);
        expect(create.parameters[0].name).toBe('data');
        const schema = create.parameters[0].schema;
        expect(schema.type).toBe('object');
        expect(schema.properties).toHaveProperty('name');
        expect(schema.properties).toHaveProperty('email');
        expect(schema.required).toContain('name');
        expect(schema.required).toContain('email');
    });

    it('parses a PUT method with optional partial body', () => {
        const update = result.methods.find(m => m.name === 'update')!;
        // id param + data param
        expect(update.parameters).toHaveLength(2);
        const data = update.parameters.find(p => p.name === 'data')!;
        const schema = data.schema;
        expect(schema.type).toBe('object');
        // name? and email? are optional → no required array
        expect(schema.required ?? []).not.toContain('name');
    });

    it('parses a void return (DELETE)', () => {
        const remove = result.methods.find(m => m.name === 'remove')!;
        expect(remove.returnSchema).toBeNull();
    });

    it('extracts named schemas (User)', () => {
        expect(result.schemas).toHaveProperty('User');
        const user = result.schemas['User'];
        expect(user.type).toBe('object');
        expect(user.properties).toHaveProperty('id');
        expect(user.properties).toHaveProperty('name');
        expect(user.properties).toHaveProperty('email');
        expect(user.required).toEqual(expect.arrayContaining(['id', 'name', 'email']));
    });

    it('attaches JSDoc description to methods that have it', () => {
        const streamAll = result.methods.find(m => m.name === 'streamAll')!;
        expect(streamAll.description).toBeTruthy();
    });

    it('throws when interface is not found', () => {
        expect(() => parseContractInterface('GhostInterface', ROOT_TSCONFIG)).toThrow(/GhostInterface/);
    });
});

// ---- parseContractVariable --------------------------------------------------

describe('parseContractVariable', () => {
    it('reads the variable name', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.variableName).toBe('userApi');
    });

    it('resolves the interface name', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.interfaceName).toBe('UserApi');
    });

    it('reads subRoute from the object literal', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.subRoute).toBe('/api/users');
    });

    it('reads all mapping entries', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        const keys = Object.keys(info.mapping);
        expect(keys).toEqual(expect.arrayContaining(['getAll', 'getById', 'create', 'update', 'remove']));
    });

    it('reads route method and path', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.mapping['getAll'].method).toBe('GET');
        expect(info.mapping['getAll'].path).toBe('');
        expect(info.mapping['getById'].path).toBe(':id');
    });

    it('reads optional meta fields (tags, summary)', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.mapping['getAll'].tags).toContain('Users');
        expect(info.mapping['getAll'].summary).toBe('List all users');
    });

    it('reads resultType', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.mapping['remove'].resultType).toBe('NONE');
        expect(info.mapping['streamAll'].resultType).toBe('STREAM');
    });

    it('throws when variable is not found', () => {
        expect(() => parseContractVariable('noSuchVar', ROOT_TSCONFIG)).toThrow(/noSuchVar/);
    });

    it('ignores non-ApiDescription variables with the same name structure', () => {
        // Record<HttpMethod, ...> has the same generic shape but is not ApiDescription —
        // parseContractVariable must not match it.
        expect(() => parseContractVariable('methodToDecorator', ROOT_TSCONFIG)).toThrow();
    });
});

// ---- findContractVariables --------------------------------------------------

describe('findContractVariables', () => {
    it('finds exported ApiDescription variables matching a pattern', () => {
        const vars = findContractVariables('*Api', ROOT_TSCONFIG);
        const names = vars.map(v => v.variableName);
        expect(names).toContain('userApi');
    });

    it('only returns exported declarations', () => {
        // Test-local ApiDescription vars (userApiDef, userApiStub, etc.) are NOT exported.
        // The only exported one with pattern *Api is userApi.
        const vars = findContractVariables('*Api', ROOT_TSCONFIG);
        const names = vars.map(v => v.variableName);
        expect(names).not.toContain('userApiDef');
        expect(names).not.toContain('userApiStub');
    });

    it('does NOT match non-ApiDescription variables even when exported', () => {
        // methodToDecorator: Record<HttpMethod, ...> is exported but not ApiDescription
        const vars = findContractVariables('*', ROOT_TSCONFIG);
        const names = vars.map(v => v.variableName);
        expect(names).not.toContain('methodToDecorator');
        expect(names).not.toContain('userController');
    });

    it('returns empty array when no variables match the pattern', () => {
        const vars = findContractVariables('nonExistentPattern_*xyz', ROOT_TSCONFIG);
        expect(vars).toHaveLength(0);
    });

    it('returns all exported ApiDescription variables when no pattern given', () => {
        const vars = findContractVariables(undefined, ROOT_TSCONFIG);
        expect(vars.length).toBeGreaterThan(0);
        expect(vars.every(v => v.interfaceName && v.variableName)).toBe(true);
    });

    it('includes subRoute and mapping data', () => {
        const vars = findContractVariables('userApi', ROOT_TSCONFIG);
        const userApi = vars.find(v => v.variableName === 'userApi')!;
        expect(userApi.subRoute).toBe('/api/users');
        expect(Object.keys(userApi.mapping).length).toBeGreaterThan(0);
    });
});

// ---- parseContractVariable --------------------------------------------------

describe('parseContractVariable', () => {
    it('reads the variable name', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.variableName).toBe('userApi');
    });

    it('resolves the interface name', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.interfaceName).toBe('UserApi');
    });

    it('reads subRoute from the object literal', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.subRoute).toBe('/api/users');
    });

    it('reads all mapping entries', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        const keys = Object.keys(info.mapping);
        expect(keys).toEqual(expect.arrayContaining(['getAll', 'getById', 'create', 'update', 'remove']));
    });

    it('reads route method and path', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.mapping['getAll'].method).toBe('GET');
        expect(info.mapping['getAll'].path).toBe('');
        expect(info.mapping['getById'].path).toBe(':id');
    });

    it('reads optional meta fields (tags, summary)', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.mapping['getAll'].tags).toContain('Users');
        expect(info.mapping['getAll'].summary).toBe('List all users');
    });

    it('reads resultType', () => {
        const info = parseContractVariable('userApi', ROOT_TSCONFIG);
        expect(info.mapping['remove'].resultType).toBe('NONE');
        expect(info.mapping['streamAll'].resultType).toBe('STREAM');
    });

    it('throws when variable is not found', () => {
        expect(() => parseContractVariable('noSuchVar', ROOT_TSCONFIG)).toThrow(/noSuchVar/);
    });

    it('ignores non-ApiDescription variables with the same name structure', () => {
        // Record<HttpMethod, ...> has the same generic shape but is not ApiDescription —
        // parseContractVariable must not match it.
        expect(() => parseContractVariable('methodToDecorator', ROOT_TSCONFIG)).toThrow();
    });
});

// ---- findContractVariables --------------------------------------------------

describe('findContractVariables', () => {
    it('finds exported ApiDescription variables matching a pattern', () => {
        const vars = findContractVariables('*Api', ROOT_TSCONFIG);
        const names = vars.map(v => v.variableName);
        expect(names).toContain('userApi');
    });

    it('only returns exported declarations', () => {
        // Test-local ApiDescription vars (userApiDef, userApiStub, etc.) are NOT exported.
        // The only exported one with pattern *Api is userApi.
        const vars = findContractVariables('*Api', ROOT_TSCONFIG);
        const names = vars.map(v => v.variableName);
        expect(names).not.toContain('userApiDef');
        expect(names).not.toContain('userApiStub');
    });

    it('does NOT match non-ApiDescription variables even when exported', () => {
        // methodToDecorator: Record<HttpMethod, ...> is exported but not ApiDescription
        const vars = findContractVariables('*', ROOT_TSCONFIG);
        const names = vars.map(v => v.variableName);
        expect(names).not.toContain('methodToDecorator');
        expect(names).not.toContain('userController');
    });

    it('returns empty array when no variables match the pattern', () => {
        const vars = findContractVariables('nonExistentPattern_*xyz', ROOT_TSCONFIG);
        expect(vars).toHaveLength(0);
    });

    it('returns all exported ApiDescription variables when no pattern given', () => {
        const vars = findContractVariables(undefined, ROOT_TSCONFIG);
        expect(vars.length).toBeGreaterThan(0);
        expect(vars.every(v => v.interfaceName && v.variableName)).toBe(true);
    });

    it('includes subRoute and mapping data', () => {
        const vars = findContractVariables('userApi', ROOT_TSCONFIG);
        const userApi = vars.find(v => v.variableName === 'userApi')!;
        expect(userApi.subRoute).toBe('/api/users');
        expect(Object.keys(userApi.mapping).length).toBeGreaterThan(0);
    });
});
