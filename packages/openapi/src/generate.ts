import * as fs from 'fs';
import * as path from 'path';
import type { ApiDescription, RouteEntry } from '@ts-http/core';
import { inferInterfaceName, parseContractInterface, parseContractVariable, findContractVariables } from './type-parser.js';
import type { RouteEntryInfo, ContractVariableInfo } from './type-parser.js';
import type {
    OpenApiDocument,
    Operation,
    OperationParameter,
    PathItem,
} from './types.js';

export interface ContractSource {
    /**
     * The runtime ApiDescription object.
     * When omitted, the mapping is read statically from the source AST
     * using `variableName` — no module loading required.
     */

    api?: ApiDescription<any>;
    /**
     * Name of one exported ApiDescription variable (e.g. `"userApi"`).
     * Required when `api` is omitted and `variablePattern` is not used.
     */
    variableName?: string;
    /**
     * Glob pattern to discover multiple exported ApiDescription variables
     * automatically (e.g. `"*Api"` matches `userApi`, `orderApi`, …).
     * Supports `*` as a wildcard. Each matched variable becomes its own
     * route group in the spec — no code required.
     */
    variablePattern?: string;
}

export interface GenerateOptions {
    /**
     * One entry per controller / route group.
     * Each becomes a set of paths in the generated spec.
     */
    contracts: ContractSource[];
    /** Server base URL (e.g. `"http://localhost:3000"`). */
    serverUrl?: string;
    /**
     * Path to the project's tsconfig.json.
     * Defaults to the nearest tsconfig.json from `process.cwd()`.
     */
    tsconfigPath?: string;
    /**
     * Top-level OpenAPI document info.
     * Covers the whole spec, not any individual route group.
     */
    info?: {
        title?: string;
        description?: string;
        version?: string;
    };
    /**
     * Top-level tag definitions — appear in the Swagger UI sidebar.
     * Referenced from individual route entries via `tags: ['Users']`.
     */
    tags?: Array<{ name: string; description?: string }>;
}

/**
 * Generate an OpenAPI 3.0 document from an ts-http `ApiDescription` and a
 * TypeScript contract interface.
 *
 * Types are extracted at build-time via the TypeScript compiler API.
 * Route metadata (method, path, tags, …) comes from the runtime mapping.
 */
