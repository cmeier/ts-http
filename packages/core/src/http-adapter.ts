/**
 * Minimal request descriptor passed to every HttpAdapter.
 */
export type HttpAdapterRequest = {
    url: string;
    method: string;
    headers: Record<string, string>;
    /** Serialized request body (JSON string). Absent for GET/HEAD and bodyless requests. */
    body?: string;
};

/**
 * Minimal response interface that every HttpAdapter must return.
 * The native `Response` from `fetch` satisfies this structurally,
 * so no wrapping is needed on the default path.
 */
export type HttpAdapterResponse = {
    ok: boolean;
    status: number;
    statusText: string;
    headers: { get(name: string): string | null };
    text(): Promise<string>;
    blob(): Promise<Blob>;
    arrayBuffer(): Promise<ArrayBuffer>;
    body: ReadableStream<Uint8Array> | null;
};

/**
 * A function that performs an HTTP request and returns an `HttpAdapterResponse`.
 * Implement this to swap in any HTTP client (axios, ky, got, undici, …).
 *
 * @example Minimal fetch-based adapter (equivalent to the built-in default):
 * ```ts
 * const fetchAdapter: HttpAdapter = (req) =>
 *   fetch(req.url, { method: req.method, headers: req.headers, body: req.body, credentials: 'include' });
 * ```
 *
 * @see {@link https://github.com/your-org/ts-http/blob/main/docs/adapters/axios.md Axios adapter}
 */
export type HttpAdapter = (request: HttpAdapterRequest) => Promise<HttpAdapterResponse>;
