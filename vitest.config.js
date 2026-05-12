import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    globals: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['worker/src/**/*.js', 'frontend/src/**/*.js'],
      exclude: ['**/node_modules/**', '**/dist/**']
    }
  }
});
