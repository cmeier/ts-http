#!/usr/bin/env node
/**
 * ts-http-openapi CLI
 *
 * Usage:
 *   ts-http-openapi [config]
 *
 * Reads a JSON config file (default: openapi.config.json in cwd) and writes
 * an OpenAPI 3.0 spec to disk. No TypeScript code required — just a JSON file
 * and an annotated ApiDescription variable somewhere in the project.
 *
 * Example config (openapi.config.json):
 * {
 *   "outputPath": "./openapi.json",
 *   "tsconfigPath": "./tsconfig.json",
 *   "serverUrl": "http://localhost:3000",
 *   "info": { "title": "My API", "version": "1.0.0" },
 *   "tags": [{ "name": "Users" }],
 *   "contracts": [
 *     { "variableName": "userApi" }
 *   ]
 * }
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { writeOpenApi } from './generate.js';
import type { GenerateOptions } from './generate.js';

interface CliConfig extends GenerateOptions {
    outputPath: string;
}

function run() {
    const configArg = process.argv[2] ?? 'openapi.config.json';
    const absConfig = path.resolve(process.cwd(), configArg);

    if (!fs.existsSync(absConfig)) {
        console.error(`Config file not found: ${absConfig}`);
        process.exit(1);
    }

    let config: CliConfig;
    try {
        config = JSON.parse(fs.readFileSync(absConfig, 'utf-8')) as CliConfig;
    } catch (e) {
        console.error(`Failed to parse config: ${(e as Error).message}`);
        process.exit(1);
    }

    if (!config.outputPath) {
        console.error('Config must have an "outputPath" field.');
        process.exit(1);
    }

    if (!Array.isArray(config.contracts) || config.contracts.length === 0) {
        console.error('Config must have a non-empty "contracts" array.');
        process.exit(1);
    }

    const configDir = path.dirname(absConfig);

    // Resolve relative paths from the config file's directory
    if (config.outputPath && !path.isAbsolute(config.outputPath)) {
        config.outputPath = path.resolve(configDir, config.outputPath);
    }
    if (config.tsconfigPath && !path.isAbsolute(config.tsconfigPath)) {
        config.tsconfigPath = path.resolve(configDir, config.tsconfigPath);
    }

    try {
        writeOpenApi(config);
    } catch (e) {
        console.error(`Generation failed: ${(e as Error).message}`);
        process.exit(1);
    }
}

run();
