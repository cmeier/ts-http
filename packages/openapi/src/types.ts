// ---- OpenAPI 3.0 document shape (minimal) ----

import type { SchemaObject } from './type-parser.js';

export interface OpenApiDocument {
    openapi: '3.0.3';
    info: { title: string; version: string; description?: string };
    tags?: Array<{ name: string; description?: string }>;
    paths: Record<string, PathItem>;
    components?: { schemas?: Record<string, SchemaObject> };
}

export interface PathItem {
    get?: Operation;
    post?: Operation;
    put?: Operation;
    delete?: Operation;
    head?: Operation;
    patch?: Operation;
}

export interface Operation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    deprecated?: boolean;
    parameters?: OperationParameter[];
    requestBody?: {
        required: boolean;
        content: { 'application/json': { schema: SchemaObject } };
    };
    responses: Record<string, Response>;
}

export interface OperationParameter {
    name: string;
    in: 'path' | 'query' | 'header';
    required: boolean;
    schema: SchemaObject;
}

export interface Response {
    description: string;
    content?: { 'application/json': { schema: SchemaObject } };
}
