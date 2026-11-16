import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
export default defineConfig([
  ...next,
  ...ts,
  { rules: { 'react-hooks/set-state-in-effect': 'off', 'react-hooks/purity': 'off' } },
  { files: ['desktop/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  globalIgnores([
    '.next/**',
    'out/**',
    'release/**',
    'next-env.d.ts',
    'public/pdf.worker.min.mjs',
    'playwright-report/**',
    'test-results/**',
  ]),
]);
