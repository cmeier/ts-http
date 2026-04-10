import * as path from 'node:path';
import { userApi } from '@examples/contract';
import { writeOpenApi } from '@ts-http/openapi';

// The generator uses the TypeScript compiler API to search the project for
// ApiDescription variables and read their interface types automatically.
// No sourceFile or interfaceName needed — the compiler finds it.
//
// `info` and `tags` are document-level (one per spec), not per group.
// Everything except `contracts` and `outputPath` is optional.
writeOpenApi({
    contracts: [
        { api: userApi, variableName: 'userApi' },
    ],
    serverUrl: 'http://localhost:3000',
    tsconfigPath: path.resolve(__dirname, '../../../tsconfig.json'),
    outputPath: path.resolve(__dirname, '../openapi.json'),
    info: {
        title: 'User API',
        description: 'CRUD and streaming endpoints for user management.',
        version: '0.0.1',
    },
    tags: [
        { name: 'Users', description: 'User resource operations' },
        { name: 'Streams', description: 'Streaming / NDJSON endpoints' },
    ],
});


