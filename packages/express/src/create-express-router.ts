import { Router, Request, Response, NextFunction } from 'express';
import { Readable } from 'node:stream';
import type { ApiDescription, RouteEntry } from '@ts-http/core';

/**
 * Maps each contract method to a plain handler with the same signature.
 * The router extracts path params / query / body and calls your handler directly.
 * Handlers may return a Node.js `Readable` or a Web `ReadableStream` for streaming.
 */
export type ExpressController<TContract> = {
    [K in keyof TContract]: TContract[K] extends (
        ...args: infer P
    ) => Promise<infer R>
    ? (...args: P) => R | Promise<R>
    : never;
};

function getPathParamNames(path: string): string[] {
    return [...path.matchAll(/:([a-zA-Z0-9_]+)\??/g)].map((m) => m[1]);
}

/**
 * Reconstructs the argument list the handler expects, mirroring how
 * `createRestClient` packs args into the HTTP request.
 *
 * - Path params    → positional string args (in order of appearance in path)
 * - GET/HEAD       → remaining query fields as trailing object arg (if any)
 * - Everything else → req.body as last arg (if present)
 */
function buildArgs(req: Request, entry: RouteEntry): unknown[] {
    const names = getPathParamNames(entry.path);
    const isRead = entry.method === 'GET' || entry.method === 'HEAD';

    if (names.length === 0) {
        if (isRead) {
            const q = req.query as Record<string, unknown>;
            return Object.keys(q).length > 0 ? [q] : [];
        }
        const body = req.body;
        return body !== undefined ? [body] : [];
    }

    const pathArgs = names
        .map((n) => req.params[n])
        .filter((v) => v !== undefined);

    if (isRead) {
        const remaining = Object.fromEntries(
            Object.entries(req.query as Record<string, unknown>).filter(
                ([k]) => !names.includes(k),
            ),
        );
        return Object.keys(remaining).length > 0
            ? [...pathArgs, remaining]
            : pathArgs;
    }

    const body = req.body;
    const hasBody =
        body !== undefined &&
        body !== null &&
        (typeof body !== 'object' || Object.keys(body).length > 0);

    return hasBody ? [...pathArgs, body] : pathArgs;
}

function toExpressPath(path: string): string {
    return path.startsWith('/') ? path : `/${path}`;
}

function isNodeReadable(val: unknown): val is Readable {
    return (
        val instanceof Readable ||
        (typeof val === 'object' &&
            val !== null &&
            typeof (val as any).pipe === 'function' &&
            typeof (val as any).read === 'function')
    );
}

function isWebReadableStream(val: unknown): val is ReadableStream {
    return (
        typeof ReadableStream !== 'undefined' &&
        val instanceof ReadableStream
    );
}

/**
 * Creates an Express Router from an ApiDescription and a matching controller.
 *
 * Mount the returned router at the controller's base path:
 * ```ts
 * app.use(api.subRoute ?? '/', createExpressRouter(api, controller));
 * ```
 *
 * Handlers may return plain objects (→ JSON), `undefined` (→ 204),
 * a Node.js `Readable`, or a Web `ReadableStream` (→ streamed response).
 */
export function createExpressRouter<TContract>(
    api: ApiDescription<TContract>,
    controller: ExpressController<TContract>,
): Router {
    const router = Router();

    // Register static paths before parameterised ones so that e.g.
    // GET /stream is not swallowed by GET /:id.
    const entries = (Object.keys(api.mapping) as (keyof TContract & string)[]).sort(
        (a, b) => {
            const hasParamA = api.mapping[a].path.includes(':') ? 1 : 0;
            const hasParamB = api.mapping[b].path.includes(':') ? 1 : 0;
            return hasParamA - hasParamB;
        },
    );

    for (const key of entries) {
        const entry = api.mapping[key];
        const expressPath = toExpressPath(entry.path);
        const httpMethod = entry.method.toLowerCase() as
            | 'get'
            | 'post'
            | 'put'
            | 'delete'
            | 'head';

        router[httpMethod](
            expressPath,
            async (req: Request, res: Response, next: NextFunction) => {
                try {
                    const args = buildArgs(req, entry);
                    const handler = (controller as any)[key] as (
                        ...a: unknown[]
                    ) => unknown;
                    const result = await handler(...args);

                    if (result === undefined || entry.resultType === 'NONE') {
                        res.status(204).end();
                        return;
                    }

                    // Node.js Readable stream — pipe directly
                    if (isNodeReadable(result)) {
                        res.setHeader('Content-Type', 'application/octet-stream');
                        result.pipe(res);
                        result.on('error', next);
                        return;
                    }

                    // Web ReadableStream (Node 18+) — bridge to Node Readable then pipe
                    if (isWebReadableStream(result)) {
                        res.setHeader('Content-Type', 'application/octet-stream');
                        Readable.fromWeb(result as any).pipe(res);
                        return;
                    }

                    res.json(result);
                } catch (err) {
                    next(err);
                }
            },
        );
    }

    return router;
}
