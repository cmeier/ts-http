# Luxon DateTime adapter

The built-in `dateAdapter` converts ISO 8601 strings to native `Date` objects. If your project uses [Luxon](https://moment.github.io/luxon/), you can replace it with an adapter that produces `DateTime` instances instead.

## Install

```sh
pnpm add luxon
pnpm add -D @types/luxon
```

## The adapter

```ts
import { DateTime } from 'luxon';
import type { TypeAdapter } from '@ts-http/core';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const luxonAdapter: TypeAdapter = {
  test: (v) => typeof v === 'string' && ISO.test(v),
  deserialize: (v) => DateTime.fromISO(v as string),
  serialize: (v) => v instanceof DateTime ? v.toISO() : v,
};
```

The `test` and `serialize` directions both use the full ISO regex (same pattern as the built-in `ISO` export from `@ts-http/core`) so only valid ISO timestamps are converted — plain date strings like `"2024-01-01"` pass through untouched.

## Usage

Pass the adapter when creating your client. This replaces the default `dateAdapter`:

```ts
import { createRestClient } from '@ts-http/core';
import { luxonAdapter } from './luxon-adapter';

const client = createRestClient(api, baseUrl, {
  adapters: [luxonAdapter],
});
```

Response fields that look like ISO timestamps come back as `DateTime` objects. When you send a `DateTime` in a request body, it serializes back to an ISO string automatically.

## Combining adapters

Adapters are tested in order — the first one whose `test` returns `true` wins. Put more specific adapters first:

```ts
const client = createRestClient(api, baseUrl, {
  adapters: [myDecimalAdapter, luxonAdapter],
});
```

## Type narrowing

TypeScript won't automatically widen types through `JSON.parse`, so your contract types should use `DateTime` (rather than `string`) for date fields if you want the conversion reflected in your type signatures. The adapter handles the runtime side; the types are up to you.
