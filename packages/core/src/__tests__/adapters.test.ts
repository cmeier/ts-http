import { describe, it, expect } from 'vitest';
import {
    TypeAdapter,
    ISO,
    dateAdapter,
    buildReviver,
    buildReplacer,
} from '../adapters.js';

describe('ISO regex', () => {
    it('matches a UTC ISO 8601 string', () => {
        expect(ISO.test('2024-01-15T10:30:00Z')).toBe(true);
    });

    it('matches a string with milliseconds and UTC', () => {
        expect(ISO.test('2024-01-15T10:30:00.123Z')).toBe(true);
    });

    it('matches a string with timezone offset', () => {
        expect(ISO.test('2024-01-15T10:30:00+05:30')).toBe(true);
    });

    it('does not match a plain date string', () => {
        expect(ISO.test('2024-01-15')).toBe(false);
    });

    it('does not match ordinary strings', () => {
        expect(ISO.test('hello')).toBe(false);
    });

    it('does not match numbers', () => {
        expect(ISO.test('42')).toBe(false);
    });
});

describe('dateAdapter', () => {
    it('test() returns true for ISO strings', () => {
        expect(dateAdapter.test('2024-01-15T10:30:00Z')).toBe(true);
    });

    it('test() returns false for non-ISO strings', () => {
        expect(dateAdapter.test('hello')).toBe(false);
    });

    it('test() returns false for numbers', () => {
        expect(dateAdapter.test(42)).toBe(false);
    });

    it('test() returns false for null', () => {
        expect(dateAdapter.test(null)).toBe(false);
    });

    it('deserialize() converts an ISO string to Date', () => {
        const result = dateAdapter.deserialize!('2024-01-15T10:30:00Z');
        expect(result).toBeInstanceOf(Date);
        expect((result as Date).getFullYear()).toBe(2024);
    });

    it('deserialize() returns the original value for an invalid date string', () => {
        const bad = '2024-01-15T99:99:99Z'; // passes regex but invalid Date
        // Depending on JS engine: NaN check returns original value
        const result = dateAdapter.deserialize!(bad);
        // If the date is invalid, we get back the string
        expect(result).toBe(bad);
    });

    it('has no serialize method', () => {
        expect(dateAdapter.serialize).toBeUndefined();
    });
});

describe('buildReviver', () => {
    it('converts ISO strings via dateAdapter', () => {
        const reviver = buildReviver([dateAdapter]);
        const result = JSON.parse('"2024-06-01T00:00:00Z"', reviver);
        expect(result).toBeInstanceOf(Date);
    });

    it('leaves non-matching values unchanged', () => {
        const reviver = buildReviver([dateAdapter]);
        const result = JSON.parse('"hello"', reviver);
        expect(result).toBe('hello');
    });

    it('applies first matching adapter only', () => {
        const first: TypeAdapter = { test: (v) => v === 'target', deserialize: () => 'first' };
        const second: TypeAdapter = { test: (v) => v === 'target', deserialize: () => 'second' };
        const reviver = buildReviver([first, second]);
        expect(reviver('', 'target')).toBe('first');
    });

    it('parses a full object with mixed values', () => {
        const reviver = buildReviver([dateAdapter]);
        const parsed = JSON.parse(
            '{"name":"Alice","createdAt":"2024-01-01T00:00:00Z","count":5}',
            reviver
        );
        expect(parsed.name).toBe('Alice');
        expect(parsed.createdAt).toBeInstanceOf(Date);
        expect(parsed.count).toBe(5);
    });
});

describe('buildReplacer', () => {
    it('returns undefined when no adapters have serialize', () => {
        const replacer = buildReplacer([dateAdapter]);
        expect(replacer).toBeUndefined();
    });

    it('uses serialize from a matching adapter', () => {
        const adapter: TypeAdapter = {
            test: (v) => v instanceof Date,
            serialize: (v) => (v as Date).toISOString().split('T')[0],
        };
        const replacer = buildReplacer([adapter]);
        expect(replacer).toBeDefined();
        const date = new Date('2024-03-15T00:00:00Z');
        expect(replacer!('', date)).toBe('2024-03-15');
    });

    it('passes through non-matching values', () => {
        const adapter: TypeAdapter = {
            test: (v) => v instanceof Date,
            serialize: () => 'date',
        };
        const replacer = buildReplacer([adapter]);
        expect(replacer!('', 'hello')).toBe('hello');
    });

    it('applies first matching adapter only', () => {
        const first: TypeAdapter = { test: (v) => v === 42, serialize: () => 'first' };
        const second: TypeAdapter = { test: (v) => v === 42, serialize: () => 'second' };
        const replacer = buildReplacer([first, second]);
        expect(replacer!('', 42)).toBe('first');
    });
});
