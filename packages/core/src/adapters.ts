/**
 * A TypeAdapter hooks into both directions of JSON data transfer:
 * - `deserialize`: called during JSON response parsing (via JSON.parse reviver)
 * - `serialize`: called during request body stringification (via JSON.stringify replacer)
 *
 * Only the transform(s) relevant to your use case need to be provided.
 */
export type TypeAdapter = {
    /** Returns true if this adapter should handle the given value. */
    test: (value: unknown) => boolean;
    /** Transform a raw value during JSON deserialization (response parsing). */
    deserialize?: (value: unknown) => unknown;
    /** Transform a value during JSON serialization (request body). */
    serialize?: (value: unknown) => unknown;
};

export const ISO =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Built-in adapter that converts ISO 8601 strings to `Date` objects on the way in.
 * No `serialize` needed — `Date.prototype.toJSON()` already produces ISO strings.
 */
export const dateAdapter: TypeAdapter = {
    test: (v) => typeof v === 'string' && ISO.test(v),
    deserialize: (v) => {
        const d = new Date(v as string);
        return Number.isNaN(d.getTime()) ? v : d;
    },
};

/**
 * Composes adapters into a `JSON.parse` reviver function.
 * Adapters are tested in order; the first match wins.
 */
export function buildReviver(
    adapters: TypeAdapter[],
): (key: string, value: unknown) => unknown {
    return (_key, value) => {
        for (const adapter of adapters) {
            if (adapter.deserialize && adapter.test(value)) {
                return adapter.deserialize(value);
            }
        }
        return value;
    };
}

/**
 * Composes adapters into a `JSON.stringify` replacer function.
 * Adapters are tested in order; the first match wins.
 */
export function buildReplacer(
    adapters: TypeAdapter[],
): ((key: string, value: unknown) => unknown) | undefined {
    const serializers = adapters.filter((a) => a.serialize);
    if (serializers.length === 0) return undefined;
    return (_key, value) => {
        for (const adapter of serializers) {
            if (adapter.test(value)) {
                return adapter.serialize!(value);
            }
        }
        return value;
    };
}
