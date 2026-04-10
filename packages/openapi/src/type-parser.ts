import * as path from 'node:path';
import * as fs from 'node:fs';
import * as ts from 'typescript';

// ---- Public types ----

export interface SchemaObject {
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'array' | 'object';
    format?: string;
    properties?: Record<string, SchemaObject>;
    required?: string[];
    items?: SchemaObject;
    $ref?: string;
    nullable?: boolean;
    oneOf?: SchemaObject[];
    description?: string;
}

export interface ParameterInfo {
    name: string;
    schema: SchemaObject;
    required: boolean;
}

export interface MethodTypeInfo {
    name: string;
    parameters: ParameterInfo[];
    /** null means the return type is void / no content */
    returnSchema: SchemaObject | null;
    description?: string;
}

export interface ParseResult {
    methods: MethodTypeInfo[];
    /** Named schemas collected during traversal, to be placed in components/schemas */
    schemas: Record<string, SchemaObject>;
}

/**
 * The route mapping entry as read statically from the source AST.
 * Mirrors `RouteEntry` from `@ts-http/core` but without the runtime import.
 */
export interface RouteEntryInfo {
    method: string;
    path: string;
    resultType?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    operationId?: string;
    deprecated?: boolean;
}

/**
 * The result of statically reading an `ApiDescription<X>` variable declaration
 * from the project source — no module loading required.
 */
export interface ContractVariableInfo {
    /** Name of the variable declaration, e.g. `"userApi"`. */
    variableName: string;
    /** The generic type argument name, e.g. `"UserApi"`. */
    interfaceName: string;
    subRoute?: string;
    /** Tag definition derived from the `tag` field of the ApiDescription. */
    tag?: string | { name: string; description?: string };
    mapping: Record<string, RouteEntryInfo>;
}

// ---- Program cache (one tsconfig → one program) ----

let cachedProgram: ts.Program | null = null;
let cachedTsconfigPath: string | null = null;

/**
 * Build (or return cached) a TypeScript program from the nearest tsconfig.json.
 * Recursively follows project references so that all workspace packages are
 * included in the program — works correctly with pnpm / composite monorepos.
 *
 * @param tsconfigPath  Path to tsconfig.json. Defaults to the `tsconfig.json`
 *                      nearest to `process.cwd()`.
 */
export function buildProgram(tsconfigPath?: string): ts.Program {
    const resolvedConfig = tsconfigPath
        ? path.resolve(tsconfigPath)
        : findTsconfig(process.cwd());

    if (cachedProgram && cachedTsconfigPath === resolvedConfig) {
        return cachedProgram;
    }

    const allFiles = collectFilesFromTsconfig(resolvedConfig, new Set());

    const program = ts.createProgram(allFiles, {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
    });

    cachedProgram = program;
    cachedTsconfigPath = resolvedConfig;
    return program;
}

/** Recursively collect all .ts source files, following project references. */
function collectFilesFromTsconfig(tsconfigPath: string, visited: Set<string>): string[] {
    const abs = path.resolve(tsconfigPath);
    if (visited.has(abs)) return [];
    visited.add(abs);

    const configFile = ts.readConfigFile(abs, ts.sys.readFile);
    if (configFile.error) return [];

    const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(abs),
    );

    const files: string[] = [...parsed.fileNames];

    for (const ref of parsed.projectReferences ?? []) {
        const refPath = path.resolve(ref.path, 'tsconfig.json');
        const refAlt = fs.existsSync(refPath) ? refPath : path.resolve(ref.path);
        files.push(...collectFilesFromTsconfig(refAlt, visited));
    }

    return files;
}

function findTsconfig(startDir: string): string {
    let dir = startDir;
    while (true) {
        const candidate = path.join(dir, 'tsconfig.json');
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) throw new Error(`No tsconfig.json found from ${startDir}`);
        dir = parent;
    }
}

// ---- Main entry points ----

/**
 * Statically read an `ApiDescription<X>` variable declaration from the project
 * source — extracts subRoute, mapping entries, and the interface name `X` by
 * walking the AST. No module loading or compilation required.
 *
 * @param variableName  Name of the exported variable (e.g. `"userApi"`).
 * @param tsconfigPath  Optional path to tsconfig.json (auto-detected otherwise).
 */
