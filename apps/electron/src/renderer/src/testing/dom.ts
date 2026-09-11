import { GlobalRegistrator } from '@happy-dom/global-registrator';

/**
 * 客户端渲染测试的 DOM 装置（T32 §1.1）：bun test 单进程顺序执行，
 * 惰性幂等注册 happy-dom 全局——SSR（renderToStaticMarkup）测试文件
 * 不经本模块，不付 DOM 成本。React 19 的 act 环境标记一并落下。
 *
 * 定时器说明：GlobalRegistrator 把 window 落成 globalThis 本体，因此 bun
 * 假定时器接管 globalThis.setInterval 后，window.setInterval 调用点天然被
 * 驱动，无需（也禁止）再写 window 别名——window 与 globalThis 同体时别名
 * 会覆盖全局实现并递归自身（挂载期死锁，实测）。仅当 window 是独立对象时
 * 才需要指回全局。
 */

let installed = false;

export function installDom(): void {
  if (installed || typeof document !== 'undefined') return;
  GlobalRegistrator.register();
  // locale 钉死：happy-dom navigator 默认 en-US，而 strings 在模块加载期解析系统
  // 语言——不钉死则「本文件先装 DOM、后续文件再加载 strings」的组合会拿英文文案，
  // 测试结果依赖 bun 的路径执行序（合跑假红/单跑假绿）。属性只读，经 defineProperty 落
  const navigator = (globalThis as { navigator?: Navigator }).navigator;
  if (navigator !== undefined) {
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'zh-CN' });
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['zh-CN'] });
  }
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installed = true;
}
