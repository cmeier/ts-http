import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, it, expect, afterEach } from 'vitest';

const ROOT_TSCONFIG = path.resolve(__dirname, '../../../../tsconfig.json');
const CLI_SRC = path.resolve(__dirname, '../cli.ts');
const EXAMPLE_CONFIG = path.resolve(__dirname, '../../../../examples/openapi/openapi.config.json');

// Locate tsx's cli.mjs from the pnpm store (works on all platforms; no .cmd wrappers needed).
const PNPM_STORE = path.resolve(__dirname, '../../../../node_modules/.pnpm');
const tsxStoreEntry = fs.readdirSync(PNPM_STORE).find(d => /^tsx@\d/.test(d));
if (!tsxStoreEntry) throw new Error('tsx not found in pnpm store at ' + PNPM_STORE);
const TSX_CLI_MJS = path.join(PNPM_STORE, tsxStoreEntry, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function runCli(args: string[], cwd?: string) {
    return spawnSync(process.execPath, [TSX_CLI_MJS, CLI_SRC, ...args], {
        encoding: 'utf-8',
        cwd: cwd ?? path.dirname(CLI_SRC),
    });
}

describe('CLI – openapi.config.json', () => {
    const tmpDir = os.tmpdir();
    const outPath = path.join(tmpDir, `ts-http-openapi-test-${Date.now()}.json`);
    const cfgPath = path.join(tmpDir, `ts-http-openapi-config-${Date.now()}.json`);

    afterEach(() => {
        for (const f of [outPath, cfgPath]) {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        }
    });

    it('generates output from a JSON config file', () => {
        const config = {
            outputPath: outPath,
            tsconfigPath: ROOT_TSCONFIG,
            serverUrl: 'http://localhost:3000',
            info: { title: 'CLI Test API', version: '1.0.0' },
            contracts: [{ variableName: 'userApi' }],
        };
        fs.writeFileSync(cfgPath, JSON.stringify(config), 'utf-8');

        const result = runCli([cfgPath]);
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);

        expect(fs.existsSync(outPath)).toBe(true);
        const doc = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
        expect(doc.openapi).toBe('3.0.3');
        expect(doc.info.title).toBe('CLI Test API');
        expect(Object.keys(doc.paths).length).toBeGreaterThan(0);
    });

    it('resolves relative config paths from the config file directory', () => {
        // Uses the real example config which has relative tsconfigPath
        const result = runCli([EXAMPLE_CONFIG], path.dirname(EXAMPLE_CONFIG));
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
    });

    it('exits with code 1 when config file is missing', () => {
        const result = runCli([path.join(tmpDir, 'nonexistent.json')]);
        expect(result.status).toBe(1);
        expect(result.output.join('')).toMatch(/not found/i);
    });

    it('exits with code 1 when contracts array is empty', () => {
        const config = { outputPath: outPath, tsconfigPath: ROOT_TSCONFIG, contracts: [] };
        fs.writeFileSync(cfgPath, JSON.stringify(config), 'utf-8');
        const result = runCli([cfgPath]);
        expect(result.status).toBe(1);
    });

    it('exits with code 1 when JSON is malformed', () => {
        fs.writeFileSync(cfgPath, '{ invalid json', 'utf-8');
        const result = runCli([cfgPath]);
        expect(result.status).toBe(1);
    });

    it('discovers contracts via variablePattern in config', () => {
        const config = {
            outputPath: outPath,
            tsconfigPath: ROOT_TSCONFIG,
            contracts: [{ variablePattern: '*Api' }],
        };
        fs.writeFileSync(cfgPath, JSON.stringify(config), 'utf-8');

        const result = runCli([cfgPath]);
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);

        const doc = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
        expect(Object.keys(doc.paths).length).toBeGreaterThan(0);
    });
});