export function parseContractVariable(variableName: string, tsconfigPath?: string): ContractVariableInfo {
    const program = buildProgram(tsconfigPath);

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;

        let result: ContractVariableInfo | undefined;

        ts.forEachChild(sourceFile, node => {
            if (result || !ts.isVariableStatement(node)) return;
            for (const decl of node.declarationList.declarations) {
                if (!ts.isIdentifier(decl.name) || decl.name.text !== variableName) continue;
                const interfaceName = getApiDescriptionTypeArg(decl);
                if (!interfaceName) continue;
                if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;

                let subRoute: string | undefined;
                let tag: string | { name: string; description?: string } | undefined;
                const mapping: Record<string, RouteEntryInfo> = {};

                for (const prop of decl.initializer.properties) {
                    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
                    const key = prop.name.text;

                    if (key === 'subRoute' && ts.isStringLiteral(prop.initializer)) {
                        subRoute = prop.initializer.text;
                    } else if (key === 'tag') {
                        tag = readTagValue(prop.initializer);
                    } else if (key === 'mapping' && ts.isObjectLiteralExpression(prop.initializer)) {
                        for (const entry of prop.initializer.properties) {
                            if (!ts.isPropertyAssignment(entry) || !ts.isIdentifier(entry.name)) continue;
                            if (!ts.isObjectLiteralExpression(entry.initializer)) continue;
                            const route = readRouteEntry(entry.initializer);
                            if (route) mapping[entry.name.text] = route;
                        }
                    }
                }

                result = { variableName, interfaceName, subRoute, tag, mapping };
            }
        });

        if (result) return result;
    }

    throw new Error(`Variable '${variableName}' not found or not an ApiDescription in the project.`);
}

/**
 * Discover all exported `ApiDescription<X>` variable declarations in the
 * project whose names match `pattern` (supports `*` as a wildcard).
 *
 * Only exported declarations are included — local test stubs are skipped.
 *
 * @param pattern       Optional glob pattern, e.g. `"*Api"`. Omit to return all.
 * @param tsconfigPath  Optional path to tsconfig.json (auto-detected otherwise).
 */
export function findContractVariables(pattern?: string, tsconfigPath?: string): ContractVariableInfo[] {
    const program = buildProgram(tsconfigPath);
    const results: ContractVariableInfo[] = [];

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;

        ts.forEachChild(sourceFile, node => {
            if (!ts.isVariableStatement(node)) return;
            const isExported = node.modifiers?.some(
                m => m.kind === ts.SyntaxKind.ExportKeyword,
            );
            if (!isExported) return;

            for (const decl of node.declarationList.declarations) {
                if (!ts.isIdentifier(decl.name)) continue;
                const varName = decl.name.text;
                if (pattern && !matchesGlob(varName, pattern)) continue;
                const interfaceName = getApiDescriptionTypeArg(decl);
                if (!interfaceName) continue;
                if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;

                let subRoute: string | undefined;
                let tag: string | { name: string; description?: string } | undefined;
                const mapping: Record<string, RouteEntryInfo> = {};

                for (const prop of decl.initializer.properties) {
                    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
                    const key = prop.name.text;
                    if (key === 'subRoute' && ts.isStringLiteral(prop.initializer)) {
                        subRoute = prop.initializer.text;
                    } else if (key === 'tag') {
                        tag = readTagValue(prop.initializer);
                    } else if (key === 'mapping' && ts.isObjectLiteralExpression(prop.initializer)) {
                        for (const entry of prop.initializer.properties) {
                            if (!ts.isPropertyAssignment(entry) || !ts.isIdentifier(entry.name)) continue;
                            if (!ts.isObjectLiteralExpression(entry.initializer)) continue;
                            const route = readRouteEntry(entry.initializer);
                            if (route) mapping[entry.name.text] = route;
                        }
                    }
                }

                results.push({ variableName: varName, interfaceName, subRoute, tag, mapping });
            }
        });
    }

    return results;
}

/**
 * Check that a variable declaration is annotated `ApiDescription<X>` and
 * return the name of `X`, or `undefined` if the type doesn't match.
 */
function getApiDescriptionTypeArg(decl: ts.VariableDeclaration): string | undefined {
    if (!decl.type || !ts.isTypeReferenceNode(decl.type)) return undefined;
    if (!ts.isIdentifier(decl.type.typeName) || decl.type.typeName.text !== 'ApiDescription') return undefined;
    const { typeArguments } = decl.type;
    if (!typeArguments?.length) return undefined;
    const arg = typeArguments[0];
    if (!ts.isTypeReferenceNode(arg) || !ts.isIdentifier(arg.typeName)) return undefined;
    return arg.typeName.text;
}

