import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/hopper.ts', 'src/server/index.ts', 'src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  shims: true,
});
