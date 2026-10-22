import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/estudo-ia-aprendizado/*.test.ts'], environment: 'node' } });
