import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
// 字体 css 走 vite 标准管线（不经 tailwind 内联）：vite-plugin-slim-fonts 在资产
// 发射前裁掉 woff/ttf 降级源与非拉丁 Geist 子集，被裁掉的字体文件不进产物
import '@fontsource-variable/geist';
import 'katex/dist/katex.min.css';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
