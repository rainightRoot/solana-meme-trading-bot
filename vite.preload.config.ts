import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload.ts',
      formats: ['cjs'],
      name: 'main', 
      fileName: () => 'preload.js', // 👈 控制输出文件名
    },
    outDir: 'dist/preload',
    rollupOptions: {
      external: ['electron'],
    },
  },
});
