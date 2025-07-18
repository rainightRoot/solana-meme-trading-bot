import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['cjs'],
      name: 'main', 
      fileName: () => 'index.cjs', // 👈 控制输出文件名
    },
    outDir: 'dist/main',
    rollupOptions: {
      external: [
        'electron',
        'electron-log',
        'electron-updater',
        'fs',
        'path',
        'node:path',
        'node:fs',
        'node:util',
        'node:http',
        'node:https',
        'node:zlib',
        'node:stream',
        'node:buffer',
        'node:process',
        'node:crypto',
        'node:assert',
        'node:os',
        'node:url',
        'node:net',
        'node:stream/web',
        'os',
        'url',
        'crypto',
        'events',
        'child_process',
        'worker_threads',
        'stream',
        'net',
        'tls',
        'dns',
        'assert',
        'sqlite3',
        'node-bindings',
        'bindings',
        '@jup-ag/api',
        '@solana/web3.js',
        'cross-fetch',
        'node-fetch',
        'proxy-agent',
        'buffer',
        'util',
        'uuid',
        'lodash',
        '@electron-toolkit/utils',
        // electron-store and its dependencies
        'electron-store',
        'conf',
        'atomically',
        'when-exit',
        'env-paths',
        'ajv',
        'ajv-formats',
        'debounce-fn',
        'semver'
      ],
    },
  },
});
