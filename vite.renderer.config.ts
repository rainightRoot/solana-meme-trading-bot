import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  plugins: [
    react({
      // React插件的默认配置已经包含快速刷新功能
      include: /\.(js|jsx|ts|tsx)$/,
    }),
  ],
  base: './', // ✅ 关键：确保资源使用相对路径
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5174, // HMR端口
    },
    watch: {
      // 监听文件变化
      usePolling: false,
      interval: 100,
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'), // 构建输出到项目内 dist 目录
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.html') // 明确入口文件
    }
  },
  // 确保开发环境下能正确解析模块
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
});