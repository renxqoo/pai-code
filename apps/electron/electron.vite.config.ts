import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'electron-vite';

import { slimFontsPlugin } from './vite-plugin-slim-fonts';

/**
 * main/preload 只外部化 electron 与 node 内建；workspace 包源码直出打进产物
 * （外部化会让 node 直载包内 .ts 源，其无扩展名相对导入在 ESM 解析下失败）。
 */
const hostExternals = [/^node:/, 'electron'];

// electron-vite 三面默认 minify:false（面向调试），发布产物显式开启 esbuild 压缩
const minifiedBuild = { minify: 'esbuild' } as const;

export default defineConfig({
  main: {
    // v5 默认外部化全部 dependencies（含 workspace 包）→ node 直载 .ts 失败；这里显式打包。
    // 显式 input 走普通构建（不设 input 时 electron-vite 走 lib 模式，而 vite 对
    // ES lib 构建跳过空白压缩，产物体积是全量压缩的两倍）
    build: {
      externalizeDeps: false,
      ...minifiedBuild,
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
        external: hostExternals,
      },
    },
  },
  // 沙箱渲染进程的 preload 必须是 CJS（ESM preload 在 sandbox 下加载失败）；
  // cjs lib 构建不受 vite 空白压缩豁免影响
  preload: {
    build: {
      externalizeDeps: false,
      ...minifiedBuild,
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
    plugins: [react(), tailwindcss(), slimFontsPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
      },
    },
    build: minifiedBuild,
  },
});
