import type { HttpAdapterResponse } from './http-adapter.js';

export type RestClientErrorContext = {
    method?: string;
    url?: string;
    response?: HttpAdapterResponse;
};

export type RestClientErrorHandler = (
    error: RestClientError,
    context: RestClientErrorContext,
) => void;

export class RestClientError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly url?: string,
        public readonly method?: string,
        public readonly body?: unknown,
        public readonly response?: HttpAdapterResponse,
        public readonly innerError?: any,
    ) {
        super(message);
        this.name = 'RestClientError';
    }
}