/** Read a `tag` value — either a plain string or `{ name, description? }` object. */
function readTagValue(node: ts.Expression): string | { name: string; description?: string } | undefined {
    if (ts.isStringLiteral(node)) return node.text;
    if (!ts.isObjectLiteralExpression(node)) return undefined;
    let name: string | undefined;
    let description: string | undefined;
    for (const p of node.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
        if (p.name.text === 'name' && ts.isStringLiteral(p.initializer)) name = p.initializer.text;
        if (p.name.text === 'description' && ts.isStringLiteral(p.initializer)) description = p.initializer.text;
    }
    if (!name) return undefined;
    return description !== undefined ? { name, description } : { name };
}

/** Glob `*` wildcard matching for variable names. */
function matchesGlob(name: string, pattern: string): boolean {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(name);
}

/** Read a RouteEntry-shaped object literal from the AST. */
function readRouteEntry(obj: ts.ObjectLiteralExpression): RouteEntryInfo | undefined {
    const props: Record<string, unknown> = {};

    for (const p of obj.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
        const key = p.name.text;
        const val = p.initializer;

        if (ts.isStringLiteral(val)) {
            props[key] = val.text;
        } else if (val.kind === ts.SyntaxKind.TrueKeyword) {
            props[key] = true;
        } else if (val.kind === ts.SyntaxKind.FalseKeyword) {
            props[key] = false;
        } else if (ts.isArrayLiteralExpression(val)) {
            props[key] = val.elements
                .filter((e): e is ts.StringLiteral => ts.isStringLiteral(e))
                .map(e => e.text);
        }
    }

    if (typeof props['method'] !== 'string' || typeof props['path'] !== 'string') return undefined;
    return props as unknown as RouteEntryInfo;
}

/**
 * name or the source file path.
 *
 * The variable must have an explicit type annotation:
 *   `export const userApi: ApiDescription<UserApi> = { … }`
 *
 * @param variableName  Name of the exported variable (e.g. `"userApi"`).
 *                      When omitted the single `ApiDescription<X>` in the
 *                      project is used; throws if there are multiple.
 * @param tsconfigPath  Optional path to tsconfig.json (auto-detected otherwise).
 */
export function inferInterfaceName(variableName?: string, tsconfigPath?: string): string {
    const program = buildProgram(tsconfigPath);

    const candidates: Array<{ varName: string; ifaceName: string }> = [];

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        ts.forEachChild(sourceFile, node => {
            if (!ts.isVariableStatement(node)) return;
            for (const decl of node.declarationList.declarations) {
                if (!ts.isIdentifier(decl.name)) continue;
                if (variableName && decl.name.text !== variableName) continue;
                const ifaceName = getApiDescriptionTypeArg(decl);
                if (!ifaceName) continue;
                candidates.push({ varName: decl.name.text, ifaceName });
            }
        });
    }

    if (candidates.length === 0) {
        throw new Error(
            variableName
                ? `Could not find variable '${variableName}' with an ApiDescription<X> annotation in the project.`
                : `No ApiDescription<X> variable found in the project.`,
        );
    }
    if (candidates.length > 1 && !variableName) {
        const names = candidates.map(c => `'${c.varName}'`).join(', ');
        throw new Error(
            `Multiple ApiDescription variables found (${names}) — specify variableName to disambiguate.`,
        );
    }
    return candidates[0].ifaceName;
}

/**
 * Search the project for a named interface and extract its method type info.
 *
 * @param interfaceName  Name of the contract interface (e.g. `"UserApi"`).
 * @param tsconfigPath   Optional path to tsconfig.json (auto-detected otherwise).
 */
export function parseContractInterface(interfaceName: string, tsconfigPath?: string): ParseResult {
    const program = buildProgram(tsconfigPath);
    const checker = program.getTypeChecker();

    let interfaceNode: ts.InterfaceDeclaration | undefined;

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        const found = findInterfaceNode(sourceFile, interfaceName);
        if (found) { interfaceNode = found; break; }
    }

    if (!interfaceNode) {
        throw new Error(`Interface '${interfaceName}' not found in the project.`);
    }

    const schemas: Record<string, SchemaObject> = {};
    const methods: MethodTypeInfo[] = [];

    for (const member of interfaceNode.members) {
        if (!ts.isMethodSignature(member) || !ts.isIdentifier(member.name)) continue;

        const methodName = member.name.text;
        const description = extractJsDoc(member);

        const parameters: ParameterInfo[] = [];
        for (const param of member.parameters) {
            if (!ts.isIdentifier(param.name)) continue;
            const paramType = checker.getTypeAtLocation(param);
            parameters.push({
                name: param.name.text,
                schema: typeToSchema(paramType, checker, schemas),
                required: !param.questionToken,
            });
        }

        const sig = checker.getSignatureFromDeclaration(member);
        const rawReturn = sig?.getReturnType() ?? null;
        const returnSchema = rawReturn ? unwrapPromise(rawReturn, checker, schemas) : null;

        methods.push({ name: methodName, parameters, returnSchema, description });
    }

    return { methods, schemas };
}

