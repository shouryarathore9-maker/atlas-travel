import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 180000, // first run downloads a MongoDB binary for mongodb-memory-server
  },
});
