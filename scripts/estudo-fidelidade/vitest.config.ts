import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/estudo-fidelidade/*.test.ts'], environment: 'node' } });