// ---- Helpers ----

function findInterfaceNode(
    sourceFile: ts.SourceFile,
    name: string,
): ts.InterfaceDeclaration | undefined {
    let found: ts.InterfaceDeclaration | undefined;
    ts.forEachChild(sourceFile, node => {
        if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
            found = node;
        }
    });
    return found;
}

function extractJsDoc(node: ts.Node): string | undefined {
    const tags = ts.getJSDocCommentsAndTags(node);
    const comments = tags
        .filter(ts.isJSDoc)
        .map(doc => (typeof doc.comment === 'string' ? doc.comment : ''))
        .filter(Boolean);
    return comments.length > 0 ? comments.join(' ') : undefined;
}

/**
 * Unwrap Promise<T> → convert T, or return null for Promise<void>.
 */
function unwrapPromise(
    type: ts.Type,
    checker: ts.TypeChecker,
    schemas: Record<string, SchemaObject>,
): SchemaObject | null {
    if (type.symbol?.name === 'Promise') {
        const args = checker.getTypeArguments(type as ts.TypeReference);
        if (args.length > 0) {
            const inner = args[0];
            if (inner.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) return null;
            return typeToSchema(inner, checker, schemas);
        }
    }
    return typeToSchema(type, checker, schemas);
}

/**
 * Recursively convert a TypeScript type to a JSON Schema-compatible object.
 * Named non-primitive types are hoisted into `schemas` and returned as $ref.
 */
function typeToSchema(
    type: ts.Type,
    checker: ts.TypeChecker,
    schemas: Record<string, SchemaObject>,
    /** Guard against infinite recursion for self-referential types */
    visiting = new Set<string>(),
): SchemaObject {
    // Primitives
    if (type.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) return { type: 'string' };
    if (type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) return { type: 'number' };
    if (type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) return { type: 'boolean' };
    if (type.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) return { type: 'null' };
    if (type.flags & ts.TypeFlags.Null) return { type: 'null' };

    // Well-known global types
    const symName = type.symbol?.name;
    if (symName === 'Date') return { type: 'string', format: 'date-time' };
    if (symName === 'ReadableStream') return { type: 'string', format: 'binary' };

    // Union (e.g. string | null, name? → string | undefined)
    if (type.isUnion()) {
        const nonNullable = type.types.filter(
            t => !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)),
        );
        if (nonNullable.length === 1) {
            return { ...typeToSchema(nonNullable[0], checker, schemas, visiting), nullable: true };
        }
        return { oneOf: type.types.map(t => typeToSchema(t, checker, schemas, visiting)) };
    }

    // Array
    if (checker.isArrayType(type)) {
        const args = checker.getTypeArguments(type as ts.TypeReference);
        return {
            type: 'array',
            items: args[0] ? typeToSchema(args[0], checker, schemas, visiting) : {},
        };
    }

    // Object / interface
    if (type.flags & ts.TypeFlags.Object) {
        if (symName && symName !== '__type' && symName !== 'Object') {
            // Named type → hoist to components/schemas
            if (!schemas[symName] && !visiting.has(symName)) {
                visiting.add(symName);
                schemas[symName] = buildObjectSchema(type, checker, schemas, visiting);
                visiting.delete(symName);
            }
            return { $ref: `#/components/schemas/${symName}` };
        }
        // Anonymous inline object (e.g. { name: string; email: string })
        return buildObjectSchema(type, checker, schemas, visiting);
    }

    // Fallback
    return {};
}

function buildObjectSchema(
    type: ts.Type,
    checker: ts.TypeChecker,
    schemas: Record<string, SchemaObject>,
    visiting: Set<string>,
): SchemaObject {
    const properties: Record<string, SchemaObject> = {};
    const required: string[] = [];

    for (const prop of type.getProperties()) {
        const propType = checker.getTypeOfSymbol(prop);
        properties[prop.name] = typeToSchema(propType, checker, schemas, visiting);
        if (!(prop.flags & ts.SymbolFlags.Optional)) {
            required.push(prop.name);
        }
    }

    const schema: SchemaObject = { type: 'object', properties };
    if (required.length > 0) schema.required = required;
    return schema;
}
