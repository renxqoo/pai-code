import { GlobalRegistrator } from '@happy-dom/global-registrator';

/**
 * 客户端渲染测试的 DOM 装置（T32 §1.1）：bun test 单进程顺序执行，
 * 惰性幂等注册 happy-dom 全局——SSR（renderToStaticMarkup）测试文件
 * 不经本模块，不付 DOM 成本。React 19 的 act 环境标记一并落下。
 */

let installed = false;

export function installDom(): void {
  if (installed || typeof document !== 'undefined') return;
  GlobalRegistrator.register();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installed = true;
}
