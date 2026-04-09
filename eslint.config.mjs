// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        ignores: ['**/dist/**', '**/node_modules/**'],
    },
    {
        rules: {
            // 'any' is unavoidable in a generic HTTP library
            '@typescript-eslint/no-explicit-any': 'off',
            // Allow _prefixed variables to be declared but unused (common in callbacks)
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            // require() is used intentionally for optional peer deps (e.g. @nestjs/swagger)
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
]);
