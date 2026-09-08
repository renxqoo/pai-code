import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import type { ExtraProps } from 'streamdown';

import { safeExternalUrl } from './safe-external-url';

type StreamdownLinkProps = ComponentProps<'a'> & ExtraProps;

/** 链接出口统一走系统浏览器：Electron 经桥打开（主进程二次校验 http(s)），浏览器直开时降级新标签 */
function openInSystemBrowser(url: string): void {
  if (window.pai) {
    void window.pai.window.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/** 左键与 Cmd/Ctrl+点击都会触发 click，在 Electron 内默认造成应用内导航，一律拦截转系统浏览器 */
function handleClick(event: MouseEvent<HTMLAnchorElement>, url: string): void {
  event.preventDefault();
  openInSystemBrowser(url);
}

/** 中键=新开外部标签的惯用操作；其余辅助键（右键）保留默认行为 */
function handleAuxClick(event: MouseEvent<HTMLAnchorElement>, url: string): void {
  if (event.button !== 1) return;
  event.preventDefault();
  openInSystemBrowser(url);
}

/**
 * streamdown 链接覆写：仅 http(s) 渲染为可点链接，点击一律 openExternal，
 * 渲染层不做应用内导航；非 http(s) 的 href 降级为纯文本 span。
 */
function StreamdownLink({ node: _node, href, children, ...rest }: StreamdownLinkProps): ReactNode {
  const url = safeExternalUrl(href);
  if (url === null) {
    return <span className="break-all">{children}</span>;
  }
  return (
    <a
      {...rest}
      href={url}
      onClick={(event) => handleClick(event, url)}
      onAuxClick={(event) => handleAuxClick(event, url)}
      className="break-all text-link underline decoration-link/40 underline-offset-2 hover:decoration-link"
    >
      {children}
    </a>
  );
}

export { StreamdownLink };