export function generateOpenApi(
    options: GenerateOptions,
): OpenApiDocument {
    const { contracts, serverUrl, info, tags, tsconfigPath } = options;

    const paths: Record<string, PathItem> = {};
    const schemas: Record<string, unknown> = {};

    // Expand variablePattern entries into individual resolved contracts first.
    type Resolved = { api?: ApiDescription<any>; variableName?: string; varInfo?: ContractVariableInfo };
    const resolved: Resolved[] = [];
    for (const source of contracts) {
        if (source.variablePattern) {
            const found = findContractVariables(source.variablePattern, tsconfigPath);
            if (found.length === 0) {
                throw new Error(`No exported ApiDescription variables match pattern '${source.variablePattern}'.`);
            }
            for (const v of found) resolved.push({ varInfo: v });
        } else {
            if (!source.api && !source.variableName) {
                throw new Error('Each ContractSource must have api, variableName, or variablePattern.');
            }
            resolved.push({ api: source.api, variableName: source.variableName });
        }
    }

    // Auto-collected tag definitions: { name → description? }, built while processing contracts.
    const autoTags = new Map<string, string | undefined>();

    for (const { api, variableName, varInfo: preResolved } of resolved) {
        // When api is omitted, read the mapping statically from the AST.
        const varInfo = preResolved ?? (!api ? parseContractVariable(variableName!, tsconfigPath) : undefined);
        const subRoute = api?.subRoute ?? varInfo?.subRoute;
        const mapping = (api?.mapping ?? varInfo?.mapping) as Record<string, RouteEntry | RouteEntryInfo>;

        // Resolve contract-level tag (string shorthand or full definition).
        const rawContractTag = api?.tag ?? varInfo?.tag;
        const contractTagName = typeof rawContractTag === 'string' ? rawContractTag : rawContractTag?.name;
        const contractTagDescription = typeof rawContractTag === 'object' ? rawContractTag?.description : undefined;
        if (contractTagName && !autoTags.has(contractTagName)) {
            autoTags.set(contractTagName, contractTagDescription);
        }

        const interfaceName = varInfo
            ? varInfo.interfaceName
            : inferInterfaceName(variableName, tsconfigPath);
        const parsed = parseContractInterface(interfaceName, tsconfigPath);

        // Merge component schemas (later groups can override if names clash)
        Object.assign(schemas, parsed.schemas);

        const methodsByName = new Map(parsed.methods.map(m => [m.name, m]));

        for (const [methodName, route] of Object.entries(mapping) as [string, RouteEntry | RouteEntryInfo][]) {
            const typeInfo = methodsByName.get(methodName);
            const baseRoute = (subRoute ?? '').replace(/\/$/, '');
            const routePath = route.path ? `${baseRoute}/${route.path}` : baseRoute || '/';

            // Convert Express-style :param to OpenAPI {param}
            const openApiPath = routePath.replace(/:([^/]+)/g, '{$1}');
            const pathParamNames = new Set<string>();
            for (const m of openApiPath.matchAll(/\{([^}]+)\}/g)) pathParamNames.add(m[1]);

            const httpMethod = (route.method as string).toLowerCase() as
                | 'get' | 'post' | 'put' | 'delete' | 'head';
            const isBodyMethod = httpMethod === 'post' || httpMethod === 'put';

            const parameters: OperationParameter[] = [];
            let requestBody: Operation['requestBody'] | undefined;

            if (typeInfo) {
                for (const param of typeInfo.parameters) {
                    if (pathParamNames.has(param.name)) {
                        parameters.push({ name: param.name, in: 'path', required: true, schema: param.schema });
                    } else if (isBodyMethod) {
                        requestBody = {
                            required: param.required,
                            content: { 'application/json': { schema: param.schema } },
                        };
                    } else {
                        if (param.schema.type === 'object' && param.schema.properties) {
                            const required = new Set(param.schema.required ?? []);
                            for (const [propName, propSchema] of Object.entries(param.schema.properties)) {
                                parameters.push({ name: propName, in: 'query', required: required.has(propName), schema: propSchema });
                            }
                        } else {
                            parameters.push({ name: param.name, in: 'query', required: param.required, schema: param.schema });
                        }
                    }
                }
            }

            const resultType = route.resultType ?? 'JSON';
            const returnSchema = typeInfo?.returnSchema ?? null;

            const responses: Operation['responses'] = {};
            if (resultType === 'NONE') {
                responses['204'] = { description: 'No content' };
            } else if (resultType === 'STREAM' || resultType === 'BLOB' || resultType === 'ARRAYBUFFER') {
                responses['200'] = { description: 'OK', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } };
            } else if (resultType === 'TEXT') {
                responses['200'] = { description: 'OK', content: { 'text/plain': { schema: { type: 'string' } } } };
            } else if (returnSchema) {
                // JSON and AUTO: use application/json with the inferred TypeScript schema
                responses['200'] = { description: 'OK', content: { 'application/json': { schema: returnSchema } } };
            } else {
                responses['204'] = { description: 'No content' };
            }
            responses['default'] = { description: 'Error' };

            // Per-route tags override the contract-level tag; contract tag is the fallback.
            const effectiveTags = (route.tags && route.tags.length > 0)
                ? route.tags
                : (contractTagName ? [contractTagName] : undefined);

            const operation: Operation = {
                operationId: route.operationId ?? methodName,
                ...(route.summary && { summary: route.summary }),
                ...(route.description ?? typeInfo?.description ? { description: route.description ?? typeInfo?.description } : {}),
                ...(effectiveTags && { tags: effectiveTags }),
                ...(route.deprecated && { deprecated: true }),
                parameters: parameters.length > 0 ? parameters : undefined,
                requestBody,
                responses,
            };

            if (!paths[openApiPath]) paths[openApiPath] = {};
            (paths[openApiPath] as Record<string, Operation>)[httpMethod] = operation;
        }
    }

    // Merge auto-collected tags with options.tags (options wins on description conflict).
    const optionsTagMap = new Map((tags ?? []).map(t => [t.name, t.description]));
    const mergedTagsMap = new Map<string, string | undefined>([...autoTags]);
    for (const [name, desc] of optionsTagMap) mergedTagsMap.set(name, desc);
    // Also include any tags from options.tags not yet in the map.
    const mergedTags = mergedTagsMap.size > 0
        ? [...mergedTagsMap.entries()].map(([name, description]) =>
            description !== undefined ? { name, description } : { name },
        )
        : undefined;

    const firstTitle = info?.title ?? 'API';

    const doc: OpenApiDocument = {
        openapi: '3.0.3',
        info: {
            title: firstTitle,
            version: info?.version ?? '0.0.1',
            ...(info?.description && { description: info.description }),
        },
        ...(mergedTags && { tags: mergedTags }),
        ...(serverUrl && { servers: [{ url: serverUrl }] } as any),
        paths,
        ...(Object.keys(schemas).length > 0 && { components: { schemas } }),
    };

    return doc;
}

/**
 * Generate an OpenAPI 3.0 document and write it to `outputPath`.
 */
export function writeOpenApi(
    options: GenerateOptions & { outputPath: string },
): void {
    const doc = generateOpenApi(options);
    const absOut = path.resolve(options.outputPath);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    fs.writeFileSync(absOut, JSON.stringify(doc, null, 2), 'utf-8');
    console.log(`OpenAPI spec written to ${absOut}`);
}
