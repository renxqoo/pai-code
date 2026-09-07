import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'electron-vite';

/**
 * main/preload 只外部化 electron 与 node 内建；workspace 包源码直出打进产物
 * （外部化会让 node 直载包内 .ts 源，其无扩展名相对导入在 ESM 解析下失败）。
 */
const hostExternals = [/^node:/, 'electron'];

export default defineConfig({
  main: {
    // v5 默认外部化全部 dependencies（含 workspace 包）→ node 直载 .ts 失败；这里显式打包
    build: { externalizeDeps: false, rollupOptions: { external: hostExternals } },
  },
  // 沙箱渲染进程的 preload 必须是 CJS（ESM preload 在 sandbox 下加载失败）
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        external: hostExternals,
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
      },
    },
  },
});
