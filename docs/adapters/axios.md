# Axios adapter

The default HTTP client is `fetch`. To use [axios](https://axios-http.com/) instead, write a small adapter function and pass it as `httpAdapter`. No axios package is needed in `@ts-http/core`.

## Install

```sh
pnpm add axios
```

## The adapter

```ts
import axios from 'axios';
import type { HttpAdapter } from '@ts-http/core';

export const axiosAdapter: HttpAdapter = async (req) => {
  const response = await axios({
    url: req.url,
    method: req.method,
    headers: req.headers,
    data: req.body,
    // Return the raw text so @ts-http/core can apply TypeAdapters (e.g. dateAdapter).
    responseType: 'text',
    // Let @ts-http/core handle non-2xx responses — don't throw on error status codes.
    validateStatus: () => true,
  });

  const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.statusText,
    headers: {
      get: (name: string) => {
        const val = response.headers[name.toLowerCase()];
        return val != null ? String(val) : null;
      },
    },
    text: () => Promise.resolve(text),
    blob: () => Promise.reject(new Error('blob() not supported by axiosAdapter')),
    arrayBuffer: () => Promise.reject(new Error('arrayBuffer() not supported by axiosAdapter')),
    body: null,
  };
};
```

## Usage

```ts
import { createRestClient } from '@ts-http/core';
import { axiosAdapter } from './axios-adapter';

const client = createRestClient(api, baseUrl, {
  httpAdapter: axiosAdapter,
});
```

Everything else — `onResponse`, `onError`, `adapters`, logging — works exactly the same as with the default fetch client.

## Notes

**`responseType: 'text'`** is important. By default axios parses JSON itself, which would bypass the TypeAdapter system (e.g. `dateAdapter` converting ISO strings to `Date` objects). Returning the raw text lets `@ts-http/core` run its own reviver.

**`validateStatus: () => true`** prevents axios from throwing on 4xx/5xx responses. `@ts-http/core` reads `response.ok` and handles errors through `onError` / `RestClientError` in the normal way.

**BLOB and ARRAYBUFFER result types** are not supported as written above. If you need binary responses, set `responseType: 'arraybuffer'` or `responseType: 'blob'` in the adapter and expose a proper `arrayBuffer()` / `blob()` method on the returned object.

**Streaming** (`resultType: 'STREAM'`) is not supported through this adapter — `body` is set to `null`. Streaming requires a fetch-based adapter.
